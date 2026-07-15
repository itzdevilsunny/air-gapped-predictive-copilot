import asyncio
import json
import logging
import os
import re
import subprocess
import requests
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from simulator import NetworkSimulator, ROUTERS
from models import NetworkIntelligence
from copilot import AirGappedCopilot

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NOC-Backend")

app = FastAPI(title="Air-Gapped Predictive NOC Copilot Backend")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path compatibility middleware to support situations where Vercel strips the /api prefix from routes
@app.middleware("http")
async def add_api_prefix_if_needed(request, call_next):
    path = request.url.path
    if not path.startswith("/api") and path not in ["/docs", "/redoc", "/openapi.json"] and not path.startswith("/ws"):
        request.scope["path"] = "/api" + path
    response = await call_next(request)
    return response

# Initialize engines
simulator = NetworkSimulator(history_length=60)
intelligence = NetworkIntelligence()
copilot = AirGappedCopilot()

# Enriched telemetry history cache to avoid CPU-heavy ML loops on endpoint calls
_enriched_history_cache: Dict[str, List[dict]] = {}

def initialize_enriched_history_cache():
    global _enriched_history_cache
    logger.info("Initializing enriched telemetry history cache...")
    for rid in ROUTERS.keys():
        history = simulator.get_router_history(rid)
        _enriched_history_cache[rid] = []
        for i in range(1, len(history) + 1):
            hist_slice = history[:i]
            latest = hist_slice[-1]
            ai_output = intelligence.predict_node(hist_slice)
            _enriched_history_cache[rid].append({
                **latest,
                "failure_risk": ai_output["failure_risk"],
                "is_anomaly": ai_output["is_anomaly"],
                "anomaly_score": ai_output["anomaly_score"]
            })
    logger.info("Enriched history cache initialized successfully.")

# Train models on startup
@app.on_event("startup")
def train_models():
    logger.info("Generating synthetic dataset and training ML models (XGBoost & Isolation Forest)...")
    train_df = simulator.get_training_data(samples_per_router=400)
    intelligence.train(train_df)
    logger.info("Model training completed successfully. Ready to predict.")
    initialize_enriched_history_cache()

# Connection manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Connection might be dead, handle cleanup separately or ignore here
                pass

manager = ConnectionManager()

# Background loop for simulation broadcasts
simulation_task = None

def compute_step_telemetry():
    """Generates the simulation step and runs predictive ML in a separate thread."""
    step_data = simulator.step()
    enriched_data = {}
    active_alerts = []
    
    for rid, latest_telemetry in step_data.items():
        history = simulator.get_router_history(rid)
        ai_output = intelligence.predict_node(history)
        
        enriched_data[rid] = {
            "telemetry": latest_telemetry,
            "analysis": {
                "failure_risk": ai_output["failure_risk"],
                "is_anomaly": ai_output["is_anomaly"],
                "anomaly_score": ai_output["anomaly_score"],
                "explanation": ai_output["explanation"],
                "root_cause": ai_output["root_cause"],
                "cli_recommendation": ai_output["cli_recommendation"]
            }
        }
        
        # Check for critical alerts (risk > 50% or anomaly or link down)
        if ai_output["failure_risk"] > 50.0 or ai_output["is_anomaly"] or latest_telemetry["link_status"] == 0:
            active_alerts.append({
                "router_id": rid,
                "router_name": latest_telemetry["router_name"],
                "risk_score": ai_output["failure_risk"],
                "root_cause": ai_output["root_cause"],
                "timestamp": latest_telemetry["timestamp"]
            })
            
    return step_data, enriched_data, active_alerts

auto_heal_enabled = True
auto_heal_timers: Dict[str, int] = {}  # router_id -> steps remaining

