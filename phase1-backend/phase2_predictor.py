"""
ISRO Phase 2 — AI Failure Predictor
===================================
Handles feature engineering, XGBoost training, and real-time failure prediction.
Optimized version using vectorized pandas operations for fast training.
"""

import os
import sqlite3
import logging
import datetime
import random
import time
from typing import Dict, Any, Tuple, List, Optional
import pandas as pd
import numpy as np

# Try importing ML libraries
try:
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, precision_score, recall_score
    import joblib
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Phase2-Predictor")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "phase1.db")
MODEL_PATH = os.path.join(BASE_DIR, "phase2_model.pkl")

# Fixed list of features in sorted order to prevent feature mismatch
METRICS = ["latency", "packet_loss", "jitter", "bandwidth", "cpu", "memory"]
WINDOWS = [5, 15, 30, 60]
LAGS = [5, 15, 30]

def get_feature_names() -> List[str]:
    """Generate deterministic feature names list."""
    names = []
    for m in METRICS:
        names.append(f"{m}_curr")
    for w in WINDOWS:
        for m in METRICS:
            names.append(f"{m}_mean_{w}")
            names.append(f"{m}_std_{w}")
            names.append(f"{m}_max_{w}")
            names.append(f"{m}_min_{w}")
    for lag in LAGS:
        for m in METRICS:
            names.append(f"{m}_lag_{lag}")
            names.append(f"{m}_delta_{lag}")
            names.append(f"{m}_rate_{lag}")
    return sorted(names)

FEATURE_COLS = get_feature_names()

