import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.ensemble import IsolationForest
import warnings
warnings.filterwarnings('ignore')

class NetworkIntelligence:
    def __init__(self):
        self.xgb_model = None
        self.iso_forest = None
        self.feature_cols = [
            "latency", "packet_loss", "jitter", "bandwidth", "cpu", "memory", "link_status",
            "latency_roll_mean", "packet_loss_roll_mean", "cpu_roll_mean", "bandwidth_roll_mean"
        ]
        # Normal baselines for explainable comparison
        self.baselines = {
            "latency": 17.0,
            "packet_loss": 0.1,
            "jitter": 1.7,
            "bandwidth": 35.0,
            "cpu": 25.0,
            "memory": 45.0
        }

    def train(self, raw_df: pd.DataFrame):
        """Train models on synthetic historical data."""
        processed_data = []
        
        # Group by router to compute rolling features correctly
        for router_id, group in raw_df.groupby("router_id"):
            # Sort by timestamp
            group = group.sort_values("timestamp")
            
            # Compute rolling features
            group["latency_roll_mean"] = group["latency"].rolling(window=10, min_periods=1).mean()
            group["packet_loss_roll_mean"] = group["packet_loss"].rolling(window=10, min_periods=1).mean()
            group["cpu_roll_mean"] = group["cpu"].rolling(window=10, min_periods=1).mean()
            group["bandwidth_roll_mean"] = group["bandwidth"].rolling(window=10, min_periods=1).mean()
            
            # Define target: fail_soon (1 if failure_label > 0 in the next 15 periods)
            # We look ahead up to 15 periods
            will_fail = []
            labels = group["failure_label"].values
            for idx in range(len(group)):
                # Lookahead window
                lookahead = labels[idx+1 : idx+16]
                if len(lookahead) > 0 and any(lookahead > 0):
                    will_fail.append(1)
                else:
                    will_fail.append(0)
            group["fail_soon"] = will_fail
            processed_data.append(group)
            
        df = pd.concat(processed_data, ignore_index=True)
        
        # Drop rows with NaN if any
        df = df.dropna()
        
        # 1. Train XGBoost Predictor
        X = df[self.feature_cols]
        y = df["fail_soon"]
        
        # Ensure we have both classes represented
        if len(np.unique(y)) > 1:
            self.xgb_model = XGBClassifier(
                n_estimators=50, 
                max_depth=4, 
                learning_rate=0.1, 
                random_state=42,
                eval_metric="logloss"
            )
            self.xgb_model.fit(X, y)
        else:
            # Fallback if binary target lacks variation
            self.xgb_model = None

        # 2. Train Isolation Forest Anomaly Detector
        # Fit on normal data points only, or general dataset
        self.iso_forest = IsolationForest(
            n_estimators=100, 
            contamination=0.1, 
            random_state=42
        )
        # Use current raw metrics for point anomaly detection
        raw_feature_cols = ["latency", "packet_loss", "jitter", "bandwidth", "cpu", "memory"]
        self.iso_forest.fit(df[raw_feature_cols])

    def predict_node(self, node_history: list) -> dict:
        """Runs inference for a specific node given its history list.
        Returns:
            - failure_risk (probability %)
            - is_anomaly (boolean)
            - anomaly_score (float)
            - explanation (str)
            - root_cause (str)
            - cli_recommendation (str)
        """
        if len(node_history) < 1:
            return {"failure_risk": 0, "is_anomaly": False, "explanation": "No data", "root_cause": "Normal", "cli_recommendation": ""}
            
        latest = node_history[-1]
        router_id = latest["router_id"]
        
        # Compute rolling stats manually from history
        latencies = [pt["latency"] for pt in node_history[-10:]]
        losses = [pt["packet_loss"] for pt in node_history[-10:]]
        cpus = [pt["cpu"] for pt in node_history[-10:]]
        bws = [pt["bandwidth"] for pt in node_history[-10:]]
        
        feat_dict = {
            "latency": latest["latency"],
            "packet_loss": latest["packet_loss"],
            "jitter": latest["jitter"],
            "bandwidth": latest["bandwidth"],
            "cpu": latest["cpu"],
            "memory": latest["memory"],
            "link_status": latest["link_status"],
            "latency_roll_mean": np.mean(latencies),
            "packet_loss_roll_mean": np.mean(losses),
            "cpu_roll_mean": np.mean(cpus),
            "bandwidth_roll_mean": np.mean(bws)
        }
        
        # XGBoost Failure Risk
        risk_prob = 0.0
        if self.xgb_model is not None:
            feat_df = pd.DataFrame([feat_dict])[self.feature_cols]
            risk_prob = float(self.xgb_model.predict_proba(feat_df)[0][1])
        else:
            # Fallback heuristic if XGBoost not fitted
            if latest["failure_label"] > 0:
                risk_prob = 1.0
            elif feat_dict["cpu_roll_mean"] > 75 or feat_dict["bandwidth_roll_mean"] > 80:
                risk_prob = 0.75
            else:
                risk_prob = 0.05
                
        # Adjust risk probability to display percentages cleanly
        risk_pct = round(risk_prob * 100, 1)
        
        # Isolation Forest Anomaly Detection
        raw_feats = [latest["latency"], latest["packet_loss"], latest["jitter"], latest["bandwidth"], latest["cpu"], latest["memory"]]
        is_anomaly = False
        anomaly_score = 0.0
        if self.iso_forest is not None:
            pred = self.iso_forest.predict([raw_feats])[0]
            # score_samples returns negative values (lower is more anomalous)
            raw_score = self.iso_forest.score_samples([raw_feats])[0]
            anomaly_score = float(round(abs(raw_score), 3))
            is_anomaly = bool(pred == -1)
            
        # Root Cause Analysis and Explainable AI (XAI)
        root_cause = "Normal Operations"
        explanation = "All key telemetry metrics (latency, bandwidth, CPU, and link status) are within nominal operational parameters."
        cli_recommendation = ""
        
        # Rule correlation engine + feature deviation analysis
        deviations = {}
        for key in self.baselines.keys():
            dev = latest[key] / self.baselines[key]
            if dev > 1.25:  # 25% deviation
                deviations[key] = dev
                
        if latest["link_status"] == 0 or latest["packet_loss"] > 10.0:
            root_cause = "Routing Instability / Link Flapping"
            explanation = (
                f"Severe network instability detected on router {router_id}. "
                f"Packet loss is extremely high ({latest['packet_loss']}%). "
                f"Latency has spiked to {latest['latency']}ms due to packet retransmissions. "
                "The SD-WAN path is flapping, causing traffic drops."
            )
            cli_recommendation = (
                f"! Emergency reroute for {latest['router_name']}\n"
                f"interface GigabitEthernet0/1\n"
                f" description Primary MPLS Tunnel - Link Unstable\n"
                f" shutdown\n"
                f"!\n"
                f"interface GigabitEthernet0/2\n"
                f" description secondary SD-WAN Backup Path\n"
                f" no shutdown\n"
                f"ip route 0.0.0.0 0.0.0.0 10.100.200.2\n"
                f"end"
            )
            risk_pct = max(risk_pct, 95.0)  # High risk
            
        elif latest["cpu"] > 85.0 or latest["memory"] > 85.0:
            root_cause = "Device CPU/Memory Overload"
            explanation = (
                f"Device controller for {latest['router_name']} is under critical resource stress. "
                f"CPU utilization is at {latest['cpu']}% and Memory usage is at {latest['memory']}%. "
                "This could cause routing daemon timeouts and hardware-level packet drops."
            )
            cli_recommendation = (
                f"! Resource management configuration on {latest['router_name']}\n"
                f"process cpu threshold type total rising 80 interval 5\n"
                f"snmp-server enable traps cpu\n"
                f"!\n"
                f"! Clear memory buffers & restart helper process\n"
                f"clear ip route *\n"
                f"clear counters\n"
                f"end"
            )
            risk_pct = max(risk_pct, 80.0)
            
        elif latest["bandwidth"] > 80.0 or latest["latency"] > 60.0 or latest["packet_loss"] > 2.0:
            root_cause = "MPLS Underlay Congestion"
            explanation = (
                f"High bandwidth utilization ({latest['bandwidth']}%) is causing traffic congestion. "
                f"Latency is elevated ({latest['latency']}ms) with packet loss of {latest['packet_loss']}%. "
                "SD-WAN controllers are attempting to buffer non-critical packets."
            )
            cli_recommendation = (
                f"! Apply QoS and traffic shaping on {latest['router_name']}\n"
                f"policy-map ISRO-QOS-SHAPING\n"
                f" class ISRO-CRITICAL-DATA\n"
                f"  priority percent 50\n"
                f" class class-default\n"
                f"  shape average 10000000\n"
                f"!\n"
                f"interface Tunnel10\n"
                f" service-policy output ISRO-QOS-SHAPING\n"
                f"end"
            )
            risk_pct = max(risk_pct, 70.0)
            
        elif len(deviations) > 0:
            # General anomaly/early warning
            root_cause = "Subtle Telemetry Drift"
            triggers = ", ".join([f"{k} (+{int((v-1)*100)}%)" for k, v in deviations.items()])
            explanation = (
                f"Early warning indicator: Telemetry parameters are drifting from baseline. "
                f"Elevated parameters: {triggers}. "
                "A predictive warning is generated to schedule proactive link diagnostics."
            )
            cli_recommendation = (
                f"! Diagnostic logging trigger\n"
                f"debug ip ospf event\n"
                f"show interface counters errors\n"
                f"end"
            )
            risk_pct = max(risk_pct, 35.0)

        # Build timeline logs to display in the UI
        timeline_events = []
        if latest["cpu"] > 75.0:
            timeline_events.append({"time": latest["timestamp"], "type": "warning", "msg": f"CPU utilization spike: {latest['cpu']}%"})
        if latest["packet_loss"] > 1.5:
            timeline_events.append({"time": latest["timestamp"], "type": "critical", "msg": f"Packet Loss elevated: {latest['packet_loss']}%"})
        if latest["bandwidth"] > 80.0:
            timeline_events.append({"time": latest["timestamp"], "type": "info", "msg": f"Bandwidth exceeded threshold: {latest['bandwidth']}%"})
            
        return {
            "failure_risk": risk_pct,
            "is_anomaly": is_anomaly,
            "anomaly_score": anomaly_score,
            "explanation": explanation,
            "root_cause": root_cause,
            "cli_recommendation": cli_recommendation,
            "timeline_events": timeline_events
        }