def sync_telemetry_to_supabase(enriched_data: dict):
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        return
    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/telemetry_snapshots"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        payload = []
        for rid, node in enriched_data.items():
            t = node["telemetry"]
            a = node["analysis"]
            payload.append({
                "router_id": rid,
                "router_name": t["router_name"],
                "cpu": float(t["cpu"]),
                "latency": float(t["latency"]),
                "packet_loss": float(t["packet_loss"]),
                "jitter": float(t["jitter"]),
                "bandwidth": float(t["bandwidth"]),
                "link_status": int(t["link_status"]),
                "failure_risk": float(a["failure_risk"]),
                "is_anomaly": bool(a["is_anomaly"])
            })
        resp = requests.post(url, headers=headers, json=payload, timeout=3.0)
        if resp.status_code not in [200, 201]:
            logger.debug(f"[Supabase Sync] Failed to sync telemetry: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.debug(f"[Supabase Sync] Telemetry sync error: {e}")

def match_playbook_for_alert(router_id: str, root_cause: str) -> dict:
    """Queries Supabase custom playbooks and finds a match for the failure type.
    Falls back to a default playbook sequence if none match.
    """
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    
    custom_playbooks = []
    if supabase_url and supabase_key:
        try:
            url = f"{supabase_url.rstrip('/')}/rest/v1/custom_playbooks"
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}"
            }
            resp = requests.get(url, headers=headers, timeout=3.0)
            if resp.status_code == 200:
                custom_playbooks = resp.json()
        except Exception as e:
            logger.debug(f"[Auto-Heal] Failed to query custom playbooks from Supabase: {e}")
            
    rc_lower = root_cause.lower()
    
    # 1. Look for custom playbooks matching keywords
    matched = None
    if "bgp" in rc_lower or "congestion" in rc_lower or "bandwidth" in rc_lower or "qos" in rc_lower:
        matched = next((p for p in custom_playbooks if any(k in p.get("title", "").lower() for k in ["bgp", "qos", "congestion", "route"])), None)
    elif "flap" in rc_lower or "link" in rc_lower or "carrier" in rc_lower or "port" in rc_lower or "interface" in rc_lower:
        matched = next((p for p in custom_playbooks if any(k in p.get("title", "").lower() for k in ["port", "link", "interface", "sync", "flap"])), None)
    elif "cpu" in rc_lower or "memory" in rc_lower or "leak" in rc_lower:
        matched = next((p for p in custom_playbooks if any(k in p.get("title", "").lower() for k in ["cpu", "memory", "leak", "process", "reset"])), None)

    if matched:
        logger.info(f"[Auto-Heal] Dynamic Match: Found custom Supabase playbook '{matched['title']}' for alert '{root_cause}'")
        return {
            "name": matched["title"],
            "steps": matched["steps"]
        }

    # 2. Fallbacks
    if "bgp" in rc_lower or "congestion" in rc_lower or "bandwidth" in rc_lower or "qos" in rc_lower:
        return {
            "name": "BGP Route Optimization Playbook",
            "steps": [
                { "cmd": "show ip bgp summary", "expectedOutput": ["OSCILLATING neighbor detected"] },
                { "cmd": "configure terminal", "expectedOutput": ["Enter commands"] },
                { "cmd": "router bgp 65001\n neighbor 192.168.10.2 route-map PREFER-PRIMARY in\nexit", "expectedOutput": ["Route map updated"] },
                { "cmd": "clear ip bgp * soft in", "expectedOutput": ["BGP route selection recalculation complete"] }
            ]
        }
    elif "flap" in rc_lower or "link" in rc_lower or "carrier" in rc_lower or "port" in rc_lower or "interface" in rc_lower:
        return {
            "name": "Port Administrative Resync Playbook",
            "steps": [
                { "cmd": "show interfaces status", "expectedOutput": ["Gi0/1 err-disabled"] },
                { "cmd": "configure terminal", "expectedOutput": ["Enter commands"] },
                { "cmd": "interface GigabitEthernet0/1\n shutdown", "expectedOutput": ["changed state to administratively down"] },
                { "cmd": "interface GigabitEthernet0/1\n no shutdown", "expectedOutput": ["changed state to up"] }
            ]
        }
    else:
        return {
            "name": "Nominal Health Check & Diagnostic Playbook",
            "steps": [
                { "cmd": "show ip interface brief", "expectedOutput": ["Interfaces up/up"] },
                { "cmd": "show cpu processes", "expectedOutput": ["CPU utilization normal"] }
            ]
        }