def add_features_to_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes rolling & lag features on a dataframe of sequential snapshots.
    df must be sorted by timestamp ascending.
    Vectorized implementation for maximum performance.
    """
    df = df.copy()
    
    # Current values
    for m in METRICS:
        df[f"{m}_curr"] = df[m].astype(float)
        
    # Rolling stats
    for w in WINDOWS:
        for m in METRICS:
            rolling = df[m].rolling(window=w, min_periods=1)
            df[f"{m}_mean_{w}"] = rolling.mean().astype(float)
            df[f"{m}_std_{w}"] = rolling.std().fillna(0.0).astype(float)
            df[f"{m}_max_{w}"] = rolling.max().astype(float)
            df[f"{m}_min_{w}"] = rolling.min().astype(float)
            
    # Lag & trend features
    for lag in LAGS:
        for m in METRICS:
            df[f"{m}_lag_{lag}"] = df[m].shift(lag).astype(float)
            # Fill NaNs with the first value of the series
            first_val = float(df[m].iloc[0]) if len(df) > 0 else 0.0
            df[f"{m}_lag_{lag}"] = df[f"{m}_lag_{lag}"].fillna(first_val)
            df[f"{m}_delta_{lag}"] = df[m].astype(float) - df[f"{m}_lag_{lag}"]
            df[f"{m}_rate_{lag}"] = df[f"{m}_delta_{lag}"] / lag
            
    return df

def prepare_training_data(db_conn: sqlite3.Connection) -> Tuple[pd.DataFrame, np.ndarray]:
    """
    Queries historical snapshots and constructs (X, y) datasets.
    Target y = failure_type (1=congestion, 2=overload, 3=instability/linkdown)
    if a failure occurs in the future window [t + 15, t + 45] steps.
    """
    df = pd.read_sql_query(
        "SELECT * FROM network_snapshots ORDER BY router_id, timestamp ASC",
        db_conn
    )
    
    X_list = []
    y_list = []
    
    if len(df) < 100:
        return pd.DataFrame(columns=FEATURE_COLS), np.array([])
        
    for router_id, group in df.groupby("router_id"):
        group = group.reset_index(drop=True)
        # We need enough snapshots to look back and look forward
        n = len(group)
        if n < 80:
            continue
            
        # Compute all features on the full group dataframe at once (highly optimized!)
        group_with_features = add_features_to_df(group)
        
        # Loop through training samples
        for i in range(60, n - 45):
            # Features vector at step i
            row = group_with_features.iloc[i]
            x_vec = [float(row[c]) for c in FEATURE_COLS]
            
            # Future look-ahead window [i+15, i+45] steps
            future_slice = group.iloc[i+15 : i+46]
            
            # Label target based on failure occurrence in lookahead
            failures = future_slice[future_slice["failure_label"] > 0]
            if not failures.empty:
                # Target is the first failure type in that future window
                target_label = int(failures["failure_label"].iloc[0])
            else:
                target_label = 0
                
            X_list.append(x_vec)
            y_list.append(target_label)
            
    if not X_list:
        return pd.DataFrame(columns=FEATURE_COLS), np.array([])
        
    X = pd.DataFrame(X_list, columns=FEATURE_COLS)
    y = np.array(y_list)
    return X, y

def train_model(db_conn: sqlite3.Connection) -> Dict[str, Any]:
    """Trains the XGBoost classifier and saves it to disk."""
    if not ML_AVAILABLE:
        return {"status": "error", "message": "ML libraries (xgboost/sklearn) not available."}
        
    try:
        X, y = prepare_training_data(db_conn)
        if len(X) < 100 or len(np.unique(y)) < 2:
            return {
                "status": "insufficient_data",
                "message": f"Insufficient historical dataset size ({len(X)} samples) or class diversity to train model."
            }
            
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # XGBoost classifier
        model = xgb.XGBClassifier(
            n_estimators=80,
            max_depth=4,
            learning_rate=0.08,
            objective="multi:softprob",
            num_class=4,
            random_state=42,
            eval_metric="mlogloss"
        )
        
        model.fit(X_train, y_train)
        
        # Predict on validation set
        y_pred = model.predict(X_val)
        acc = float(accuracy_score(y_val, y_pred))
        prec = float(precision_score(y_val, y_pred, average="macro", zero_division=0))
        rec = float(recall_score(y_val, y_pred, average="macro", zero_division=0))
        
        model_payload = {
            "model": model,
            "metrics": {
                "accuracy": acc,
                "precision": prec,
                "recall": rec
            },
            "trained_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "num_samples": len(X),
            "feature_cols": FEATURE_COLS
        }
        
        joblib.dump(model_payload, MODEL_PATH)
        logger.info(f"Model trained successfully. Accuracy: {acc:.2f}, samples: {len(X)}")
        
        return {
            "status": "success",
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "num_samples": len(X),
            "trained_at": model_payload["trained_at"]
        }
    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

def predict_all_routers(db_conn: sqlite3.Connection) -> Dict[str, Any]:
    """Computes failure predictions for all routers."""
    # Ensure model is loaded or trained
    model_payload = None
    if os.path.exists(MODEL_PATH):
        try:
            model_payload = joblib.load(MODEL_PATH)
        except Exception as e:
            logger.warning(f"Error loading saved model: {e}")
            
    if not model_payload:
        # Try to train it dynamically on startup
        logger.info("No saved model found or load failed. Attempting dynamic training...")
        train_res = train_model(db_conn)
        if train_res.get("status") == "success":
            model_payload = joblib.load(MODEL_PATH)
            
    # Read router registry
    routers = db_conn.execute("SELECT id, name FROM router_registry").fetchall()
    
    predictions = {}
    
    for r in routers:
        rid, name = r["id"], r["name"]
        
        # Get last 60 snapshots
        snapshots = pd.read_sql_query(
            "SELECT * FROM network_snapshots WHERE router_id = ? ORDER BY timestamp DESC LIMIT 60",
            db_conn,
            params=(rid,)
        )
        
        # Sort ascending for feature calculation
        snapshots = snapshots.iloc[::-1].reset_index(drop=True)
        
        if len(snapshots) < 10:
            predictions[rid] = {
                "router_id": rid,
                "router_name": name,
                "risk_score": 0,
                "prediction": "Normal operation (Collecting telemetry)",
                "eta_minutes": None,
                "failure_type": "normal"
            }
            continue
            
        # Compute features on the latest snapshots
        group_with_features = add_features_to_df(snapshots)
        latest_row = group_with_features.iloc[-1]
        x_vec = [float(latest_row[c]) for c in FEATURE_COLS]
        
        # Default predictions fallback if ML model is unavailable
        if not model_payload or not ML_AVAILABLE:
            # Fallback heuristic
            cpu_curr = float(latest_row.get("cpu_curr", 0.0))
            lat_curr = float(latest_row.get("latency_curr", 0.0))
            
            if cpu_curr > 75:
                risk = int(cpu_curr)
                predictions[rid] = {
                    "router_id": rid,
                    "router_name": name,
                    "risk_score": risk,
                    "prediction": f"High probability of device overload within next {random.randint(32, 38)} minutes.",
                    "eta_minutes": random.randint(32, 38),
                    "failure_type": "overload"
                }
            elif lat_curr > 80 and float(latest_row.get("packet_loss_curr", 0.0)) > 2.0:
                predictions[rid] = {
                    "router_id": rid,
                    "router_name": name,
                    "risk_score": 85,
                    "prediction": f"High probability of MPLS congestion within next {random.randint(30, 35)} minutes.",
                    "eta_minutes": random.randint(30, 35),
                    "failure_type": "congestion"
                }
            else:
                predictions[rid] = {
                    "router_id": rid,
                    "router_name": name,
                    "risk_score": 5,
                    "prediction": "Normal operation",
                    "eta_minutes": None,
                    "failure_type": "normal"
                }
            continue
            
        # Inference using trained XGBoost model
        model = model_payload["model"]
        
        probs = model.predict_proba([x_vec])[0]
        # classes: 0 = normal, 1 = congestion, 2 = overload, 3 = instability/link_down
        
        risk_score = 1.0 - probs[0]
        pred_class = int(np.argmax(probs[1:]) + 1)
        pred_prob = probs[pred_class]
        
        failure_map = {
            1: "MPLS congestion",
            2: "device overload",
            3: "link instability"
        }
        fail_name = failure_map.get(pred_class, "network anomaly")
        
        # Risk thresholds
        risk_pct = int(risk_score * 100)
        
        if risk_score > 0.40:
            # Estimate ETA minutes in simulated range 30-45 minutes
            eta_mins = 30 + int((1.0 - (min(risk_score, 1.0) - 0.4) / 0.6) * 15)
            eta_mins = max(30, min(45, eta_mins))
            
            predictions[rid] = {
                "router_id": rid,
                "router_name": name,
                "risk_score": risk_pct,
                "prediction": f"High probability of {fail_name} within next {eta_mins} minutes.",
                "eta_minutes": eta_mins,
                "failure_type": ["normal", "congestion", "overload", "instability"][pred_class]
            }
        else:
            predictions[rid] = {
                "router_id": rid,
                "router_name": name,
                "risk_score": max(2, risk_pct),
                "prediction": "Normal operation",
                "eta_minutes": None,
                "failure_type": "normal"
            }
            
    return predictions

if __name__ == "__main__":
    # Test script directly
    conn = sqlite3.connect(DB_PATH)
    print("Deterministically computed features list size:", len(FEATURE_COLS))
    print("Starting ML Model training...")
    res = train_model(conn)
    print("Training Response:", res)
    if res.get("status") == "success":
        preds = predict_all_routers(conn)
        print("Predictions:")
        for r_id, p in preds.items():
            print(f"Device: {r_id} | Risk: {p['risk_score']}% | {p['prediction']}")
    conn.close()
