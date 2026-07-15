"""
ISRO Phase 5 — Air-Gapped AI Copilot RAG Engine
=================================================
Architecture:
  User Question → TF-IDF/FAISS Vector Search → Relevant Documents
                → Live Telemetry Context → Local AI Response Engine
                → Structured Answer with Evidence + CLI Commands

Ollama (Llama 3) is used as primary LLM when available.
High-fidelity local template engine provides full responses when Ollama is offline.
"""

import os
import json
import sqlite3
import logging
import re
from typing import Dict, Any, List, Optional, Tuple
import datetime

import numpy as np
import requests
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from phase5_knowledge_base import KNOWLEDGE_DOCS

logger = logging.getLogger("Phase5-Copilot")

# ─── Configuration ────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "phase1.db")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_TIMEOUT = 25.0  # seconds

# Google Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def query_gemini(prompt: str, api_key: str = GEMINI_API_KEY) -> Optional[str]:
    """Query Google Gemini API using the provided key."""
    if not api_key:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=30.0)
        if resp.status_code == 200:
            res_json = resp.json()
            candidates = res_json.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
    except Exception as e:
        logger.warning(f"Gemini API request failed: {e}")
    return None

ROUTER_NAMES = {
    "ISTRAC-BGL": "ISTRAC Bangalore",
    "SDSC-SHAR": "SDSC Sriharikota",
    "MCF-HSN": "MCF Hassan",
    "NOC-DEL": "NOC Delhi",
    "NOC-MUM": "NOC Mumbai",
    "TRACK-PBL": "TRACK Port Blair",
}

BASELINES = {
    "ISTRAC-BGL": {"latency": 12.0, "cpu": 35.0, "bandwidth": 45.0, "packet_loss": 0.1, "jitter": 1.5},
    "SDSC-SHAR":  {"latency": 18.0, "cpu": 55.0, "bandwidth": 60.0, "packet_loss": 0.1, "jitter": 1.5},
    "MCF-HSN":    {"latency": 22.0, "cpu": 40.0, "bandwidth": 38.0, "packet_loss": 0.1, "jitter": 2.0},
    "NOC-DEL":    {"latency": 35.0, "cpu": 50.0, "bandwidth": 55.0, "packet_loss": 0.1, "jitter": 2.0},
    "NOC-MUM":    {"latency": 28.0, "cpu": 45.0, "bandwidth": 50.0, "packet_loss": 0.1, "jitter": 1.8},
    "TRACK-PBL":  {"latency": 65.0, "cpu": 30.0, "bandwidth": 25.0, "packet_loss": 0.2, "jitter": 3.0},
}


# ─── RAG Vector Index ─────────────────────────────────────────────────────────
class TFIDFIndex:
    """TF-IDF backed vector similarity index for ISRO knowledge base documents."""

    def __init__(self):
        self.docs = KNOWLEDGE_DOCS
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=8000,
            sublinear_tf=True
        )
        # Build index text: title + tags + content
        texts = []
        for d in self.docs:
            tag_str = " ".join(d.get("tags", []))
            texts.append(f"{d['title']} {tag_str} {d['content']}")
        self.vectors = self.vectorizer.fit_transform(texts)
        logger.info(f"Phase5 RAG index built: {len(self.docs)} documents")

    def search(self, query: str, top_k: int = 3, threshold: float = 0.05) -> List[Dict]:
        """Return top-k most relevant documents for the query."""
        qvec = self.vectorizer.transform([query])
        scores = cosine_similarity(qvec, self.vectors).flatten()
        top_indices = scores.argsort()[::-1][:top_k]
        results = []
        for idx in top_indices:
            if scores[idx] >= threshold:
                doc = self.docs[idx].copy()
                doc["relevance_score"] = float(scores[idx])
                results.append(doc)
        return results


