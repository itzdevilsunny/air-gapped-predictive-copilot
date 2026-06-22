import asyncio
import logging
import os
import re
import subprocess
import requests
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

# Initialize engines
simulator = NetworkSimulator(history_length=60)
intelligence = NetworkIntelligence()
copilot = AirGappedCopilot()

# Train models on startup
@app.on_event("startup")
def train_models():
    logger.info("Generating synthetic dataset and training ML models (XGBoost & Isolation Forest)...")
    train_df = simulator.get_training_data(samples_per_router=400)
    intelligence.train(train_df)
    logger.info("Model training completed successfully. Ready to predict.")

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

async def broadcast_telemetry():
    while True:
        try:
            # Advance simulation 1 step
            step_data = simulator.step()
            
            # Enrich telemetry with AI predictions
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

@app.get("/api/routers")
def get_routers():
    return [{"id": rid, "name": name} for rid, name in ROUTERS.items()]

@app.get("/api/router/{router_id}/history")
def get_router_history(router_id: str):
    if router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
        
    history = simulator.get_router_history(router_id)
    
    # Calculate intelligence details for the history (so user can draw charts with predictions)
    history_enriched = []
    # To compute predictions correctly, we pass increasing slices of history
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
    return {"status": "success", "message": f"Scenario '{req.failure_type}' triggered on {req.router_id}"}

@app.post("/api/mitigate")
def apply_mitigation(req: MitigationRequest):
    if req.router_id not in ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
        
    # Set router state back to normal
    simulator.set_scenario(req.router_id, "normal", duration_steps=0)
    logger.info(f"Self-healing: Mitigated failure on {req.router_id}. Router restored to Normal state.")
    return {"status": "success", "message": f"Mitigation CLI script applied. Router {req.router_id} restored to Normal state."}

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
        engine = "Gemini 2.5 Flash"
    elif ollama_available:
        engine = "Ollama LLM"
        
    return {
        "ollama_available": ollama_available or gemini_active,
        "ollama_status": "Gemini API Active" if gemini_active else ollama_status,
        "ollama_url": "https://generativelanguage.googleapis.com" if gemini_active else copilot.ollama_url,
        "ollama_model": "gemini-2.5-flash" if gemini_active else copilot.model_name,
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
        
        system_message = {
            "role": "system",
            "content": (
                "You are Chitthi, a highly advanced voice-enabled AI operations assistant for the ISRO Predictive NOC. "
                "You answer user questions regarding the network status, SOP guidelines, failure simulations, and predictive ML models. "
                "Answer concisely, directly, and in a friendly conversational style suitable for speech synthesis."
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
            "model": "llama3-8b-8192",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 512
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=20.0)
        if resp.status_code == 200:
            res_json = resp.json()
            choices = res_json.get("choices", [])
            if choices:
                answer = choices[0].get("message", {}).get("content", "").strip()
                return {"answer": answer, "status": "success"}
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
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

@app.websocket("/ws/telemetry")
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
