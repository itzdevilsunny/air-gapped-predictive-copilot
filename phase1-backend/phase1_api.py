"""
ISRO Phase 1 — FastAPI Backend
================================
Serves telemetry data from SQLite + InfluxDB to the Phase 1 dashboard.
Runs on port 8001 (separate from the main NOC backend on 8000).
"""

import asyncio
import logging
import os
import sqlite3
import subprocess
import sys
import time
import requests
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load root environment file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# InfluxDB v2 client
try:
    from influxdb_client import InfluxDBClient
    INFLUX_AVAILABLE = True
except ImportError:
    INFLUX_AVAILABLE = False

# Import generator for in-process access
import importlib.util
_gen_spec = importlib.util.spec_from_file_location(
    "generator",
    os.path.join(os.path.dirname(__file__), "generator.py")
)
_gen_module = importlib.util.module_from_spec(_gen_spec)
_gen_spec.loader.exec_module(_gen_module)

# Import Phase 2 Predictor
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import phase2_predictor
import phase3_anomalies
import phase4_root_cause
import phase5_copilot
import phase6_selfheal


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Phase1-API")

# ─── Configuration ────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "phase1.db")
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "isro-noc-admin-token")
INFLUX_ORG = os.getenv("INFLUX_ORG", "isro-noc")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "isro_telemetry")

# ─── Generator subprocess tracking ───────────────────────────────────────────
_generator_proc: Optional[subprocess.Popen] = None
_generator_start_time: Optional[float] = None

# ─── Shared in-memory snapshot cache (updated by WebSocket broadcast) ─────────
_latest_snapshots: Dict[str, dict] = {}
_ws_clients: List[WebSocket] = []

# AI cache variables
_cached_predictions: Dict[str, Any] = {}
_cached_anomalies: Dict[str, Any] = {}
_cached_root_cause: Dict[str, Any] = {}
_cached_selfheal: Dict[str, Any] = {}

def get_latest_snapshots(conn) -> List[sqlite3.Row]:
    """Fetches the latest snapshot for each router using a highly optimized query.
    Instead of scanning the entire network_snapshots table with GROUP BY,
    we query each router individually using the indexed router_id and timestamp,
    which is extremely fast.
    """
    routers = conn.execute("SELECT id FROM router_registry").fetchall()
    latest_rows = []
    for r in routers:
        rid = r["id"]
        # Use index idx_snapshots_router_ts (router_id, timestamp)
        row = conn.execute(
            """SELECT s.*, r.name AS router_name, r.ip_address, r.site_type
               FROM network_snapshots s
               JOIN router_registry r ON s.router_id = r.id
               WHERE s.router_id = ?
               ORDER BY s.timestamp DESC LIMIT 1""",
            (rid,)
        ).fetchone()
        if row:
            latest_rows.append(row)
    return latest_rows


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Ensure DB schema exists."""
    schema_path = os.path.join(os.path.dirname(__file__), "db_schema.sql")
    if os.path.exists(schema_path):
        conn = sqlite3.connect(DB_PATH)
        with open(schema_path, "r") as f:
            conn.executescript(f.read())
        conn.commit()
        conn.close()
        logger.info("Phase 1 database initialized.")


def sync_telemetry_to_supabase_p1(snapshot_data: dict, preds: dict, anoms: dict):
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
        for rid, row in snapshot_data.items():
            pred = preds.get(rid, {})
            risk_score = float(pred.get("risk_score", 0.0))
            anom = anoms.get(rid, {})
            is_anomaly = bool(anom.get("is_anomaly", False))
            
            payload.append({
                "router_id": rid,
                "router_name": row.get("router_name", rid),
                "cpu": float(row.get("cpu", 0.0)),
                "latency": float(row.get("latency", 0.0)),
                "packet_loss": float(row.get("packet_loss", 0.0)),
                "jitter": float(row.get("jitter", 0.0)),
                "bandwidth": float(row.get("bandwidth", 0.0)),
                "link_status": int(row.get("link_status", 1)),
                "failure_risk": risk_score,
                "is_anomaly": is_anomaly
            })
        resp = requests.post(url, headers=headers, json=payload, timeout=3.0)
        if resp.status_code not in [200, 201]:
            logger.debug(f"[Supabase Sync P1] Failed to sync telemetry: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.debug(f"[Supabase Sync P1] Telemetry sync error: {e}")


# ─── Background telemetry broadcast task ──────────────────────────────────────
async def broadcast_live_data():
    """Polls SQLite every 2 seconds and pushes to WebSocket clients."""
    while True:
        try:
            conn = get_db()
            rows = get_latest_snapshots(conn)
            conn.close()

            snapshot = {}
            for row in rows:
                d = dict(row)
                rid = d["router_id"]
                snapshot[rid] = d
                _latest_snapshots[rid] = d

            # Async sync to Supabase in separate thread to prevent blocking
            asyncio.create_task(asyncio.to_thread(sync_telemetry_to_supabase_p1, snapshot, _cached_predictions, _cached_anomalies))

            if _ws_clients:
                payload = {"type": "live_update", "data": snapshot}
                dead = []
                for ws in _ws_clients:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead.append(ws)
                for ws in dead:
                    _ws_clients.remove(ws)

        except Exception as e:
            logger.debug(f"Broadcast error: {e}")

        await asyncio.sleep(2.0)


def compute_ai_analysis(db_path):
    """Computes all predictions, anomalies, root causes, and self-healing reports
    in a synchronous block. This function runs in a separate thread.
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        preds = phase2_predictor.predict_all_routers(conn)
        anoms = phase3_anomalies.detect_anomalies(conn)
        rcs = phase4_root_cause.analyze_root_cause(conn)
        selfheals = phase6_selfheal.generate_selfheal_report(conn, rcs, preds)
        return preds, anoms, rcs, selfheals
    except Exception as e:
        logger.error(f"Error inside compute_ai_analysis thread: {e}", exc_info=True)
        raise
    finally:
        conn.close()