def sync_mitigation_to_supabase(router_id: str, router_name: str, action_taken: str = "automated CLI mitigation script applied"):
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        return
    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/mitigation_logs"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "router_id": router_id,
            "router_name": router_name,
            "status": "resolved",
            "action_taken": action_taken
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=3.0)
        if resp.status_code not in [200, 201]:
            logger.debug(f"[Supabase Sync] Failed to sync mitigation: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.debug(f"[Supabase Sync] Mitigation sync error: {e}")

async def broadcast_telemetry():
    global auto_heal_timers
    while True:
        try:
            # Offload heavy CPU-bound prediction to a thread pool to avoid blocking the event loop
            step_data, enriched_data, active_alerts = await asyncio.to_thread(compute_step_telemetry)
            
            # Async sync to Supabase in separate thread to prevent blocking
            asyncio.create_task(asyncio.to_thread(sync_telemetry_to_supabase, enriched_data))
            
            # Symmetrically update in-memory cache safely on the main thread
            for rid, latest_telemetry in step_data.items():
                analysis_data = enriched_data[rid]["analysis"]
                cached_point = {
                    **latest_telemetry,
                    "failure_risk": analysis_data["failure_risk"],
                    "is_anomaly": analysis_data["is_anomaly"],
                    "anomaly_score": analysis_data["anomaly_score"]
                }
                if rid in _enriched_history_cache:
                    _enriched_history_cache[rid].append(cached_point)
                    if len(_enriched_history_cache[rid]) > simulator.history_length:
                        _enriched_history_cache[rid].pop(0)
            
            # ── Closed-Loop Auto-Heal Orchestrator ──
            if auto_heal_enabled:
                alert_router_ids = {alert["router_id"] for alert in active_alerts}
                
                # Register countdown for new alerts
                for rid in alert_router_ids:
                    # Ignore "ALL" (Space segment solar storm has no router mitigation CLI)
                    if rid != "ALL" and rid not in auto_heal_timers:
                        auto_heal_timers[rid] = 3  # 3 steps = 6 seconds
                        logger.info(f"[Auto-Heal] Scheduled mitigation for {rid} in 6 seconds.")

                # Remove timers for cleared anomalies
                active_timers = list(auto_heal_timers.keys())
                for rid in active_timers:
                    if rid not in alert_router_ids:
                        del auto_heal_timers[rid]
                        logger.info(f"[Auto-Heal] Cancelled scheduled mitigation for {rid} (anomaly resolved).")

                # Tick timers and trigger healing
                for rid in list(auto_heal_timers.keys()):
                    auto_heal_timers[rid] -= 1
                    if auto_heal_timers[rid] <= 0:
                        logger.info(f"[Auto-Heal] Executing automated mitigation CLI script on router {rid}...")
                        
                        # Match playbook for active alert
                        root_cause = enriched_data[rid]["analysis"]["root_cause"]
                        playbook = match_playbook_for_alert(rid, root_cause)
                        
                        from datetime import datetime, timezone
                        rname = ROUTERS.get(rid, rid)
                        run_logs = [
                            f"[LOG] {datetime.now(timezone).isoformat()} - Initializing Automated Auto-Heal Session...",
                            f"[LOG] Target Ground Station Node: {rid} ({rname})",
                            f"[LOG] Trigger Alert: {root_cause}",
                            f"[LOG] Matched Mitigation Strategy: {playbook['name']}",
                            f"[LOG] Establishing SSH tunnel session to router..."
                        ]
                        
                        for step in playbook["steps"]:
                            cmd = step.get("cmd", "")
                            run_logs.append(f"isro-router-{rid.lower()}# {cmd}")
                            outputs = step.get("expectedOutput", [])
                            if isinstance(outputs, list):
                                run_logs.extend(outputs)
                            else:
                                run_logs.append(str(outputs))
                            run_logs.append("")
                            
                        run_logs.extend([
                            f"[LOG] Playbook sequence executed successfully.",
                            f"[LOG] Automated configuration commit complete.",
                            f"[LOG] Closing terminal session."
                        ])
                        
                        # Print console trace to backend log
                        for line in run_logs:
                            logger.info(f"[Auto-Heal SSH Console] {line}")
                            
                        # Apply mitigation on simulator
                        simulator.set_scenario(rid, "normal", duration_steps=0)
                        
                        # Rebuild cache
                        history = simulator.get_router_history(rid)
                        new_cache = []
                        for i in range(1, len(history) + 1):
                            hist_slice = history[:i]
                            latest = hist_slice[-1]
                            ai_output = intelligence.predict_node(hist_slice)
                            new_cache.append({
                                **latest,
                                "failure_risk": ai_output["failure_risk"],
                                "is_anomaly": ai_output["is_anomaly"],
                                "anomaly_score": ai_output["anomaly_score"]
                            })
                        _enriched_history_cache[rid] = new_cache
                        
                        # Remove from timers
                        del auto_heal_timers[rid]

                        # Async sync detailed mitigation log trace to Supabase
                        log_summary = "\n".join(run_logs)
                        action_taken = f"Automated Closed-Loop Auto-Heal: Executed Playbook \"{playbook['name']}\" to mitigate alert \"{root_cause}\". Terminal Trace:\n{log_summary}"
                        asyncio.create_task(asyncio.to_thread(sync_mitigation_to_supabase, rid, rname, action_taken))

                        # Broadcast specific event packet so frontend logs timeline entry
                        await manager.broadcast({
                            "type": "auto_heal_trigger",
                            "router_id": rid,
                            "router_name": rname
                        })

            # Fetch dynamic satellite telemetry
            sat_data = simulator.get_satellite_telemetry()

            # Broadcast latest snapshot
            await manager.broadcast({
                "type": "telemetry_update",
                "data": enriched_data,
                "alerts": active_alerts,
                "satellites": sat_data
            })
            
        except Exception as e:
            logger.error(f"Error in telemetry loop: {e}", exc_info=True)
            
        await asyncio.sleep(2.0)

@app.on_event("startup")
def start_simulation_loop():
    global simulation_task
    simulation_task = asyncio.create_task(broadcast_telemetry())
    logger.info("Simulation broadcasting loop started.")

@app.on_event("shutdown")
def stop_simulation_loop():
    if simulation_task:
        simulation_task.cancel()
        logger.info("Simulation broadcasting loop stopped.")

# --- API Endpoints ---

class FailureTriggerRequest(BaseModel):
    router_id: str
    failure_type: str  # congestion, overload, instability, or normal

class ChatRequest(BaseModel):
    query: str
    router_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

class Chatbot1Request(BaseModel):
    query: str
    history: Optional[List[Dict[str, str]]] = None

class SolarFlareRequest(BaseModel):
    active: bool
    duration_steps: Optional[int] = 30

class MitigationRequest(BaseModel):
    router_id: str

class ConfigUpdateRequest(BaseModel):
    auto_heal_enabled: bool

class DownlinkEventModel(BaseModel):
    id: str
    satName: str
    stationId: str
    startHour: int
    duration: int
    load: int

class ChatSessionEntry(BaseModel):
    session_id: str
    role: str           # 'user' | 'assistant'
    content: str
    router_context: Optional[str] = None
    source: str = 'chitthi'  # 'chitthi' | 'copilot'

class HealthHistoryEntry(BaseModel):
    health_score: int
    active_alerts: int
    solar_flare: bool

# --- Satellite Downlink Schedule Storage ---
SATELLITE_SCHEDULES_FILE = os.path.join(os.path.dirname(__file__), "satellite_schedules.json")

DEFAULT_SATELLITE_SCHEDULES = [
  { "id": "ev1", "satName": "GSAT-30 Telemetry Dump", "stationId": "MCF-HSN", "startHour": 13, "duration": 3, "load": 75 },
  { "id": "ev2", "satName": "CARTOSAT-3 Imaging Download", "stationId": "ISTRAC-BGL", "startHour": 10, "duration": 2, "load": 80 },
  { "id": "ev3", "satName": "RISAT-2B Radar Scan Sync", "stationId": "TRACK-PBL", "startHour": 15, "duration": 2, "load": 70 },
  { "id": "ev4", "satName": "OCEANSAT-3 Sea-surface Data", "stationId": "SDSC-SHAR", "startHour": 10, "duration": 3, "load": 65 }
]

@app.get("/api/satellite-schedules")
def get_satellite_schedules():
    if not os.path.exists(SATELLITE_SCHEDULES_FILE):
        try:
            with open(SATELLITE_SCHEDULES_FILE, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_SATELLITE_SCHEDULES, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to write default satellite schedules: {e}")
            return DEFAULT_SATELLITE_SCHEDULES
    try:
        with open(SATELLITE_SCHEDULES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read satellite schedules: {e}")
        return DEFAULT_SATELLITE_SCHEDULES

@app.post("/api/satellite-schedules")
def save_satellite_schedules(schedules: List[DownlinkEventModel]):
    try:
        payload = [s.dict() for s in schedules]
        with open(SATELLITE_SCHEDULES_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {"status": "success", "count": len(payload)}
    except Exception as e:
        logger.error(f"Failed to save satellite schedules: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save schedules: {str(e)}")


@app.get("/api/routers")
def get_routers():
    return [{"id": rid, "name": name} for rid, name in ROUTERS.items()]

@app.get("/api/router/{router_id}/history")
def get_router_history(router_id: str):
    if router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
        
    # Serve directly from optimized O(1) cache if available
    if router_id in _enriched_history_cache and _enriched_history_cache[router_id]:
        return _enriched_history_cache[router_id]
        
    # Fallback to computing on-the-fly
    history = simulator.get_router_history(router_id)
    history_enriched = []
    for i in range(1, len(history) + 1):
        hist_slice = history[:i]
        latest = hist_slice[-1]
        ai_output = intelligence.predict_node(hist_slice)
        history_enriched.append({
            **latest,
            "failure_risk": ai_output["failure_risk"],
            "is_anomaly": ai_output["is_anomaly"],
            "anomaly_score": ai_output["anomaly_score"]
        })
    return history_enriched

@app.get("/api/router/{router_id}/analysis")
def get_router_analysis(router_id: str):
    if router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
    history = simulator.get_router_history(router_id)
    ai_output = intelligence.predict_node(history)
    return ai_output

@app.post("/api/simulate-failure")
def trigger_failure(req: FailureTriggerRequest):
    if req.router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
    if req.failure_type not in ["normal", "congestion", "overload", "instability"]:
        raise HTTPException(status_code=400, detail="Invalid failure type")
        
    simulator.set_scenario(req.router_id, req.failure_type, duration_steps=30)
    logger.info(f"Manual override: Set {req.router_id} to scenario '{req.failure_type}' for 30 steps.")
    
    # Rebuild in-memory cache for this router immediately to show dynamic trend lines instantly
    rid = req.router_id
    history = simulator.get_router_history(rid)
    new_cache = []
    for i in range(1, len(history) + 1):
        hist_slice = history[:i]
        latest = hist_slice[-1]
        ai_output = intelligence.predict_node(hist_slice)
        new_cache.append({
            **latest,
            "failure_risk": ai_output["failure_risk"],
            "is_anomaly": ai_output["is_anomaly"],
            "anomaly_score": ai_output["anomaly_score"]
        })
    _enriched_history_cache[rid] = new_cache

    return {"status": "success", "message": f"Scenario '{req.failure_type}' triggered on {req.router_id}"}

@app.post("/api/mitigate")
def apply_mitigation(req: MitigationRequest):
    if req.router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
        
    # Set router state back to normal
    simulator.set_scenario(req.router_id, "normal", duration_steps=0)
    logger.info(f"Self-healing: Mitigated failure on {req.router_id}. Router restored to Normal state.")
    
    # Rebuild in-memory cache for this router immediately to show self-healed state instantly
    rid = req.router_id
    history = simulator.get_router_history(rid)
    new_cache = []
    for i in range(1, len(history) + 1):
        hist_slice = history[:i]
        latest = hist_slice[-1]
        ai_output = intelligence.predict_node(hist_slice)
        new_cache.append({
            **latest,
            "failure_risk": ai_output["failure_risk"],
            "is_anomaly": ai_output["is_anomaly"],
            "anomaly_score": ai_output["anomaly_score"]
        })
    _enriched_history_cache[rid] = new_cache

    return {"status": "success", "message": f"Mitigation CLI script applied. Router {req.router_id} restored to Normal state."}

@app.get("/api/config")
def get_config():
    global auto_heal_enabled
    return {"auto_heal_enabled": auto_heal_enabled}

@app.post("/api/config")
def update_config(req: ConfigUpdateRequest):
    global auto_heal_enabled
    auto_heal_enabled = req.auto_heal_enabled
    logger.info(f"Configuration change: auto_heal_enabled set to {auto_heal_enabled}")
    return {"status": "success", "auto_heal_enabled": auto_heal_enabled}


@app.get("/api/satellites")
def get_satellites():
    return simulator.get_satellite_telemetry()

@app.post("/api/simulate-solar-flare")
def trigger_solar_flare(req: SolarFlareRequest):
    simulator.set_solar_flare(req.active, req.duration_steps)
    logger.info(f"Manual override: Set Solar Flare to {req.active} for {req.duration_steps} steps.")
    return {"status": "success", "message": f"Solar Flare scenario set to {req.active}"}

@app.get("/api/copilot/status")
def get_copilot_status():
    ollama_available, ollama_status = copilot.check_ollama_available()
    gemini_active = bool(copilot.GEMINI_API_KEY) if hasattr(copilot, 'GEMINI_API_KEY') else bool(os.getenv("GEMINI_API_KEY", ""))
    
    engine = "Local Expert Rules"
    if gemini_active:
        engine = "Gemini 3.5 Flash"
    elif ollama_available:
        engine = "Ollama LLM"
        
    return {
        "ollama_available": ollama_available or gemini_active,
        "ollama_status": "Gemini API Active" if gemini_active else ollama_status,
        "ollama_url": "https://generativelanguage.googleapis.com" if gemini_active else copilot.ollama_url,
        "ollama_model": "gemini-3.5-flash" if gemini_active else copilot.model_name,
        "knowledge_docs": len(copilot.docs),
        "engine": engine,
        "status": "ready"
    }

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

@app.post("/api/chatbot1/chat")
def chatbot1_query(req: Chatbot1Request):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
    try:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 1. Get live telemetry context of all routers
        telemetry_context = {}
        for rid in ROUTERS.keys():
            history = simulator.get_router_history(rid)
            if len(history) > 0:
                telemetry_context[rid] = history[-1]
                
        # 2. Perform telemetry-aware query expansion for RAG context retrieval
        q_lower = req.query.lower()
        expanded_query = req.query
        
        mentioned_routers = []
        for rid, name in ROUTERS.items():
            if rid.lower() in q_lower or name.lower() in q_lower or name.split()[-1].lower() in q_lower:
                mentioned_routers.append(rid)
                
        if not mentioned_routers and any(kw in q_lower for kw in ["anomaly", "anomalies", "error", "issue", "problem", "failure", "fail", "down", "status", "warning", "critical", "alert"]):
            for rid, details in telemetry_context.items():
                if details.get("failure_label", 0) > 0 or details.get("link_status", 1) == 0:
                    mentioned_routers.append(rid)
                    
        for rid in mentioned_routers:
            details = telemetry_context.get(rid)
            if details:
                expanded_query += f" {rid} {details['router_name']}"
                label = details.get("failure_label", 0)
                if label == 1 or "congestion" in q_lower:
                    expanded_query += " congestion qos bandwidth shaping traffic ISRO-QOS-SHAPING policy output"
                elif label == 2 or "overload" in q_lower or "cpu" in q_lower or "memory" in q_lower:
                    expanded_query += " cpu memory overload threshold rising leak daemon crash clear ip route total"
                elif label == 3 or "instability" in q_lower or "flapping" in q_lower or "loss" in q_lower:
                    expanded_query += " instability link flapping flapping tunnel OSPF database flap shutdown interface neighbor"

        if any(kw in q_lower for kw in ["satellite", "cartosat", "gsat", "flare", "solar"]):
            expanded_query += " satellite GSAT orbit altitude solar flare Cartosat space"

        # 3. Retrieve relevant offline SOP context via similarity search
        retrieved_docs = copilot.retrieve_context(expanded_query)
        context_str = "\n\n".join([f"Source: {d['title']}\nContent: {d['content']}" for d in retrieved_docs])
        if not context_str:
            context_str = "No matching OSPF or network SOP found in local database."
            
        telemetry_str = json.dumps(telemetry_context, indent=2)
        
        system_message = {
            "role": "system",
            "content": (
                "You are Chitti (Version 2.0), the highly advanced agentic robot NOC assistant for ISRO (Rajnikanth style). "
                "You answer user questions regarding network status, SOP guidelines, failure simulations, and predictive ML models. "
                "You have action-taking capabilities. You can directly fix network problems and run diagnostics.\n\n"
                "=== ACTION CAPABILITIES ===\n"
                "1. Self-Healing/Mitigation: If the user requests you to fix, heal, mitigate, restore, or resolve a router issue, "
                "or if they say 'fix it' or 'do it', you MUST append the exact tag at the very end of your response: "
                "[ACTION: mitigate, router_id: ROUTER_ID] where ROUTER_ID is the exact router key (e.g. SDSC-SHAR, ISTRAC-BGL, NOC-DEL, MCF-HSN, NOC-MUM, TRACK-PBL).\n"
                "2. Network Diagnostics: If the user asks you to ping, check reachability, trace route, or diagnose a host/IP, "
                "you MUST append the exact tag at the very end of your response: "
                "[ACTION: diagnose, host: HOST, command: COMMAND] where HOST is the router ID or IP address (e.g. NOC-DEL, 127.0.0.1) and COMMAND is either 'ping' or 'tracert'.\n\n"
                "Formulate an accurate, direct answer using the following live telemetry and SOP database contents:\n\n"
                f"=== LIVE OSPF TELEMETRY ===\n{telemetry_str}\n\n"
                f"=== RETRIEVED OFFLINE SOPs ===\n{context_str}\n\n"
                "CRITICAL: Keep your response extremely concise, direct, and limited to 2-3 sentences max (under 60 words). "
                "If a node is failing, state the cause and specify the exact CLI command or service-policy from the SOP, then declare you will execute it. "
                "Adopt a friendly yet distinctly robotic, technical, and highly structured persona. End your explanation with 'Dot.' to confirm your statement."
            )
        }
        
        messages = [system_message]
        if req.history:
            for msg in req.history[-6:]:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
        messages.append({"role": "user", "content": req.query})
        
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 150,
            "stream": True
        }
        
        accumulated = []
        
        def event_generator():
            try:
                resp = requests.post(url, headers=headers, json=payload, stream=True, timeout=20.0)
                if resp.status_code != 200:
                    yield f"Error: Groq API returned status code {resp.status_code} - {resp.text}"
                    return
                for line in resp.iter_lines():
                    if line:
                        line_str = line.decode("utf-8").strip()
                        if line_str.startswith("data: "):
                            data_content = line_str[6:]
                            if data_content == "[DONE]":
                                break
                            try:
                                data_json = json.loads(data_content)
                                delta = data_json["choices"][0]["delta"]
                                if "content" in delta:
                                    content = delta["content"]
                                    accumulated.append(content)
                                    yield content
                            except Exception:
                                pass
                                
                # Stream finished! Now process any action tag in the accumulated text
                full_text = "".join(accumulated)
                if "[ACTION:" in full_text:
                    match = re.search(r"\[ACTION:\s*(\w+),\s*(router_id|host):\s*([\w\.\-]+)(?:,\s*command:\s*(\w+))?\]", full_text)
                    if match:
                        action_type = match.group(1)
                        param_name = match.group(2)
                        param_value = match.group(3)
                        command_val = match.group(4)
                        
                        if action_type == "mitigate":
                            router_id = param_value.strip().upper()
                            matched_rid = None
                            if router_id in ROUTERS:
                                matched_rid = router_id
                            else:
                                for r_id, r_name in ROUTERS.items():
                                    if router_id in r_name.upper():
                                        matched_rid = r_id
                                        break
                            if matched_rid:
                                simulator.set_scenario(matched_rid, "normal", duration_steps=0)
                                yield f"\n[System: Executed self-healing script to mitigate faults on {matched_rid}. Router restored to Normal.]"
                            else:
                                yield f"\n[System Error: Router ID {router_id} not found.]"
                                
                        elif action_type == "diagnose":
                            host = param_value.strip()
                            resolved_host = "127.0.0.1"
                            host_upper = host.upper()
                            if host_upper in ROUTERS:
                                host_display = ROUTERS[host_upper]
                            else:
                                host_display = host
                                resolved_host = host
                                
                            cmd = (command_val or "ping").strip().lower()
                            if cmd in ["ping", "tracert"]:
                                cmd_args = ["ping", "-n", "3", resolved_host] if cmd == "ping" else ["tracert", "-h", "10", resolved_host]
                                try:
                                    yield f"\n[System: Running diagnostic {cmd} on {host_display}...]"
                                    result = subprocess.run(
                                        cmd_args,
                                        stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE,
                                        text=True,
                                        timeout=12,
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                                    )
                                    output = result.stdout
                                    if result.stderr:
                                        output += f"\nError Output:\n{result.stderr}"
                                    yield f"\n[System Diagnostic Output:\n{output.strip()}]"
                                except Exception as e:
                                    yield f"\n[System Diagnostic Error: {str(e)}]"
            except Exception as e:
                logger.error(f"Error in stream generator: {e}")
                yield f"Error: {str(e)}"

        return StreamingResponse(event_generator(), media_type="text/plain")
    except Exception as e:
        logger.error(f"Chatbot1 Groq query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")


def query_copilot(req: ChatRequest):
    # Fetch current state of specified router if provided, otherwise overview
    telemetry_context = None
    if req.router_id and req.router_id in ROUTERS:
        history = simulator.get_router_history(req.router_id)
        if len(history) > 0:
            telemetry_context = {req.router_id: history[-1]}
    else:
        # Give current state of all routers
        telemetry_context = {}
        for rid in ROUTERS.keys():
            history = simulator.get_router_history(rid)
            if len(history) > 0:
                telemetry_context[rid] = history[-1]
                
    response = copilot.query(req.query, telemetry_context, req.history)
    return response

@app.get("/api/sops")
def get_sops():
    return copilot.docs

@app.post("/api/sops/upload")
async def upload_sop(file: UploadFile = File(...)):
    filename = file.filename
    if not (filename.endswith(".txt") or filename.endswith(".md")):
        raise HTTPException(status_code=400, detail="Only .txt and .md files are supported")
    
    filename = os.path.basename(filename)
    dest_path = os.path.join(copilot.sops_dir, filename)
    
    try:
        content = await file.read()
        text_content = content.decode("utf-8")
        
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(text_content)
            
        copilot.reload_sops()
        return {"status": "success", "message": f"SOP '{filename}' uploaded and indexed successfully"}
    except Exception as e:
        logger.error(f"Failed to upload SOP: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save SOP: {str(e)}")

class DiagnoseRequest(BaseModel):
    host: str
    command: str

@app.post("/api/diagnose")
def run_diagnose(req: DiagnoseRequest):
    host_clean = req.host.strip()
    if not re.match(r"^[a-zA-Z0-9\.\-]+$", host_clean):
        raise HTTPException(status_code=400, detail="Invalid host. Only alphanumeric characters, dots, and hyphens are allowed.")
        
    cmd_type = req.command.strip().lower()
    if cmd_type not in ["ping", "tracert"]:
        raise HTTPException(status_code=400, detail="Invalid command. Only 'ping' and 'tracert' are supported.")
        
    if cmd_type == "ping":
        cmd_args = ["ping", "-n", "4", host_clean]
    else:
        cmd_args = ["tracert", "-h", "15", host_clean]
        
    try:
        timeout = 10 if cmd_type == "ping" else 20
        result = subprocess.run(
            cmd_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        output = result.stdout
        if result.stderr:
            output += f"\nERROR:\n{result.stderr}"
        return {"status": "success", "output": output}
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "output": f"Diagnostic command timed out after {timeout} seconds."}
    except Exception as e:
        logger.error(f"Diagnostic command failed: {e}")
        return {"status": "error", "output": f"Failed to execute diagnostic command: {str(e)}"}

class ExportReportRequest(BaseModel):
    alerts: List[dict]
    stats: dict

@app.post("/api/export-incident")
def export_incident(req: ExportReportRequest):
    from datetime import datetime
    alerts_html = ""
    for idx, alert in enumerate(req.alerts):
        alerts_html += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">{alert.get('timestamp', 'N/A')}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #f43f5e;">{alert.get('router_name', 'N/A')} ({alert.get('router_id', 'N/A')})</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{alert.get('risk_score', 0)}%</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">{alert.get('root_cause', 'N/A')}</td>
        </tr>
        """
    if not alerts_html:
        alerts_html = "<tr><td colspan='4' style='padding: 8px; text-align: center; color: #10b981;'>No active warnings or critical alerts (All systems nominal).</td></tr>"

    html_content = f"""
    <html>
    <head>
        <title>ISRO PRED-NOC SLA Incident Report</title>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }}
            h2 {{ color: #0f172a; border-bottom: 2px solid #38bdf8; padding-bottom: 8px; }}
            .kpi-table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
            .kpi-table th, .kpi-table td {{ padding: 10px; border: 1px solid #cbd5e1; text-align: left; }}
            .kpi-table th {{ background-color: #f1f5f9; }}
            .alert-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
            .alert-table th {{ background-color: #ffe4e6; color: #9f1239; }}
            .header-deck {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }}
            .badge {{ background-color: #e2e8f0; padding: 3px 8px; rounded: 4px; font-size: 0.8em; font-family: monospace; }}
        </style>
    </head>
    <body>
        <div class="header-deck">
            <div>
                <h1 style="margin: 0; color: #0f172a;">ISRO PRED-NOC</h1>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.9em; font-family: monospace;">Predictive Core SLA Incident Report</p>
            </div>
            <div style="text-align: right;">
                <span class="badge">SECURITY CLASSIFICATION: INTERNAL ONLY</span>
                <p style="margin: 5px 0 0 0; font-size: 0.8em; color: #64748b;">Generated: {datetime.utcnow().isoformat()} UTC</p>
            </div>
        </div>
        
        <h2>System KPI Summary</h2>
        <table class="kpi-table">
            <thead>
                <tr>
                    <th>Average SLA Latency</th>
                    <th>Max Packet Loss</th>
                    <th>Average Grid Load</th>
                    <th>Total Active Warnings</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="font-weight: bold;">{req.stats.get('avgLat', 0)} ms</td>
                    <td style="font-weight: bold; color: { '#f43f5e' if req.stats.get('maxLoss', 0) > 1.5 else '#0f172a' };">{req.stats.get('maxLoss', 0)}%</td>
                    <td>{req.stats.get('avgCpu', 0)}% CPU</td>
                    <td style="font-weight: bold; color: { '#f43f5e' if len(req.alerts) > 0 else '#10b981' };">{len(req.alerts)} Alert(s)</td>
                </tr>
            </tbody>
        </table>

        <h2>Active ML Anomalies & SLA Warnings</h2>
        <table class="alert-table">
            <thead>
                <tr>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Timestamp</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Router Node</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Failure Risk</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Root Cause Analysis</th>
                </tr>
            </thead>
            <tbody>
                {alerts_html}
            </tbody>
        </table>
        
        <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 0.8em; color: #64748b; text-align: center;">
            Air-Gapped Predictive NOC Copilot. Systems monitored by XGBoost classification and Isolation Forest anomaly tracking.
        </div>
    </body>
    </html>
    """
    return {"status": "success", "html": html_content}

# ─────────────────────────────────────────────────────────────
# Chat Session Persistence (Supabase)
# ─────────────────────────────────────────────────────────────

@app.post("/api/chat-sessions")
def save_chat_session(entry: ChatSessionEntry):
    """Persists a single chat message turn to the Supabase chat_sessions table."""
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/chat_sessions"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        payload = {
            "session_id": entry.session_id,
            "role": entry.role,
            "content": entry.content,
            "router_context": entry.router_context,
            "source": entry.source
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=4.0)
        if resp.status_code not in [200, 201]:
            logger.debug(f"[Chat Session] Supabase write failed: {resp.status_code} - {resp.text}")
            raise HTTPException(status_code=500, detail="Failed to persist chat session")
        return {"status": "saved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Chat Session] Error saving to Supabase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chat-sessions")
def get_chat_sessions(limit: int = 50, source: Optional[str] = None):
    """Fetches recent chat turns from Supabase, optionally filtered by source."""
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        return []
    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/chat_sessions"
        params: Dict[str, str] = {
            "order": "created_at.desc",
            "limit": str(min(limit, 200))
        }
        if source:
            params["source"] = f"eq.{source}"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
        resp = requests.get(url, headers=headers, params=params, timeout=4.0)
        if resp.status_code == 200:
            rows = resp.json()
            # Group by session_id for structured response
            sessions: Dict[str, list] = {}
            for row in rows:
                sid = row["session_id"]
                if sid not in sessions:
                    sessions[sid] = []
                sessions[sid].append(row)
            # Return as list of sessions, each with messages sorted ascending
            result = []
            for sid, msgs in sessions.items():
                msgs_sorted = sorted(msgs, key=lambda x: x.get("created_at", ""))
                result.append({
                    "session_id": sid,
                    "source": msgs_sorted[0].get("source", "chitthi") if msgs_sorted else "chitthi",
                    "started_at": msgs_sorted[0].get("created_at", "") if msgs_sorted else "",
                    "message_count": len(msgs_sorted),
                    "preview": next((m["content"][:80] for m in msgs_sorted if m["role"] == "user"), "(empty)"),
                    "messages": msgs_sorted
                })
            # Sort sessions newest-first
            result.sort(key=lambda s: s["started_at"], reverse=True)
            return result
        logger.debug(f"[Chat Session] GET failed: {resp.status_code}")
        return []
    except Exception as e:
        logger.error(f"[Chat Session] Error fetching from Supabase: {e}")
        return []



HEALTH_HISTORY_FALLBACK = []

@app.post("/api/health-history")
def save_health_history(entry: HealthHistoryEntry):
    """Persists a network health score snapshot to Supabase, or falls back to in-memory store."""
    global HEALTH_HISTORY_FALLBACK
    
    # Save to in-memory fallback
    point = {
        "health_score": entry.health_score,
        "active_alerts": entry.active_alerts,
        "solar_flare": entry.solar_flare,
        "created_at": datetime.utcnow().isoformat()
    }
    HEALTH_HISTORY_FALLBACK.append(point)
    if len(HEALTH_HISTORY_FALLBACK) > 100:
        HEALTH_HISTORY_FALLBACK.pop(0)

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        return {"status": "saved_locally", "count": len(HEALTH_HISTORY_FALLBACK)}

    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/health_history"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        payload = {
            "health_score": entry.health_score,
            "active_alerts": entry.active_alerts,
            "solar_flare": entry.solar_flare
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=3.0)
        if resp.status_code not in [200, 201]:
            logger.debug(f"[Health History] Supabase write failed: {resp.status_code} - {resp.text}")
            return {"status": "saved_locally_error", "detail": "Supabase rejected write"}
        return {"status": "saved"}
    except Exception as e:
        logger.error(f"[Health History] Error saving to Supabase: {e}")
        return {"status": "saved_locally_error", "detail": str(e)}


@app.get("/api/health-history")
def get_health_history(limit: int = 60):
    """Fetches recent health score history from Supabase, falling back to local history."""
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        # Sort newest-first or return as is. Let's return chronological (oldest to newest) for chart plotting.
        return sorted(HEALTH_HISTORY_FALLBACK, key=lambda x: x["created_at"])[-limit:]

    try:
        url = f"{supabase_url.rstrip('/')}/rest/v1/health_history"
        params = {
            "order": "created_at.desc",
            "limit": str(min(limit, 200))
        }
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
        resp = requests.get(url, headers=headers, params=params, timeout=3.0)
        if resp.status_code == 200:
            rows = resp.json()
            # Return in chronological order (oldest to newest) for charts
            rows.reverse()
            return rows
        logger.debug(f"[Health History] Supabase GET failed: {resp.status_code}")
    except Exception as e:
        logger.error(f"[Health History] Error fetching from Supabase: {e}")
    
    return sorted(HEALTH_HISTORY_FALLBACK, key=lambda x: x["created_at"])[-limit:]


@app.websocket("/ws/telemetry")
@app.websocket("/api/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We just keep the connection open and listen for any messages from client (optional)
            # The broadcast is handled by the background loop
            data = await websocket.receive_text()
            # If client sends ping, we can reply pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
