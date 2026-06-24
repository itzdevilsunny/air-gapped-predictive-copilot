"""
ISRO Predictive NOC — Phase 1 Network Simulator & Data Generator
=================================================================
Generates synthetic MPLS network telemetry with realistic failure patterns
and stores data in both SQLite (structured) and InfluxDB (time-series).

Simulated parameters per router:
  - timestamp, router_id, latency, packet_loss, jitter,
    bandwidth, CPU, memory, link_status, failure_label
"""

import asyncio
import logging
import math
import os
import random
import sqlite3
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

# InfluxDB v2 client
try:
    from influxdb_client import InfluxDBClient, Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUX_AVAILABLE = True
except ImportError:
    INFLUX_AVAILABLE = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("Phase1-Generator")

# ─── Configuration ────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "phase1.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "db_schema.sql")
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "isro-noc-admin-token")
INFLUX_ORG = os.getenv("INFLUX_ORG", "isro-noc")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "isro_telemetry")
GENERATE_INTERVAL = float(os.getenv("GEN_INTERVAL", "2.0"))  # seconds

# ─── ISRO MPLS Router Definitions ────────────────────────────────────────────
ROUTERS = {
    "ISTRAC-BGL": {
        "name": "ISTRAC Bangalore",
        "location": "Bangalore, Karnataka",
        "ip": "10.100.10.1",
        "baseline_latency": 12.0,
        "baseline_cpu": 35.0,
        "baseline_bw": 45.0,
    },
    "SDSC-SHAR": {
        "name": "SDSC Sriharikota",
        "location": "Sriharikota, AP",
        "ip": "10.100.20.1",
        "baseline_latency": 18.0,
        "baseline_cpu": 55.0,
        "baseline_bw": 60.0,
    },
    "MCF-HSN": {
        "name": "MCF Hassan",
        "location": "Hassan, Karnataka",
        "ip": "10.100.30.1",
        "baseline_latency": 22.0,
        "baseline_cpu": 40.0,
        "baseline_bw": 38.0,
    },
    "NOC-DEL": {
        "name": "NOC Delhi",
        "location": "New Delhi",
        "ip": "10.100.40.1",
        "baseline_latency": 35.0,
        "baseline_cpu": 50.0,
        "baseline_bw": 55.0,
    },
    "NOC-MUM": {
        "name": "NOC Mumbai",
        "location": "Mumbai, Maharashtra",
        "ip": "10.100.50.1",
        "baseline_latency": 28.0,
        "baseline_cpu": 45.0,
        "baseline_bw": 50.0,
    },
    "TRACK-PBL": {
        "name": "TRACK Port Blair",
        "location": "Port Blair, Andaman",
        "ip": "10.100.60.1",
        "baseline_latency": 65.0,
        "baseline_cpu": 30.0,
        "baseline_bw": 25.0,
    },
}

# Failure state machine per router
# Each router has: (failure_type, steps_remaining, step_index)
_router_states: Dict[str, Tuple[str, int, int]] = {
    rid: ("normal", 0, 0) for rid in ROUTERS
}

# Targets for pre-failure phase transitions
_pre_failure_targets: Dict[str, Tuple[str, int]] = {}

_stats = {
    "rows_inserted": 0,
    "influx_writes": 0,
    "errors": 0,
    "started_at": time.time(),
}

# Track active incidents to avoid duplicate logging
_active_incidents: Dict[str, Optional[int]] = {rid: None for rid in ROUTERS}


from network_engine import ISRONetworkEngine
_engine = ISRONetworkEngine()

# ─── Per-Router Metric Generation ─────────────────────────────────────────────
def generate_metrics(router_id: str, t: float) -> dict:
    """Generate one snapshot of all telemetry from physics engine."""
    cfg = ROUTERS[router_id]
    
    # Engine calculates realistic physical values
    snapshot = _engine.get_router_snapshot(router_id)
    
    snapshot["router_id"] = router_id
    snapshot["router_name"] = cfg["name"]
    snapshot["timestamp"] = datetime.now(timezone.utc).isoformat()
    return snapshot