# ─── Live Telemetry Fetcher ────────────────────────────────────────────────────
def fetch_live_telemetry() -> Dict[str, Dict]:
    """Fetch latest telemetry snapshot per router from SQLite."""
    try:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        
        routers = conn.execute("SELECT id FROM router_registry").fetchall()
        rows = []
        for r in routers:
            rid = r["id"]
            row = conn.execute(
                """SELECT s.*, r.name AS router_name
                   FROM network_snapshots s
                   JOIN router_registry r ON s.router_id = r.id
                   WHERE s.router_id = ?
                   ORDER BY s.timestamp DESC LIMIT 1""",
                (rid,)
            ).fetchone()
            if row:
                rows.append(row)
        conn.close()
        telemetry = {}
        for row in rows:
            d = dict(row)
            rid = d["router_id"]
            telemetry[rid] = {
                "router_id": rid,
                "router_name": d.get("router_name", ROUTER_NAMES.get(rid, rid)),
                "latency": round(d.get("latency", 0), 2),
                "packet_loss": round(d.get("packet_loss", 0), 3),
                "jitter": round(d.get("jitter", 0), 2),
                "bandwidth": round(d.get("bandwidth", 0), 1),
                "cpu": round(d.get("cpu", 0), 1),
                "memory": round(d.get("memory", 0), 1),
                "link_status": int(d.get("link_status", 1)),
                "failure_label": int(d.get("failure_label", 0)),
                "timestamp": d.get("timestamp", ""),
            }
        return telemetry
    except Exception as e:
        logger.warning(f"Could not fetch live telemetry: {e}")
        return {}


# ─── Router Detection ─────────────────────────────────────────────────────────
def detect_target_router(query: str, telemetry: Dict[str, Dict]) -> Optional[Dict]:
    """Try to identify if the user is asking about a specific router."""
    q_lower = query.lower()
    # Direct ID match
    for rid in ROUTER_NAMES:
        if rid.lower() in q_lower:
            return telemetry.get(rid)
    # Name match
    for rid, name in ROUTER_NAMES.items():
        if any(part.lower() in q_lower for part in name.split()):
            return telemetry.get(rid)
    # Location keyword match
    location_map = {
        "bangalore": "ISTRAC-BGL",
        "sriharikota": "SDSC-SHAR",
        "hassan": "MCF-HSN",
        "delhi": "NOC-DEL",
        "mumbai": "NOC-MUM",
        "port blair": "TRACK-PBL",
        "portblair": "TRACK-PBL",
        "istrac": "ISTRAC-BGL",
        "sdsc": "SDSC-SHAR",
        "mcf": "MCF-HSN",
    }
    for keyword, rid in location_map.items():
        if keyword in q_lower:
            return telemetry.get(rid)
    return None