async def run_ai_analysis_loop():
    """Runs AI predictions, anomaly detection, root cause, and self-healing analysis
    in a background thread pool every 4.0 seconds to update memory caches.
    """
    global _cached_predictions, _cached_anomalies, _cached_root_cause, _cached_selfheal
    await asyncio.sleep(2.0)  # Wait for startup and dynamic models
    while True:
        try:
            start_t = time.time()
            
            # Offload heavy CPU-bound model loading and inference to a thread pool!
            preds, anoms, rcs, selfheals = await asyncio.to_thread(compute_ai_analysis, DB_PATH)
            
            _cached_predictions = preds
            _cached_anomalies = anoms
            _cached_root_cause = rcs
            _cached_selfheal = selfheals
            
            elapsed = time.time() - start_t
            logger.info(f"AI background analysis loop completed in {elapsed:.3f}s (Thread pool offloaded)")
        except Exception as e:
            logger.error(f"Error in background AI analysis loop: {e}", exc_info=True)
            
        await asyncio.sleep(4.0)


def init_caches_fast():
    """Initializes caches with fast default/normal states to prevent blocking on startup."""
    global _cached_predictions, _cached_anomalies, _cached_root_cause, _cached_selfheal
    routers = ["ISTRAC-BGL", "SDSC-SHAR", "MCF-HSN", "NOC-DEL", "NOC-MUM", "TRACK-PBL"]
    
    _cached_predictions = {
        rid: {
            "router_id": rid,
            "router_name": rid,
            "risk_score": 0,
            "prediction": "Normal operation (Initializing AI)",
            "eta_minutes": None,
            "failure_type": "normal"
        } for rid in routers
    }
    
    _cached_anomalies = {
        rid: {
            "router_id": rid,
            "router_name": rid,
            "is_anomaly": False,
            "anomaly_score": 0.0,
            "explanation": "Establishing baseline patterns...",
            "spikes": [],
            "latest_metrics": {}
        } for rid in routers
    }
    
    _cached_root_cause = {
        rid: {
            "router_id": rid,
            "router_name": rid,
            "status": "NORMAL",
            "root_cause": "Normal operation",
            "confidence_score": 0.0,
            "rule_triggered": "None",
            "ai_attribution": "None",
            "evidences": ["System starting up"],
            "cli_fix": "! System starting up. No action required.",
            "latest_metrics": {}
        } for rid in routers
    }
    
    _cached_selfheal = {
        rid: {
            "router_id": rid,
            "router_name": rid,
            "role": "MPLS Node",
            "criticality": "MEDIUM",
            "status": "NORMAL",
            "priority": "P4-NORMAL",
            "priority_color": "green",
            "risk_score": 0,
            "predicted_failure": "Normal",
            "time_to_failure": None,
            "root_cause": "Normal operation",
            "confidence_score": 0.0,
            "rule_triggered": "None",
            "ai_attribution": "Normal Profile",
            "evidences": [],
            "latest_metrics": {},
            "failure_type": "Normal",
            "impact_analysis": [],
            "mitigation_steps": ["No action required. Continue standard monitoring."],
            "cli_fix": "! Operating normally. No CLI actions required.",
            "automation_script": "# Healthy. No automation needed.",
            "estimated_fix_minutes": 0,
            "auto_applicable": False,
            "services": [],
            "downstream_routers": [],
            "backup_path": "None"
        } for rid in routers
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_caches_fast()
    asyncio.create_task(broadcast_live_data())
    asyncio.create_task(run_ai_analysis_loop())
    logger.info("Phase 1 API ready — background broadcast and AI analysis loops started.")
    yield
    if _generator_proc and _generator_proc.poll() is None:
        _generator_proc.terminate()


app = FastAPI(title="ISRO Phase 1 Network Data API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
                   "http://localhost:5176", "http://localhost:5177",
                   "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175",
                   "http://127.0.0.1:5176", "http://127.0.0.1:5177"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DownlinkEventModel(BaseModel):
    id: str
    satName: str
    stationId: str
    startHour: int
    duration: int
    load: int

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
                import json
                json.dump(DEFAULT_SATELLITE_SCHEDULES, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to write default satellite schedules: {e}")
            return DEFAULT_SATELLITE_SCHEDULES
    try:
        with open(SATELLITE_SCHEDULES_FILE, "r", encoding="utf-8") as f:
            import json
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read satellite schedules: {e}")
        return DEFAULT_SATELLITE_SCHEDULES

@app.post("/api/satellite-schedules")
def save_satellite_schedules(schedules: List[DownlinkEventModel]):
    try:
        import json
        payload = [s.dict() for s in schedules]
        with open(SATELLITE_SCHEDULES_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {"status": "success", "count": len(payload)}
    except Exception as e:
        logger.error(f"Failed to save satellite schedules: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save schedules: {str(e)}")


# ─── Models ───────────────────────────────────────────────────────────────────
class FailureInjectRequest(BaseModel):
    router_id: str
    failure_type: str  # congestion, overload, instability, link_down, normal
    duration_steps: int = 30


# ─── Routers API ──────────────────────────────────────────────────────────────
@app.get("/api/ph1/routers")
def get_routers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM router_registry ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Live Metrics ─────────────────────────────────────────────────────────────
@app.get("/api/ph1/metrics/live")
def get_live_metrics():
    """Latest single snapshot per router from SQLite."""
    conn = get_db()
    rows = get_latest_snapshots(conn)
    conn.close()
    return [dict(r) for r in rows]


# ─── Time-Series History ──────────────────────────────────────────────────────
@app.get("/api/ph1/metrics/{router_id}")
def get_router_metrics(router_id: str, minutes: int = 10, limit: int = 300):
    """Historical time-series data for a specific router from SQLite."""
    conn = get_db()
    
    # Verify router exists
    router = conn.execute(
        "SELECT * FROM router_registry WHERE id = ?", (router_id,)
    ).fetchone()
    if not router:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Router '{router_id}' not found")

    since = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    rows = conn.execute(
        """SELECT * FROM network_snapshots
           WHERE router_id = ? AND timestamp >= ?
           ORDER BY timestamp DESC
           LIMIT ?""",
        (router_id, since, limit)
    ).fetchall()
    conn.close()
    # Return in ascending time order for charts
    return list(reversed([dict(r) for r in rows]))


@app.get("/api/ph1/metrics/{router_id}/influx")
def get_influx_metrics(router_id: str, minutes: int = 10):
    """Query time-series from InfluxDB (if available)."""
    if not INFLUX_AVAILABLE:
        raise HTTPException(status_code=503, detail="InfluxDB client not installed")
    try:
        client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
        query_api = client.query_api()
        flux_query = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: -{minutes}m)
  |> filter(fn: (r) => r["_measurement"] == "network_telemetry")
  |> filter(fn: (r) => r["router_id"] == "{router_id}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
'''
        tables = query_api.query(flux_query)
        client.close()
        
        records = []
        for table in tables:
            for record in table.records:
                records.append({
                    "timestamp": record.get_time().isoformat(),
                    "router_id": record.values.get("router_id"),
                    "latency": record.values.get("latency"),
                    "packet_loss": record.values.get("packet_loss"),
                    "jitter": record.values.get("jitter"),
                    "bandwidth": record.values.get("bandwidth"),
                    "cpu": record.values.get("cpu"),
                    "memory": record.values.get("memory"),
                    "link_status": record.values.get("link_status"),
                })
        return {"source": "influxdb", "records": records, "count": len(records)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"InfluxDB query failed: {str(e)}")


# ─── Incidents ────────────────────────────────────────────────────────────────
@app.get("/api/ph1/incidents")
def get_incidents(limit: int = 50, router_id: Optional[str] = None):
    conn = get_db()
    if router_id:
        rows = conn.execute(
            """SELECT i.*, r.name AS router_name FROM incident_log i
               JOIN router_registry r ON i.router_id = r.id
               WHERE i.router_id = ?
               ORDER BY i.started_at DESC LIMIT ?""",
            (router_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT i.*, r.name AS router_name FROM incident_log i
               JOIN router_registry r ON i.router_id = r.id
               ORDER BY i.started_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Data Table (raw snapshots) ───────────────────────────────────────────────
@app.get("/api/ph1/snapshots")
def get_snapshots(
    router_id: Optional[str] = None,
    failure_label: Optional[int] = None,
    limit: int = 100,
    offset: int = 0
):
    conn = get_db()
    filters = []
    params: List[Any] = []
    
    if router_id:
        filters.append("s.router_id = ?")
        params.append(router_id)
    if failure_label is not None:
        filters.append("s.failure_label = ?")
        params.append(failure_label)
    
    where = "WHERE " + " AND ".join(filters) if filters else ""
    total_row = conn.execute(
        f"SELECT COUNT(*) FROM network_snapshots s {where}", params
    ).fetchone()[0]
    
    rows = conn.execute(
        f"""SELECT s.*, r.name AS router_name FROM network_snapshots s
            JOIN router_registry r ON s.router_id = r.id
            {where}
            ORDER BY s.timestamp DESC LIMIT ? OFFSET ?""",
        params + [limit, offset]
    ).fetchall()
    conn.close()
    
    return {
        "total": total_row,
        "limit": limit,
        "offset": offset,
        "data": [dict(r) for r in rows]
    }


# ─── Generator Control ────────────────────────────────────────────────────────
@app.get("/api/ph1/generator/status")
def generator_status():
    global _generator_proc, _generator_start_time
    
    conn = get_db()
    row_count = conn.execute("SELECT MAX(id) FROM network_snapshots").fetchone()[0] or 0
    incident_count = conn.execute("SELECT MAX(id) FROM incident_log").fetchone()[0] or 0
    latest_row = conn.execute(
        "SELECT timestamp FROM network_snapshots ORDER BY id DESC LIMIT 1"
    ).fetchone()
    
    # Ingestion rate from last 30 seconds
    since_30s = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    recent_count = conn.execute(
        "SELECT COUNT(*) FROM network_snapshots WHERE timestamp >= ?", (since_30s,)
    ).fetchone()[0]
    conn.close()
    
    is_running = _generator_proc is not None and _generator_proc.poll() is None
    uptime_secs = int(time.time() - _generator_start_time) if _generator_start_time and is_running else 0
    
    return {
        "running": is_running,
        "pid": _generator_proc.pid if is_running else None,
        "uptime_seconds": uptime_secs,
        "total_rows": row_count,
        "total_incidents": incident_count,
        "latest_timestamp": latest_row[0] if latest_row else None,
        "rows_last_30s": recent_count,
        "rows_per_minute": round(recent_count * 2, 1),  # extrapolate from 30s window
        "influx_available": INFLUX_AVAILABLE and _check_influx(),
        "sqlite_path": DB_PATH,
    }


def _check_influx() -> bool:
    try:
        client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
        h = client.health()
        client.close()
        return h.status == "pass"
    except Exception:
        return False


@app.post("/api/ph1/generator/start")
def start_generator():
    global _generator_proc, _generator_start_time
    if _generator_proc and _generator_proc.poll() is None:
        return {"status": "already_running", "pid": _generator_proc.pid}
    
    gen_path = os.path.join(os.path.dirname(__file__), "generator.py")
    log_path = os.path.join(os.path.dirname(__file__), "generator.log")
    python_exe = sys.executable
    
    try:
        log_file = open(log_path, "a", encoding="utf-8")
        _generator_proc = subprocess.Popen(
            [python_exe, gen_path],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        log_file.close()
        _generator_start_time = time.time()
        logger.info(f"Generator started with PID {_generator_proc.pid}, logging to {log_path}")
        return {"status": "started", "pid": _generator_proc.pid}
    except Exception as e:
        logger.error(f"Failed to start generator: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start generator: {str(e)}")


@app.post("/api/ph1/generator/stop")
def stop_generator():
    global _generator_proc, _generator_start_time
    if not _generator_proc or _generator_proc.poll() is not None:
        return {"status": "not_running"}
    
    _generator_proc.terminate()
    try:
        _generator_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _generator_proc.kill()
    
    _generator_start_time = None
    logger.info("Generator stopped.")
    return {"status": "stopped"}


# ─── Failure Injection ────────────────────────────────────────────────────────
@app.post("/api/ph1/inject")
def inject_failure(req: FailureInjectRequest):
    """Inject failure into generator by writing to injections.json."""
    if req.router_id not in _gen_module.ROUTERS:
        raise HTTPException(status_code=404, detail="Router not found")
    if req.failure_type not in ["normal", "congestion", "overload", "instability", "link_down"]:
        raise HTTPException(status_code=400, detail="Invalid failure type")
    
    inject_file = os.path.join(os.path.dirname(__file__), "injections.json")
    try:
        import json
        data = {}
        if os.path.exists(inject_file):
            try:
                with open(inject_file, "r") as f:
                    data = json.load(f)
            except Exception:
                data = {}
        data[req.router_id] = {
            "type": req.failure_type,
            "duration": req.duration_steps,
            "timestamp": time.time(),
            "processed": False
        }
        with open(inject_file, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(f"Injected {req.failure_type} on {req.router_id} (written to injections.json)")
    except Exception as e:
        logger.error(f"Failed to write injection to file: {e}")
        # fallback to in-memory in case it is running in-process
        _gen_module.set_failure(req.router_id, req.failure_type, req.duration_steps)
        
    return {
        "status": "injected",
        "router_id": req.router_id,
        "failure_type": req.failure_type,
        "duration_steps": req.duration_steps
    }


# ─── Database Health ──────────────────────────────────────────────────────────
@app.get("/api/ph1/health")
def health_check():
    # SQLite check
    try:
        conn = get_db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        sqlite_ok = True
    except Exception:
        sqlite_ok = False

    influx_ok = INFLUX_AVAILABLE and _check_influx()

    return {
        "sqlite": {"status": "ok" if sqlite_ok else "error", "path": DB_PATH},
        "influxdb": {
            "status": "ok" if influx_ok else "unavailable",
            "url": INFLUX_URL,
            "client_installed": INFLUX_AVAILABLE
        },
        "api": "ok"
    }


# ─── WebSocket Stream ─────────────────────────────────────────────────────────
@app.websocket("/ws/ph1/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)
    except Exception:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# ─── Phase 2 AI Failure Prediction Endpoints ──────────────────────────────────
@app.get("/api/ph2/predictions")
def get_predictions():
    """Get failure predictions for all routers."""
    return _cached_predictions

@app.post("/api/ph2/train")
def retrain_model():
    """Retrain the XGBoost model on the current database telemetry."""
    try:
        conn = get_db()
        stats = phase2_predictor.train_model(conn)
        conn.close()
        if stats.get("status") == "success":
            return stats
        elif stats.get("status") == "insufficient_data":
            raise HTTPException(status_code=400, detail=stats.get("message"))
        else:
            raise HTTPException(status_code=500, detail=stats.get("message"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retraining failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ph2/model/status")
def get_model_status():
    """Get active model metadata."""
    import joblib
    model_path = phase2_predictor.MODEL_PATH
    if not os.path.exists(model_path):
        return {
            "trained": False,
            "status": "No model trained yet",
            "accuracy": None,
            "precision": None,
            "recall": None,
            "trained_at": None,
            "num_samples": 0
        }
    try:
        payload = joblib.load(model_path)
        return {
            "trained": True,
            "status": "Model active",
            "accuracy": payload["metrics"]["accuracy"],
            "precision": payload["metrics"]["precision"],
            "recall": payload["metrics"]["recall"],
            "trained_at": payload["trained_at"],
            "num_samples": payload["num_samples"]
        }
    except Exception as e:
        return {
            "trained": False,
            "status": f"Error loading model: {str(e)}",
            "accuracy": None,
            "precision": None,
            "recall": None,
            "trained_at": None,
            "num_samples": 0
        }


# ─── Phase 3 AI Anomaly Detection Endpoints ────────────────────────────────────
@app.get("/api/ph3/anomalies")
def get_anomalies():
    """Get unsupervised anomalies and traffic spikes for all routers."""
    return _cached_anomalies

@app.post("/api/ph3/train")
def retrain_anomaly_model():
    """Retrain the Isolation Forest model on the current database telemetry."""
    try:
        conn = get_db()
        stats = phase3_anomalies.train_anomaly_model(conn)
        conn.close()
        if stats.get("status") == "success":
            return stats
        elif stats.get("status") == "insufficient_data":
            raise HTTPException(status_code=400, detail=stats.get("message"))
        else:
            raise HTTPException(status_code=500, detail=stats.get("message"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retraining Isolation Forest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ph3/model/status")
def get_anomaly_model_status():
    """Get active Isolation Forest model metadata."""
    import joblib
    model_path = phase3_anomalies.MODEL_PATH
    if not os.path.exists(model_path):
        return {
            "trained": False,
            "status": "No anomaly model trained yet",
            "trained_at": None,
            "num_samples": 0
        }
    try:
        payload = joblib.load(model_path)
        return {
            "trained": True,
            "status": "Isolation Forest active",
            "trained_at": payload["trained_at"],
            "num_samples": payload["num_samples"]
        }
    except Exception as e:
        return {
            "trained": False,
            "status": f"Error loading model: {str(e)}",
            "trained_at": None,
            "num_samples": 0
        }


# ─── Phase 4 AI Root Cause Engine Endpoints ────────────────────────────────────
@app.get("/api/ph4/root_cause")
def get_root_cause():
    """Get Rule + AI hybrid root cause analysis for all routers."""
    return _cached_root_cause



# ─── Phase 5 AI Copilot RAG Endpoints ────────────────────────────────────────
class CopilotQueryRequest(BaseModel):
    query: str
    router_context: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None


@app.post("/api/ph5/query")
def copilot_query(req: CopilotQueryRequest):
    """Process a natural language query through the RAG pipeline."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    try:
        result = phase5_copilot.process_query(
            query=req.query.strip(),
            router_context=req.router_context,
            history=req.history
        )
        return result
    except Exception as e:
        logger.error(f"Phase 5 copilot query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ph5/status")
def copilot_status():
    """Get Copilot engine status: Ollama availability, Gemini availability, index size."""
    ollama_available, ollama_status = phase5_copilot.check_ollama_available()
    gemini_active = bool(phase5_copilot.GEMINI_API_KEY)
    index = phase5_copilot.get_index()
    
    engine = "Local Expert Engine"
    if gemini_active:
        engine = "Gemini 3.5 Flash"
    elif ollama_available:
        engine = "Ollama LLM"
        
    return {
        "ollama_available": ollama_available or gemini_active,
        "ollama_status": "Gemini API Active" if gemini_active else ollama_status,
        "ollama_url": "https://generativelanguage.googleapis.com" if gemini_active else phase5_copilot.OLLAMA_URL,
        "ollama_model": "gemini-3.5-flash" if gemini_active else phase5_copilot.OLLAMA_MODEL,
        "knowledge_docs": len(index.docs),
        "engine": engine,
        "status": "ready"
    }


@app.get("/api/ph5/knowledge")
def get_knowledge_base():
    """List all documents in the RAG knowledge base."""
    from phase5_knowledge_base import KNOWLEDGE_DOCS
    return [
        {
            "id": d["id"],
            "title": d["title"],
            "category": d.get("category", ""),
            "tags": d.get("tags", []),
            "snippet": d["content"][:150] + "..."
        }
        for d in KNOWLEDGE_DOCS
    ]



# ─── Phase 6 Self-Healing Engine Endpoints ────────────────────────────────────────
@app.get("/api/ph6/selfheal")
def get_selfheal():
    """Get autonomous self-healing recommendations for all routers."""
    return _cached_selfheal


@app.get("/api/ph6/topology")
def get_topology():
    """Get network topology with live status for all nodes."""
    conn = get_db()
    routers = conn.execute("SELECT id FROM router_registry").fetchall()
    rows = []
    for r in routers:
        rid = r["id"]
        row = conn.execute(
            """SELECT s.router_id, s.latency, s.packet_loss, s.bandwidth, s.cpu,
                      s.memory, s.link_status, s.failure_label, r.name, r.site_type, r.ip_address
               FROM network_snapshots s
               JOIN router_registry r ON s.router_id = r.id
               WHERE s.router_id = ?
               ORDER BY s.timestamp DESC LIMIT 1""",
            (rid,)
        ).fetchone()
        if row:
            rows.append(row)
    conn.close()

    topology_meta = phase6_selfheal.ROUTER_DEPENDENCIES
    nodes = []
    for row in rows:
        d = dict(row)
        rid = d["router_id"]
        meta = topology_meta.get(rid, {})
        label = d.get("failure_label", 0)
        status = "red" if d["link_status"] == 0 else (
            "red" if label >= 2 else ("yellow" if label >= 1 else "green")
        )
        nodes.append({
            "id": rid,
            "name": d["name"],
            "role": meta.get("role", ""),
            "criticality": meta.get("criticality", "MEDIUM"),
            "site_type": d.get("site_type", ""),
            "ip_address": d.get("ip_address", ""),
            "status": status,
            "failure_label": label,
            "latency": round(d.get("latency", 0), 2),
            "packet_loss": round(d.get("packet_loss", 0), 3),
            "bandwidth": round(d.get("bandwidth", 0), 1),
            "cpu": round(d.get("cpu", 0), 1),
            "link_status": int(d.get("link_status", 1)),
            "downstream": meta.get("downstream", []),
            "services": meta.get("services", []),
        })
    return {"nodes": nodes, "edges": [
        {"from": "ISTRAC-BGL", "to": "SDSC-SHAR", "label": "MPLS Primary"},
        {"from": "ISTRAC-BGL", "to": "MCF-HSN", "label": "MPLS Primary"},
        {"from": "ISTRAC-BGL", "to": "NOC-DEL", "label": "MPLS Backbone"},
        {"from": "ISTRAC-BGL", "to": "NOC-MUM", "label": "MPLS Backbone"},
        {"from": "NOC-DEL", "to": "TRACK-PBL", "label": "MPLS Secondary"},
    ]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, reload=False)
