"""
ISRO Phase 3 — Unsupervised Anomaly Detection Engine
======================================================
Trains an Isolation Forest on normal historical telemetry to establish baseline traffic patterns,
then performs real-time point-anomaly and traffic surge detection on live metrics.
"""

import os
import sqlite3
import logging
import datetime
import time
from typing import Dict, Any, List, Tuple, Optional
import pandas as pd
import numpy as np

try:
    from sklearn.ensemble import IsolationForest
    import joblib
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Phase3-Anomalies")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "phase1.db")
MODEL_PATH = os.path.join(BASE_DIR, "phase3_anomaly_model.pkl")

# Metrics to track
METRICS = ["latency", "packet_loss", "jitter", "bandwidth", "cpu", "memory"]

# Features used to fit Isolation Forest: raw metrics + their rolling averages
def add_rolling_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for m in METRICS:
        df[f"{m}_roll_mean"] = df[m].rolling(window=15, min_periods=1).mean().astype(float)
    return df

def get_feature_names() -> List[str]:
    names = []
    for m in METRICS:
        names.append(m)
        names.append(f"{m}_roll_mean")
    return sorted(names)

FEATURE_COLS = get_feature_names()

def train_anomaly_model(db_conn: sqlite3.Connection) -> Dict[str, Any]:
    """Trains the Isolation Forest on past data to learn normal traffic patterns."""
    if not ML_AVAILABLE:
        return {"status": "error", "message": "ML libraries (scikit-learn) not installed."}

    try:
        # Load snapshots (limit to last 15,000 records to keep training fast)
        df = pd.read_sql_query(
            "SELECT * FROM network_snapshots ORDER BY router_id, timestamp ASC",
            db_conn
        )
        
        if len(df) < 150:
            return {
                "status": "insufficient_data",
                "message": f"Insufficient dataset size ({len(df)} samples). At least 150 samples are needed."
            }

        # Calculate features group by group (router by router)
        processed_groups = []
        for router_id, group in df.groupby("router_id"):
            group = group.reset_index(drop=True)
            group = add_rolling_features(group)
            processed_groups.append(group)

        train_df = pd.concat(processed_groups, ignore_index=True).dropna(subset=FEATURE_COLS)
        
        # Train Isolation Forest
        # We assume about 4% contamination (anomaly rate) in historical telemetry
        model = IsolationForest(
            n_estimators=100,
            contamination=0.04,
            random_state=42
        )
        
        model.fit(train_df[FEATURE_COLS])
        
        payload = {
            "model": model,
            "trained_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "num_samples": len(train_df),
            "feature_cols": FEATURE_COLS
        }
        
        joblib.dump(payload, MODEL_PATH)
        logger.info(f"Isolation Forest trained successfully on {len(train_df)} samples.")
        
        return {
            "status": "success",
            "num_samples": len(train_df),
            "trained_at": payload["trained_at"]
        }
    except Exception as e:
        logger.error(f"Isolation Forest training failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

def detect_anomalies(db_conn: sqlite3.Connection) -> Dict[str, Any]:
    """Runs point anomaly and traffic surge checks on live router data."""
    # Ensure model exists
    model_payload = None
    if os.path.exists(MODEL_PATH):
        try:
            model_payload = joblib.load(MODEL_PATH)
        except Exception as e:
            logger.warning(f"Error loading Isolation Forest model: {e}")

    if not model_payload:
        logger.info("No Isolation Forest model found. Training dynamically...")
        train_res = train_anomaly_model(db_conn)
        if train_res.get("status") == "success":
            try:
                model_payload = joblib.load(MODEL_PATH)
            except Exception:
                pass

    # Fetch router registry
    routers = db_conn.execute("SELECT id, name FROM router_registry").fetchall()
    
    results = {}
    
    for r in routers:
        rid, name = r["id"], r["name"]
        
        # Query latest 30 snapshots to calculate rolling averages
        snapshots = pd.read_sql_query(
            "SELECT * FROM network_snapshots WHERE router_id = ? ORDER BY timestamp DESC LIMIT 30",
            db_conn,
            params=(rid,)
        )
        # Reverse to chronological order
        snapshots = snapshots.iloc[::-1].reset_index(drop=True)
        
        if len(snapshots) < 10:
            results[rid] = {
                "router_id": rid,
                "router_name": name,
                "is_anomaly": False,
                "anomaly_score": 0.0,
                "explanation": "Normal operation (Collecting telemetry)",
                "spikes": [],
                "latest_metrics": {}
            }
            continue

        df_feats = add_rolling_features(snapshots)
        latest_row = df_feats.iloc[-1]
        x_vec = [float(latest_row[c]) for c in FEATURE_COLS]
        
        is_anomaly = False
        anomaly_score = 0.0
        
        if model_payload and ML_AVAILABLE:
            try:
                model = model_payload["model"]
                pred = model.predict([x_vec])[0]
                raw_score = model.score_samples([x_vec])[0]
                
                is_anomaly = bool(pred == -1)
                # Convert raw score (negative, e.g. -0.45 to -0.7) to absolute for presentation
                anomaly_score = float(round(abs(raw_score), 4))
            except Exception as e:
                logger.error(f"Inference failed for {rid}: {e}")
                is_anomaly = False
                anomaly_score = 0.0
        else:
            # Fallback heuristic
            latency = float(latest_row["latency"])
            packet_loss = float(latest_row["packet_loss"])
            cpu = float(latest_row["cpu"])
            if latency > 150.0 or packet_loss > 3.0 or cpu > 80.0:
                is_anomaly = True
                anomaly_score = 0.625
            else:
                is_anomaly = False
                anomaly_score = 0.385

        # Pinpoint exact metric spikes (plain NOC explainability)
        spikes = []
        
        # 1. CPU Overload / CPU Spike
        cpu_curr = float(latest_row["cpu"])
        cpu_mean = float(latest_row["cpu_roll_mean"])
        if cpu_curr > 85.0:
            spikes.append({
                "metric": "CPU",
                "type": "CPU Overload",
                "current": cpu_curr,
                "baseline": round(cpu_mean, 1),
                "severity": "CRITICAL",
                "message": f"Critical CPU overload: {cpu_curr}% utilization"
            })
        elif cpu_curr > cpu_mean + 20.0:
            spikes.append({
                "metric": "CPU",
                "type": "CPU Spike",
                "current": cpu_curr,
                "baseline": round(cpu_mean, 1),
                "severity": "WARNING",
                "message": f"Sudden CPU usage spike: {cpu_curr}% (normal {round(cpu_mean, 1)}%)"
            })

        # 2. Sudden Packet Loss
        loss_curr = float(latest_row["packet_loss"])
        loss_mean = float(latest_row["packet_loss_roll_mean"])
        if loss_curr > 5.0:
            spikes.append({
                "metric": "Packet Loss",
                "type": "High Packet Loss",
                "current": loss_curr,
                "baseline": round(loss_mean, 2),
                "severity": "CRITICAL",
                "message": f"Severe packet loss detected: {loss_curr}% packet drop"
            })
        elif loss_curr > loss_mean + 1.2:
            spikes.append({
                "metric": "Packet Loss",
                "type": "Packet Loss Spike",
                "current": loss_curr,
                "baseline": round(loss_mean, 2),
                "severity": "WARNING",
                "message": f"Sudden packet loss spike: {loss_curr}% (normal {round(loss_mean, 2)}%)"
            })

        # 3. Traffic Surge (Bandwidth)
        bw_curr = float(latest_row["bandwidth"])
        bw_mean = float(latest_row["bandwidth_roll_mean"])
        if bw_curr > 92.0:
            spikes.append({
                "metric": "Bandwidth",
                "type": "Link Saturation",
                "current": bw_curr,
                "baseline": round(bw_mean, 1),
                "severity": "CRITICAL",
                "message": f"Link bandwidth saturation: {bw_curr}% utilized"
            })
        elif bw_curr > bw_mean + 25.0:
            spikes.append({
                "metric": "Bandwidth",
                "type": "Traffic Surge",
                "current": bw_curr,
                "baseline": round(bw_mean, 1),
                "severity": "WARNING",
                "message": f"Unexpected traffic surge: {bw_curr}% (normal {round(bw_mean, 1)}%)"
            })

        # 4. Latency Spikes
        lat_curr = float(latest_row["latency"])
        lat_mean = float(latest_row["latency_roll_mean"])
        if lat_curr > 200.0:
            spikes.append({
                "metric": "Latency",
                "type": "Critical Latency",
                "current": lat_curr,
                "baseline": round(lat_mean, 1),
                "severity": "CRITICAL",
                "message": f"Critical latency spike: {lat_curr}ms"
            })
        elif lat_curr > lat_mean + 40.0:
            spikes.append({
                "metric": "Latency",
                "type": "Latency Spike",
                "current": lat_curr,
                "baseline": round(lat_mean, 1),
                "severity": "WARNING",
                "message": f"Sudden latency spike: {lat_curr}ms (normal {round(lat_mean, 1)}ms)"
            })

        # Build clean status explanations
        if is_anomaly:
            if spikes:
                explanation = "Isolation Forest flagged anomalies: " + ", ".join([s["type"] for s in spikes])
            else:
                explanation = "Isolation Forest detected abnormal drift in telemetry coordinates."
        else:
            explanation = "All metrics are within normal baseline traffic boundaries."

        # If any spike is critical, ensure it is flagged as anomaly
        if any(s["severity"] == "CRITICAL" for s in spikes):
            is_anomaly = True

        results[rid] = {
            "router_id": rid,
            "router_name": name,
            "is_anomaly": is_anomaly,
            "anomaly_score": anomaly_score,
            "explanation": explanation,
            "spikes": spikes,
            "latest_metrics": {
                "latency": lat_curr,
                "packet_loss": loss_curr,
                "jitter": float(latest_row["jitter"]),
                "bandwidth": bw_curr,
                "cpu": cpu_curr,
                "memory": float(latest_row["memory"])
            }
        }

    return results

if __name__ == "__main__":
    conn = sqlite3.connect(DB_PATH)
    print("Training Isolation Forest...")
    print(train_anomaly_model(conn))
    print("\nDetecting Anomalies:")
    import json
    print(json.dumps(detect_anomalies(conn), indent=2))
    conn.close()