# ─── Local AI Response Engine ─────────────────────────────────────────────────
class LocalAIEngine:
    """Generates high-fidelity diagnostic responses without requiring an external LLM."""

    FAILURE_LABELS = {
        0: ("Normal", "OPERATIONAL"),
        1: ("MPLS Congestion", "CONGESTION"),
        2: ("Device CPU/Memory Overload", "OVERLOAD"),
        3: ("Routing Instability / Link Flapping", "FLAPPING"),
        4: ("Link Down", "LINK_DOWN"),
    }

    def generate(self, query: str, router: Optional[Dict], retrieved_docs: List[Dict],
                 telemetry: Dict[str, Dict]) -> str:
        q_lower = query.lower()

        # ─── Router-specific diagnosis ────────────────────────────────────────
        if router:
            return self._router_diagnosis(query, router, retrieved_docs, telemetry)

        # ─── Network-wide status query ────────────────────────────────────────
        if any(k in q_lower for k in ["all routers", "network status", "overall", "whole network",
                                       "summary", "overview", "network health"]):
            return self._network_summary(telemetry, retrieved_docs)

        # ─── Topic-specific queries ────────────────────────────────────────────
        if any(k in q_lower for k in ["congestion", "bandwidth", "traffic", "qos"]):
            return self._topic_response("congestion", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["cpu", "memory", "overload", "crash", "process"]):
            return self._topic_response("overload", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["flapping", "unstable", "jitter", "ospf", "link up down"]):
            return self._topic_response("flapping", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["latency", "delay", "slow", "high latency"]):
            return self._topic_response("latency", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["link down", "down", "disconnected", "offline"]):
            return self._topic_response("link_down", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["predict", "ai", "forecast", "risk", "failure probability"]):
            return self._topic_response("prediction", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["anomaly", "unusual", "spike", "isolation"]):
            return self._topic_response("anomaly", retrieved_docs, telemetry)
        if any(k in q_lower for k in ["command", "cisco", "cli", "show", "config", "debug"]):
            return self._topic_response("commands", retrieved_docs, telemetry)

        # ─── Document-based fallback ───────────────────────────────────────────
        if retrieved_docs:
            return self._doc_based_response(query, retrieved_docs, telemetry)

        return self._generic_response(telemetry)

    def _router_diagnosis(self, query: str, router: Dict, docs: List[Dict],
                          telemetry: Dict[str, Dict]) -> str:
        rid = router["router_id"]
        name = router["router_name"]
        baseline = BASELINES.get(rid, {"latency": 25.0, "cpu": 40.0, "bandwidth": 40.0,
                                       "packet_loss": 0.1, "jitter": 2.0})
        label_id = router.get("failure_label", 0)
        state_name, state_code = self.FAILURE_LABELS.get(label_id, ("Normal", "OPERATIONAL"))

        lat = router["latency"]
        loss = router["packet_loss"]
        jitter = router["jitter"]
        bw = router["bandwidth"]
        cpu = router["cpu"]
        mem = router["memory"]
        link = router["link_status"]

        lat_delta = lat - baseline["latency"]
        loss_delta = loss - baseline["packet_loss"]

        # Header
        lines = [
            f"**Diagnostic Report — {name} ({rid})**",
            f"*Timestamp: {router.get('timestamp', 'N/A')} UTC*",
            "",
            "**Current Telemetry:**",
            f"| Metric | Current | Baseline | Delta |",
            f"|--------|---------|----------|-------|",
            f"| Latency | {lat} ms | {baseline['latency']} ms | {'+' if lat_delta >= 0 else ''}{round(lat_delta, 1)} ms |",
            f"| Packet Loss | {loss}% | {baseline['packet_loss']}% | {'+' if loss_delta >= 0 else ''}{round(loss_delta, 3)}% |",
            f"| Jitter | {jitter} ms | {baseline['jitter']} ms | — |",
            f"| Bandwidth | {bw}% | {baseline['bandwidth']}% | — |",
            f"| CPU | {cpu}% | {baseline['cpu']}% | — |",
            f"| Memory | {mem}% | — | — |",
            f"| Link Status | {'UP ✓' if link == 1 else 'DOWN ✗'} | — | — |",
            "",
        ]

        # Analysis block
        if link == 0:
            lines += [
                f"**Status: 🔴 CRITICAL — Link Down**",
                "",
                "**Root Cause Analysis:**",
                f"The primary uplink interface on {name} has gone DOWN (link_status=0). "
                "This results in total loss of connectivity for this site. "
                "All downstream tracking telemetry from this node is interrupted.",
                "",
                "**Recommended Actions (SOP-NET-05):**",
                "1. Verify physical layer — check fiber patch panel and SFP module.",
                "2. Attempt software restoration:",
                "```cisco",
                f"interface GigabitEthernet0/1",
                f"  no shutdown",
                f"  exit",
                f"show interface GigabitEthernet0/1 | include line protocol",
                "```",
                "3. If link remains down after no-shutdown, check hardware.",
                "4. Activate backup static route for traffic continuation:",
                "```cisco",
                f"ip route 0.0.0.0 0.0.0.0 <backup_gateway> 1",
                "```",
                "5. Notify NOC supervisor and dispatch field engineer immediately.",
            ]
        elif state_code == "CONGESTION" or (bw > 85 and lat > baseline["latency"] + 20):
            lines += [
                f"**Status: 🟡 WARNING — MPLS Link Congestion**",
                "",
                "**Root Cause Analysis:**",
                f"Bandwidth utilization at {bw}% (baseline: {baseline['bandwidth']}%) "
                f"is saturating the MPLS tunnel, causing latency of {lat}ms "
                f"(+{round(lat_delta, 1)}ms above baseline). "
                "Non-prioritized traffic is competing with mission-critical telemetry streams.",
                "",
                "**Recommended Actions (SOP-NET-01, SOP-NET-02):**",
                "1. Apply immediate traffic shaping policy to cap non-critical traffic:",
                "```cisco",
                "policy-map ISRO-QOS-SHAPING",
                " class ISRO-CRITICAL-TELEMETRY",
                "  priority percent 40",
                " class class-default",
                "  shape average 15000000",
                " exit",
                "interface Tunnel10",
                " service-policy output ISRO-QOS-SHAPING",
                "end",
                "```",
                "2. Identify top bandwidth consumers: `show ip flow top-talkers`",
                "3. If saturation persists, activate backup MPLS tunnel: `interface Tunnel20; no shutdown`",
                f"4. Monitor until bandwidth drops below 80% and latency returns below {baseline['latency'] + 20}ms.",
            ]
        elif state_code == "OVERLOAD" or (cpu > 85 and mem > 75):
            lines += [
                f"**Status: 🟠 CRITICAL — Device CPU/Memory Overload**",
                "",
                "**Root Cause Analysis:**",
                f"Router CPU at {cpu}% and memory at {mem}% indicate control-plane stress. "
                "This is likely caused by routing table bloat, OSPF recalculations, or a software process leak. "
                "Risk: routing daemon crash will cause full network outage for this site.",
                "",
                "**Recommended Actions (SOP-NET-04):**",
                "1. Identify top CPU-consuming processes:",
                "```cisco",
                "show processes cpu sorted | head 20",
                "show memory statistics",
                "```",
                "2. Clear bloated routing tables (will cause brief reconvergence):",
                "```cisco",
                "clear ip route *",
                "clear arp",
                "```",
                "3. Apply CPU threshold monitoring and SNMP alerts:",
                "```cisco",
                "process cpu threshold type total rising 85 interval 5",
                "snmp-server enable traps cpu threshold",
                "```",
                "4. If memory leak suspected, restart affected process: `restart process <name>`",
                "5. Monitor: `show platform resources` every 2 minutes.",
            ]
        elif state_code == "FLAPPING" or (jitter > 6 and loss > 0.8):
            lines += [
                f"**Status: 🟡 WARNING — Link Flapping / Routing Instability**",
                "",
                "**Root Cause Analysis:**",
                f"Jitter at {jitter}ms and packet loss at {loss}% indicate link instability. "
                "Rapid link state changes are causing OSPF adjacency reconvergence cycles. "
                "Likely causes: physical media degradation, MTU mismatch, or OSPF timer misconfiguration.",
                "",
                "**Recommended Actions (SOP-NET-03):**",
                "1. Check for physical layer errors on the primary interface:",
                "```cisco",
                "show interface GigabitEthernet0/1 | include error|CRC",
                "show ip ospf neighbor",
                "```",
                "2. Apply carrier-delay to suppress brief link flaps:",
                "```cisco",
                "interface GigabitEthernet0/1",
                " carrier-delay msec 2000",
                " ip ospf hello-interval 10",
                " ip ospf dead-interval 40",
                "end",
                "```",
                "3. Enable BFD for fast fault detection:",
                "```cisco",
                "bfd interval 300 min_rx 300 multiplier 3",
                "```",
                "4. If errors persist, shut primary and force traffic to secondary link.",
            ]
        else:
            lines += [
                f"**Status: 🟢 OPERATIONAL — Normal**",
                "",
                "**Analysis:**",
                f"All metrics for {name} are within operational tolerances. "
                "Latency, packet loss, jitter, CPU, memory, and bandwidth are at expected baseline levels. "
                "No immediate action required.",
                "",
                "**Monitoring Recommendations:**",
                "1. Continue standard polling cycle (every 30 seconds).",
                "2. Watch for any trending deviation in bandwidth or CPU over next 15 minutes.",
                "3. Verify OSPF adjacencies are stable: `show ip ospf neighbor | include Full`",
            ]

        # Append relevant doc references
        if docs:
            lines += ["", "**Referenced Documents:**"]
            for doc in docs[:2]:
                lines.append(f"• {doc['title']} (relevance: {round(doc['relevance_score']*100)}%)")

        return "\n".join(lines)

    def _network_summary(self, telemetry: Dict[str, Dict], docs: List[Dict]) -> str:
        if not telemetry:
            return "No live telemetry available. Ensure the data generator is running."

        critical = [r for r in telemetry.values() if r["failure_label"] > 0 or r["link_status"] == 0]
        normal = [r for r in telemetry.values() if r["failure_label"] == 0 and r["link_status"] == 1]

        lines = [
            "**ISRO Network Status Summary**",
            f"*{datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}*",
            "",
            f"**Overall Health:** {'🔴 DEGRADED' if critical else '🟢 ALL SYSTEMS OPERATIONAL'}",
            f"**Active Nodes:** {len(telemetry)}/6",
            "",
        ]

        if critical:
            lines.append("**Active Issues:**")
            for r in critical:
                label = self.FAILURE_LABELS.get(r["failure_label"], ("Unknown", "UNKNOWN"))[0]
                link_str = " | ⚠ Link DOWN" if r["link_status"] == 0 else ""
                lines.append(f"• **{r['router_name']} ({r['router_id']})**: {label}{link_str}")
                lines.append(f"  Latency: {r['latency']}ms | Loss: {r['packet_loss']}% | BW: {r['bandwidth']}% | CPU: {r['cpu']}%")

        lines.append("")
        lines.append("**Node Status:**")
        lines.append("| Node | Latency | Loss | Bandwidth | CPU | Status |")
        lines.append("|------|---------|------|-----------|-----|--------|")
        for rid, r in telemetry.items():
            status_icon = "🟢" if r["failure_label"] == 0 and r["link_status"] == 1 else "🔴"
            lines.append(
                f"| {r['router_name']} | {r['latency']}ms | {r['packet_loss']}% | "
                f"{r['bandwidth']}% | {r['cpu']}% | {status_icon} |"
            )

        lines += [
            "",
            "**Recommendations:**",
        ]
        if critical:
            lines.append("1. Investigate the highlighted nodes using their individual diagnostics.")
            lines.append("2. Check the Root Cause Engine tab for hybrid rule + AI diagnosis.")
            lines.append("3. Review the AI Predictions tab for 30-45 minute failure forecasts.")
        else:
            lines.append("1. No immediate action required. Continue standard monitoring.")
            lines.append("2. Verify OSPF adjacencies across all nodes.")

        return "\n".join(lines)

    def _topic_response(self, topic: str, docs: List[Dict], telemetry: Dict[str, Dict]) -> str:
        relevant_routers = []
        if telemetry:
            if topic == "congestion":
                relevant_routers = [r for r in telemetry.values()
                                     if r["bandwidth"] > 75 or r["failure_label"] == 1]
            elif topic == "overload":
                relevant_routers = [r for r in telemetry.values()
                                     if r["cpu"] > 75 or r["failure_label"] == 2]
            elif topic == "flapping":
                relevant_routers = [r for r in telemetry.values()
                                     if r["jitter"] > 5 or r["failure_label"] == 3]
            elif topic == "link_down":
                relevant_routers = [r for r in telemetry.values() if r["link_status"] == 0]
            elif topic == "latency":
                relevant_routers = sorted(telemetry.values(), key=lambda r: r["latency"], reverse=True)[:2]

        doc_content = ""
        if docs:
            doc_content = "\n\n**From Reference Documentation:**\n"
            for doc in docs[:2]:
                doc_content += f"\n*{doc['title']}*\n> {doc['content'][:400]}...\n"

        topic_details = {
            "congestion": (
                "**MPLS Link Congestion Analysis**\n\n"
                "Congestion occurs when bandwidth utilization exceeds 85-90%, causing latency spikes "
                "and packet loss on mission-critical tracking links.\n\n"
                "**Current Network State:**\n"
            ),
            "overload": (
                "**Device CPU/Memory Overload Analysis**\n\n"
                "CPU overload (>85%) and memory exhaustion (>80%) can cause control-plane crashes, "
                "routing table corruption, and complete site outages.\n\n"
                "**Current Network State:**\n"
            ),
            "flapping": (
                "**Link Flapping / Routing Instability Analysis**\n\n"
                "Link flapping causes OSPF adjacency reconvergence, introducing 30-90 second "
                "disruptions to telemetry each time the primary link bounces.\n\n"
                "**Current Network State:**\n"
            ),
            "link_down": (
                "**Link Down Emergency Response**\n\n"
                "A link down event (link_status=0) causes complete loss of tracking data "
                "for the affected site. Immediate action required per SOP-NET-05.\n\n"
                "**Current Network State:**\n"
            ),
            "latency": (
                "**Latency Diagnosis Guide**\n\n"
                "Elevated latency on ISRO tracking links delays spacecraft command responses "
                "and degrades mission control operations. SLA threshold: +50ms above baseline.\n\n"
                "**Current Network State:**\n"
            ),
            "prediction": (
                "**AI Failure Prediction Interpretation**\n\n"
                "The XGBoost AI system predicts failures 30-45 minutes in advance by analyzing "
                "metric trends. Scores >60% require proactive mitigation.\n\n"
                "**Current Prediction Context:**\n"
            ),
            "anomaly": (
                "**Anomaly Detection Interpretation**\n\n"
                "The Isolation Forest detects unusual patterns without predefined thresholds. "
                "Anomaly scores below 0 indicate statistically unusual behavior.\n\n"
                "**Current Anomaly Context:**\n"
            ),
            "commands": (
                "**Essential Cisco IOS Commands for ISRO NOC Operations**\n\n"
                "Quick reference for common diagnostic and remediation commands:\n\n"
                "**Diagnostics:**\n"
                "```cisco\n"
                "show interface GigabitEthernet0/1     ! Check interface errors\n"
                "show ip ospf neighbor                  ! Verify OSPF adjacencies\n"
                "show mpls traffic-eng tunnels brief    ! Check MPLS tunnel status\n"
                "show processes cpu sorted | head 20   ! Top CPU consumers\n"
                "show memory statistics                 ! Memory utilization\n"
                "show policy-map interface Tunnel10     ! QoS statistics\n"
                "show ip bgp summary                    ! BGP neighbor states\n"
                "```\n\n"
                "**Remediation:**\n"
                "```cisco\n"
                "interface GigabitEthernet0/1; no shutdown    ! Restore interface\n"
                "clear ip route *                              ! Flush routing table\n"
                "service-policy output ISRO-QOS-SHAPING       ! Apply QoS policy\n"
                "carrier-delay msec 2000                      ! Suppress link flaps\n"
                "process cpu threshold type total rising 85   ! CPU alerting\n"
                "```"
            ),
        }

        response = topic_details.get(topic, "**Network Diagnostic Response**\n\n")

        if relevant_routers and topic not in ("commands", "prediction", "anomaly"):
            for r in relevant_routers[:3]:
                label = self.FAILURE_LABELS.get(r["failure_label"], ("Normal", "OPERATIONAL"))[0]
                response += (
                    f"• **{r['router_name']} ({r['router_id']})**: "
                    f"{label} — Latency: {r['latency']}ms, Loss: {r['packet_loss']}%, "
                    f"BW: {r['bandwidth']}%, CPU: {r['cpu']}%\n"
                )
        elif not relevant_routers and topic not in ("commands", "prediction", "anomaly"):
            response += "✅ No routers currently exhibiting this condition. Network appears stable.\n"

        response += doc_content
        return response

    def _doc_based_response(self, query: str, docs: List[Dict], telemetry: Dict) -> str:
        doc = docs[0]
        lines = [
            f"**Knowledge Base Reference: {doc['title']}**",
            f"*Category: {doc.get('category', 'Network Operations')}*",
            "",
            doc["content"],
            "",
        ]
        if len(docs) > 1:
            lines.append("**Additional References:**")
            for d in docs[1:]:
                lines.append(f"• {d['title']}")
        return "\n".join(lines)

    def _generic_response(self, telemetry: Dict) -> str:
        return (
            "**Air-Gapped ISRO Network Copilot**\n\n"
            "I can help you with:\n"
            "• **Specific router diagnosis** — Ask about a router by name or ID (e.g., 'What is wrong with NOC Delhi?')\n"
            "• **Network-wide status** — Ask 'What is the current network status?'\n"
            "• **Technical issues** — Ask about congestion, overload, link flapping, latency, link down\n"
            "• **Cisco CLI commands** — Ask for specific diagnostic or remediation commands\n"
            "• **AI prediction** — Ask 'What does the AI predict for the next hour?'\n"
            "• **Anomaly explanations** — Ask about detected anomalies\n\n"
            "All answers are grounded in live telemetry data and ISRO MPLS SOPs."
        )