def set_failure(router_id: str, failure_type: str, duration_steps: int = 30):
    """Manually inject a failure scenario into a router by physically altering the network."""
    if failure_type == "link_down":
        # For a link down on a specific router, let's cut its primary incoming link
        if router_id == "NOC-DEL":
            _engine.cut_link("SDSC-SHAR", "NOC-DEL")
        elif router_id == "NOC-MUM":
            _engine.cut_link("MCF-HSN", "NOC-MUM")
        else:
            # Fallback cut first out edge
            out_edges = list(_engine.graph.out_edges(router_id))
            if out_edges:
                _engine.cut_link(out_edges[0][0], out_edges[0][1])
        logger.info(f"Engine injected physical LINK CUT near {router_id}")
    elif failure_type == "congestion":
        # Create a massive demand spike (e.g. 1000 Mbps) targeted at this router
        # We simulate it by just pushing a flow from ISTRAC to it
        _engine.demands.append({
            'source_id': 'ISTRAC-BGL',
            'target_id': router_id,
            'bandwidth_mbps': 500.0,
            'status': 1
        })
        logger.info(f"Engine injected MASSIVE CONGESTION FLOW towards {router_id}")


def _check_manual_injections():
    """Check for manually injected failure scenarios from injections.json."""
    inject_file = os.path.join(os.path.dirname(__file__), "injections.json")
    if os.path.exists(inject_file):
        try:
            import json
            with open(inject_file, "r") as f:
                data = json.load(f)
            
            modified = False
            for r_id, inj in list(data.items()):
                if not inj.get("processed", False):
                    logger.info(f"Applying manual failure injection from file: {r_id} -> {inj['type']} ({inj['duration']} steps)")
                    set_failure(r_id, inj["type"], inj["duration"])
                    inj["processed"] = True
                    modified = True
            
            if modified:
                with open(inject_file, "w") as f:
                    json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Error checking manual injections file: {e}")


def _maybe_inject_scenario(t: float):
    """Disabled random scenarios in Physics engine mode so we only see physical events."""
    pass


# ─── Database Operations ──────────────────────────────────────────────────────
def init_database() -> sqlite3.Connection:
    """Initialize SQLite database with schema."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    with open(SCHEMA_PATH, "r") as f:
        conn.executescript(f.read())
    conn.commit()
    logger.info(f"SQLite database ready: {DB_PATH}")
    return conn


def write_snapshot(conn: sqlite3.Connection, metrics: dict):
    """Insert telemetry snapshot into SQLite."""
    conn.execute(
        """INSERT INTO network_snapshots
           (router_id, timestamp, latency, packet_loss, jitter, bandwidth,
            cpu, memory, link_status, failure_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            metrics["router_id"],
            metrics["timestamp"],
            metrics["latency"],
            metrics["packet_loss"],
            metrics["jitter"],
            metrics["bandwidth"],
            metrics["cpu"],
            metrics["memory"],
            metrics["link_status"],
            metrics["failure_label"],
        )
    )