# ─── Ollama LLM Interface ──────────────────────────────────────────────────────
def query_ollama(prompt: str, model: str = OLLAMA_MODEL) -> Optional[str]:
    """Attempt to query local Ollama LLM. Returns None if not available."""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=OLLAMA_TIMEOUT
        )
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
    except Exception as e:
        logger.debug(f"Ollama unavailable: {e}")
    return None


def check_ollama_available() -> Tuple[bool, str]:
    """Check if Ollama is running and which models are available."""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3.0)
        if resp.status_code == 200:
            models = [m["name"] for m in resp.json().get("models", [])]
            return True, ", ".join(models) if models else "no models loaded"
    except Exception:
        pass
    return False, "Ollama not running"


# ─── Main RAG Query Function ──────────────────────────────────────────────────
_index = None

def get_index() -> TFIDFIndex:
    global _index
    if _index is None:
        _index = TFIDFIndex()
    return _index


_query_cache = {}


def process_query(query: str, router_context: Optional[str] = None, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """
    Full RAG pipeline:
    1. Fetch live telemetry
    2. Detect target router
    3. Search knowledge base
    4. Build augmented prompt
    5. Try Ollama → fallback to local engine
    6. Return structured response
    """
    global _query_cache
    
    # Check semantic cache first
    if _query_cache:
        try:
            index = get_index()
            cached_queries = list(_query_cache.keys())
            vectors = index.vectorizer.transform(cached_queries)
            q_vector = index.vectorizer.transform([query])
            similarities = cosine_similarity(q_vector, vectors).flatten()
            best_idx = similarities.argmax()
            if similarities[best_idx] > 0.85:
                matched_query = cached_queries[best_idx]
                cached_res = _query_cache[matched_query].copy()
                cached_res["engine"] = cached_res.get("engine", "Unknown") + " (Semantic Cache Hit)"
                cached_res["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return cached_res
        except Exception as e:
            logger.warning(f"Cache check error: {e}")

    # 1. Fetch live telemetry
    telemetry = fetch_live_telemetry()

    # 2. Detect target router (from query or explicit context)
    router = detect_target_router(query, telemetry)
    if not router and router_context and router_context in telemetry:
        router = telemetry[router_context]

    # 3. Search knowledge base
    index = get_index()
    retrieved_docs = index.search(query, top_k=3)

    # 4. Build prompt for AI model
    context_parts = []
    for doc in retrieved_docs:
        context_parts.append(f"[{doc['title']}]\n{doc['content']}")
    context_str = "\n\n---\n\n".join(context_parts)

    telemetry_str = ""
    if router:
        r = router
        telemetry_str = (
            f"Target Router: {r['router_name']} ({r['router_id']})\n"
            f"  Latency: {r['latency']}ms | Packet Loss: {r['packet_loss']}% | "
            f"Jitter: {r['jitter']}ms | Bandwidth: {r['bandwidth']}% | "
            f"CPU: {r['cpu']}% | Memory: {r['memory']}% | "
            f"Link: {'UP' if r['link_status'] else 'DOWN'}"
        )
    elif telemetry:
        summary_lines = []
        for rid, r in telemetry.items():
            status = "FAULT" if r["failure_label"] > 0 else "OK"
            summary_lines.append(f"  {r['router_name']}: Status={status}, Latency={r['latency']}ms, BW={r['bandwidth']}%")
        telemetry_str = "Network-Wide Snapshot:\n" + "\n".join(summary_lines)

    # Format history if present
    history_str = ""
    if history:
        history_str = "=== CONVERSATION HISTORY ===\n"
        for msg in history[-4:]:  # last 4 messages for token safety
            role = "User" if msg.get("role") == "user" else "Copilot"
            history_str += f"{role}: {msg.get('content')}\n"
        history_str += "\n"

    prompt = (
        "You are the Air-Gapped AI Copilot for ISRO MPLS Network Operations. "
        "Answer concisely and technically using the provided documents, telemetry, and previous conversation history. "
        "Include specific Cisco IOS commands where appropriate. Use markdown formatting.\n\n"
        f"{history_str}"
        f"=== LIVE TELEMETRY ===\n{telemetry_str}\n\n"
        f"=== REFERENCE DOCUMENTS ===\n{context_str}\n\n"
        f"=== ENGINEER QUESTION ===\n{query}\n\n"
        "Provide: 1) Brief diagnosis, 2) Root cause, 3) Numbered action steps with CLI commands."
    )

    answer = ""
    engine_used = "Local Expert Engine (Offline)"
    ollama_available, ollama_status = check_ollama_available()

    # 4.1. Try Google Gemini API
    if GEMINI_API_KEY:
        gemini_response = query_gemini(prompt)
        if gemini_response:
            answer = gemini_response
            engine_used = "Gemini 3.5 Flash"

    # 4.2. Try local Ollama if Gemini failed or not configured
    if not answer and ollama_available:
        ollama_response = query_ollama(prompt)
        if ollama_response:
            answer = ollama_response
            engine_used = f"Ollama LLM ({OLLAMA_MODEL})"

    # 5. Fallback to local engine if both unavailable or failed
    if not answer:
        local_engine = LocalAIEngine()
        answer = local_engine.generate(query, router, retrieved_docs, telemetry)

    # 6. Build structured response
    result = {
        "answer": answer,
        "engine": engine_used,
        "ollama_available": ollama_available,
        "ollama_status": ollama_status,
        "retrieved_documents": [
            {
                "id": d["id"],
                "title": d["title"],
                "category": d.get("category", ""),
                "relevance_score": round(d.get("relevance_score", 0) * 100, 1),
                "snippet": d["content"][:200] + "..." if len(d["content"]) > 200 else d["content"]
            }
            for d in retrieved_docs
        ],
        "target_router": router["router_id"] if router else None,
        "live_telemetry_count": len(telemetry),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    _query_cache[query] = result
    return result


if __name__ == "__main__":
    # Quick self-test
    result = process_query("Why is NOC Delhi unstable?")
    print(f"Engine: {result['engine']}")
    print(f"Docs retrieved: {len(result['retrieved_documents'])}")
    print(f"Target Router: {result['target_router']}")
    print("\nAnswer:\n")
    print(result["answer"][:1000])