def write_incident(conn: sqlite3.Connection, router_id: str, metrics: dict) -> int:
    """Log a new incident when failure starts."""
    severity = "CRITICAL" if metrics["failure_label"] == 3 else "WARNING"
    failure_type_map = {0: "normal", 1: "congestion", 2: "overload", 3: "instability"}
    ftype = failure_type_map.get(metrics["failure_label"], "unknown")
    
    cursor = conn.execute(
        """INSERT INTO incident_log
           (router_id, started_at, failure_type, severity, peak_latency, peak_loss, peak_cpu, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            router_id,
            metrics["timestamp"],
            ftype,
            severity,
            metrics["latency"],
            metrics["packet_loss"],
            metrics["cpu"],
            f"Auto-detected by generator: {ftype} on {metrics['router_name']}"
        )
    )
    return cursor.lastrowid


def resolve_incident(conn: sqlite3.Connection, incident_id: int, timestamp: str):
    """Mark an incident as resolved."""
    conn.execute(
        "UPDATE incident_log SET resolved_at = ? WHERE id = ?",
        (timestamp, incident_id)
    )


def update_ingestion_stats(conn: sqlite3.Connection):
    """Record ingestion stats to the DB."""
    conn.execute(
        """INSERT INTO ingestion_stats (rows_inserted, errors, generator_pid, influx_writes)
           VALUES (?, ?, ?, ?)""",
        (_stats["rows_inserted"], _stats["errors"], os.getpid(), _stats["influx_writes"])
    )


# ─── InfluxDB Operations ──────────────────────────────────────────────────────
_influx_write_api = None
_influx_client = None

def init_influx():
    """Initialize InfluxDB 2.x write client."""
    global _influx_client, _influx_write_api
    if not INFLUX_AVAILABLE:
        logger.warning("influxdb-client package not installed; InfluxDB writes disabled.")
        return False
    try:
        _influx_client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
        _influx_write_api = _influx_client.write_api(write_options=SYNCHRONOUS)
        # Test connectivity
        health = _influx_client.health()
        if health.status == "pass":
            logger.info(f"InfluxDB connected: {INFLUX_URL} (status={health.status})")
            return True
        else:
            logger.warning(f"InfluxDB health check failed: {health.status}")
            return False
    except Exception as e:
        logger.warning(f"InfluxDB not available ({e}). Time-series writes will be skipped.")
        _influx_write_api = None
        return False


def write_to_influx(metrics: dict):
    """Write telemetry metrics as InfluxDB point."""
    if _influx_write_api is None:
        return
    try:
        point = (
            Point("network_telemetry")
            .tag("router_id", metrics["router_id"])
            .tag("router_name", metrics["router_name"])
            .tag("failure_label", str(metrics["failure_label"]))
            .field("latency", float(metrics["latency"]))
            .field("packet_loss", float(metrics["packet_loss"]))
            .field("jitter", float(metrics["jitter"]))
            .field("bandwidth", float(metrics["bandwidth"]))
            .field("cpu", float(metrics["cpu"]))
            .field("memory", float(metrics["memory"]))
            .field("link_status", int(metrics["link_status"]))
            .time(metrics["timestamp"], WritePrecision.SECONDS)
        )
        _influx_write_api.write(bucket=INFLUX_BUCKET, record=point)
        _stats["influx_writes"] += 1
    except Exception as e:
        logger.debug(f"InfluxDB write error: {e}")


# ─── Main Generation Loop ─────────────────────────────────────────────────────
def run_generator():
    """Main blocking loop — generates telemetry every GENERATE_INTERVAL seconds."""
    logger.info("=== ISRO Phase 1 Network Data Generator Starting ===")
    logger.info(f"SQLite DB: {DB_PATH}")
    logger.info(f"Routers: {list(ROUTERS.keys())}")
    logger.info(f"Interval: {GENERATE_INTERVAL}s | InfluxDB: {INFLUX_URL}")

    conn = init_database()
    influx_ok = init_influx()
    
    logger.info(f"InfluxDB available: {influx_ok}")
    logger.info("Generator running. Press Ctrl+C to stop.\n")

    stats_flush_counter = 0

    try:
        while True:
            loop_start = time.time()

            try:
                _check_manual_injections()
                _maybe_inject_scenario(loop_start)
                
                # Tick the physics engine once per interval
                _engine.step()

                for router_id in ROUTERS:
                    metrics = generate_metrics(router_id, loop_start)

                    # ── Incident tracking ─────────────────────────────────────
                    current_label = metrics["failure_label"]
                    active_incident_id = _active_incidents.get(router_id)

                    if current_label > 0 and active_incident_id is None:
                        # New failure detected — open incident
                        incident_id = write_incident(conn, router_id, metrics)
                        _active_incidents[router_id] = incident_id
                        logger.warning(
                            f"INCIDENT OPENED: {router_id} [{metrics['failure_label']}] → ID={incident_id}"
                        )
                    elif current_label == 0 and active_incident_id is not None:
                        # Failure resolved — close incident
                        resolve_incident(conn, active_incident_id, metrics["timestamp"])
                        _active_incidents[router_id] = None
                        logger.info(f"INCIDENT RESOLVED: {router_id} ID={active_incident_id}")

                    # ── Write to databases ────────────────────────────────────
                    write_snapshot(conn, metrics)
                    write_to_influx(metrics)
                    _stats["rows_inserted"] += 1

                conn.commit()

                # Flush ingestion stats every 30 iterations (~60 seconds)
                stats_flush_counter += 1
                if stats_flush_counter >= 30:
                    update_ingestion_stats(conn)
                    conn.commit()
                    stats_flush_counter = 0
                    elapsed = time.time() - _stats["started_at"]
                    rate = _stats["rows_inserted"] / max(elapsed, 1)
                    logger.info(
                        f"Stats: rows={_stats['rows_inserted']} influx={_stats['influx_writes']} "
                        f"errors={_stats['errors']} rate={rate:.1f} rows/s"
                    )

            except Exception as e:
                _stats["errors"] += 1
                logger.error(f"Generator loop error: {e}", exc_info=True)

            # Sleep for the remainder of the interval
            elapsed = time.time() - loop_start
            sleep_time = max(0.0, GENERATE_INTERVAL - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        logger.info("Generator stopped by user.")
    finally:
        update_ingestion_stats(conn)
        conn.commit()
        conn.close()
        if _influx_client:
            _influx_client.close()
        logger.info(f"Final stats: {_stats}")


if __name__ == "__main__":
    # Allow manual failure injection via CLI args
    # e.g., python generator.py inject NOC-DEL congestion 30
    if len(sys.argv) >= 5 and sys.argv[1] == "inject":
        router_id = sys.argv[2]
        ftype = sys.argv[3]
        duration = int(sys.argv[4])
        set_failure(router_id, ftype, duration)

    run_generator()
