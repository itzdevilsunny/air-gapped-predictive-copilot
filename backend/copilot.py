import json
import os
import requests
from typing import Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def query_gemini(prompt: str, api_key: str = GEMINI_API_KEY) -> Optional[str]:
    """Query Google Gemini API using the provided key."""
    if not api_key:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
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
    except Exception:
        pass
    return None

# Local offline Knowledge Database documents
OFFLINE_DOCS = [
    {
        "id": "doc1",
        "title": "ISRO MPLS Underlay QoS Policy SOP",
        "content": (
            "SOP-NET-01: Quality of Service (QoS) configurations for critical tracking telemetry. "
            "Primary tracking telemetry (tracking data, telemetry links) must be mapped to the IP Precedence 5 / DSCP EF class. "
            "If congestion is observed, shape non-critical bandwidth to 10Mbps maximum. "
            "Apply command 'service-policy output ISRO-QOS-SHAPING' to interfaces to prevent congestion."
        )
    },
    {
        "id": "doc2",
        "title": "Cisco SD-WAN Link Flapping Troubleshooting",
        "content": (
            "Troubleshooting link flapping and routing flaps in SD-WAN tunnels over MPLS. "
            "Link status toggling (flapping) is often caused by OSPF Hello interval mismatch or MTU fragmentation. "
            "To resolve routing instability, verify MTU size is 1500 (or 1400 on tunnels) and shut down the unstable primary interface "
            "to reroute traffic to the secondary backup path: 'interface GigabitEthernet0/1; shutdown' and 'interface GigabitEthernet0/2; no shutdown'."
        )
    },
    {
        "id": "doc3",
        "title": "Incident Log: Delhi NOC Router Memory Leak (ISRO-2025-08)",
        "content": (
            "Incident Report: Router NOC-DEL experienced routing daemon crash due to CPU and Memory exhaustion. "
            "Resolution: The routing tables had ballooned, causing memory buffers to fill. Clear router tables with 'clear ip route *' "
            "and apply memory threshold monitoring commands: 'process cpu threshold type total rising 80 interval 5'."
        )
    },
    {
        "id": "doc4",
        "title": "OSPF Link State Database Instability SOP",
        "content": (
            "SOP-OSPF-04: Managing database flaps. If routes are flapping, turn on OSPF events debug: 'debug ip ospf event'. "
            "Validate interface error counters using 'show interface counters errors' to check for physical layer faults."
        )
    },
    {
        "id": "doc5",
        "title": "ISRO Mission Control Center Network Topology Guidelines",
        "content": (
            "Architecture Guide: The ISRO MPLS mesh connects ISTRAC Bangalore (master control), SDSC Sriharikota (launch site), "
            "MCF Hassan (satellite control), NOC Delhi, NOC Mumbai (gateways), and TRACK Port Blair (downrange station). "
            "Standard latency threshold between Bangalore and Sriharikota is 25ms. Jitter must be below 5ms for secure voice control."
        )
    }
]

class AirGappedCopilot:
    def __init__(self, ollama_url="http://localhost:11434", model_name="llama3", sops_dir=None):
        self.ollama_url = ollama_url
        self.model_name = model_name
        self.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
        if sops_dir is None:
            self.sops_dir = os.path.join(os.path.dirname(__file__), "sops")
        else:
            self.sops_dir = sops_dir
            
        os.makedirs(self.sops_dir, exist_ok=True)
        self.vectorizer = TfidfVectorizer()
        self.docs = []
        self.doc_texts = []
        self.doc_vectors = None
        self.reload_sops()

    def check_ollama_available(self) -> tuple:
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=3.0)
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                return True, ", ".join(models) if models else "no models loaded"
        except Exception:
            pass
        return False, "Ollama not running"


    def reload_sops(self):
        docs = []
        if os.path.exists(self.sops_dir):
            for filename in os.listdir(self.sops_dir):
                if filename.endswith(".txt") or filename.endswith(".md"):
                    filepath = os.path.join(self.sops_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            content = f.read().strip()
                        if not content:
                            continue
                        
                        lines = content.split("\n")
                        title = lines[0].strip()
                        body = content
                        
                        if len(title) > 80 or not title:
                            title = filename.replace("_", " ").replace(".txt", "").replace(".md", "").title()
                        else:
                            if len(lines) > 1:
                                body = "\n".join(lines[1:]).strip()
                                
                        docs.append({
                            "id": filename,
                            "title": title,
                            "content": body
                        })
                    except Exception as e:
                        print(f"Error loading SOP {filename}: {e}")
                        
        self.docs = docs
        if len(self.docs) > 0:
            self.doc_texts = [f"{d['title']}\n{d['content']}" for d in self.docs]
            self.doc_vectors = self.vectorizer.fit_transform(self.doc_texts)
        else:
            self.doc_texts = []
            self.doc_vectors = None

    def retrieve_context(self, query: str, top_k=2) -> list:
        """Performs cosine similarity search over local documents."""
        if not self.docs or self.doc_vectors is None:
            return []
            
        query_vector = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vector, self.doc_vectors).flatten()
        top_indices = similarities.argsort()[-top_k:][::-1]
        
        results = []
        for idx in top_indices:
            if idx < len(self.docs) and similarities[idx] > 0.05:  # Relevance threshold
                results.append(self.docs[idx])
        return results

    def query(self, query: str, current_telemetry: dict = None, history: list = None) -> dict:
        """Processes the query, retrieves RAG context, and queries local LLM (or falls back)."""
        retrieved_docs = self.retrieve_context(query)
        context_str = "\n\n".join([f"Source: {d['title']}\nContent: {d['content']}" for d in retrieved_docs])
        
        # Structure system telemetry context if present
        telemetry_str = "No active telemetry loaded."
        if current_telemetry:
            telemetry_str = json.dumps(current_telemetry, indent=2)

        # Format history if present
        history_str = ""
        if history:
            history_str = "=== CONVERSATION HISTORY ===\n"
            for msg in history[-4:]:  # last 4 messages for token safety
                role = "User" if msg.get("role") == "user" else "Copilot"
                history_str += f"{role}: {msg.get('content')}\n"
            history_str += "\n"

        prompt = (
            f"You are the Air-Gapped Network Copilot for ISRO MPLS Operations.\n"
            f"Answer the user's question based on the retrieved offline documentation, live network telemetry, and previous conversation history provided.\n\n"
            f"{history_str}"
            f"=== LIVE NETWORK TELEMETRY ===\n{telemetry_str}\n\n"
            f"=== RETRIEVED OFFLINE SOPs/MANUALS ===\n{context_str}\n\n"
            f"=== USER QUESTION ===\n{query}\n\n"
            f"Provide a clear, technical response with bullet points, explaining what the issue is, "
            f"referencing the SOP documents if applicable, and listing the precise CLI commands or troubleshooting steps to take."
        )
        
        # 1. Try Google Gemini API first
        if GEMINI_API_KEY:
            gemini_ans = query_gemini(prompt)
            if gemini_ans:
                return {
                    "answer": gemini_ans,
                    "retrieved_documents": retrieved_docs,
                    "engine": "Gemini 2.5 Flash"
                }

        # 2. Try local Ollama if running
        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model_name,
                    "prompt": prompt,
                    "stream": False
                },
                timeout=5.0
            )
            if response.status_code == 200:
                answer = response.json().get("response", "")
                return {
                    "answer": answer,
                    "retrieved_documents": retrieved_docs,
                    "engine": f"Ollama ({self.model_name})"
                }
        except Exception:
            # Fall back to local high-fidelity generator
            pass
            
        # 3. High-Fidelity Local Template Generator
        answer = self._generate_local_fallback(query, retrieved_docs, current_telemetry)
        
        return {
            "answer": answer,
            "retrieved_documents": retrieved_docs,
            "engine": "Local Expert Rules (Offline Fallback)"
        }

    def _generate_local_fallback(self, query: str, retrieved_docs: list, telemetry: dict) -> str:
        q_lower = query.lower()
        
        # 1. Check if asking about a specific router
        router_target = None
        if telemetry:
            for rid, details in telemetry.items():
                if rid.lower() in q_lower or details["router_name"].lower() in q_lower:
                    router_target = details
                    break
                    
        # Match search queries
        if router_target:
            status = "UP" if router_target["link_status"] == 1 else "DOWN"
            lbl_map = {0: "Normal", 1: "MPLS Congestion", 2: "Device CPU/Memory Overload", 3: "Routing Instability / Link Flapping"}
            state = lbl_map.get(router_target.get("failure_label", 0), "Normal")
            
            ans = (
                f"### Operations Diagnosis for **{router_target['router_name']}** ({router_target['router_id']})\n\n"
                f"Currently, this router is operating in state: **{state}**.\n"
                f"- **Link Status:** {status}\n"
                f"- **Latency:** {router_target['latency']} ms\n"
                f"- **Packet Loss:** {router_target['packet_loss']} %\n"
                f"- **Jitter:** {router_target['jitter']} ms\n"
                f"- **Bandwidth Utilization:** {router_target['bandwidth']} %\n"
                f"- **CPU / Memory:** {router_target['cpu']}% / {router_target['memory']}%\n\n"
            )
            
            if state == "MPLS Congestion":
                ans += (
                    "**Analysis & Recommendations:**\n"
                    "- The metrics show high Bandwidth utilization and elevated Latency, indicating heavy congestion on the MPLS link.\n"
                    "- In accordance with **ISRO MPLS Underlay QoS Policy SOP**, priority classes should be enforced immediately.\n"
                    "**Troubleshooting Actions:**\n"
                    "1. Reroute non-critical traffic classes.\n"
                    "2. Apply Cisco CLI Shaping controls to the primary interface:\n"
                    "```cisco\n"
                    "policy-map ISRO-QOS-SHAPING\n"
                    " class ISRO-CRITICAL-DATA\n"
                    "  priority percent 50\n"
                    " class class-default\n"
                    "  shape average 10000000\n"
                    "interface Tunnel10\n"
                    " service-policy output ISRO-QOS-SHAPING\n"
                    "```\n"
                )
            elif state == "Device CPU/Memory Overload":
                ans += (
                    "**Analysis & Recommendations:**\n"
                    "- The router controller is overwhelmed with CPU and RAM utilization exceeding 85%.\n"
                    "- This issue corresponds to **Incident Log: Delhi NOC Router Memory Leak (ISRO-2025-08)**.\n"
                    "**Troubleshooting Actions:**\n"
                    "1. Refresh OSPF router lookup tables.\n"
                    "2. Apply CPU logging limits and thresholds using the commands:\n"
                    "```cisco\n"
                    "process cpu threshold type total rising 80 interval 5\n"
                    "clear ip route *\n"
                    "```\n"
                )
            elif state == "Routing Instability / Link Flapping":
                ans += (
                    "**Analysis & Recommendations:**\n"
                    "- The packet loss rate is critical and link flaps are occurring, causing routing degradation.\n"
                    "- In line with the **Cisco SD-WAN Link Flapping SOP**, you should isolate the flapping link to prevent OSPF recalculations.\n"
                    "**Troubleshooting Actions:**\n"
                    "1. Terminate the flapping primary OSPF interface to enforce secondary link usage:\n"
                    "```cisco\n"
                    "interface GigabitEthernet0/1\n"
                    " shutdown\n"
                    "interface GigabitEthernet0/2\n"
                    " no shutdown\n"
                    "```\n"
                )
            else:
                ans += (
                    "**Analysis:**\n"
                    "This node is healthy. No action required. Telemetry metrics are within bounds.\n"
                )
            return ans

        # General Q&A fallback based on retrieved documents
        if len(retrieved_docs) > 0:
            doc = retrieved_docs[0]
            ans = (
                f"### Copilot Offline Knowledge Lookup: **{doc['title']}**\n\n"
                f"Here is relevant information from the offline repository:\n\n"
                f"> {doc['content']}\n\n"
                f"**Suggested Troubleshooting Procedures:**\n"
            )
            if "qos" in doc["title"].lower() or "bandwidth" in q_lower:
                ans += (
                    "1. Ensure core tracking streams are mapped to DSCP EF class.\n"
                    "2. Deploy rate limit policy configs to edge MPLS endpoints.\n"
                    "3. Run `show policy-map interface` to inspect class drop statistics."
                )
            elif "flapping" in doc["title"].lower() or "unstable" in q_lower or "loss" in q_lower:
                ans += (
                    "1. Execute `show ip ospf neighbor` to check adjacency status.\n"
                    "2. Shutdown flapping gigabit interfaces and fall back to secondary SD-WAN route.\n"
                    "3. Adjust keepalive intervals to prevent false drops on high-latency links."
                )
            else:
                ans += (
                    "1. Verify hardware log buffers using `show logging`.\n"
                    "2. Check routing tables using `show ip route`.\n"
                    "3. Monitor device resource state via SNMP."
                )
            return ans
            
        # Catch-all
        return (
            "### Air-Gapped Network Copilot Assistance\n\n"
            "I could not locate an exact match for your question in the offline manuals.\n"
            "Here is the standard troubleshooting protocol for ISRO MPLS operations:\n"
            "1. **Check Live Alerts:** Look at the Prediction Panel to see if any routers show a high risk scoring (>70%).\n"
            "2. **Identify Root Cause:** Click on the router on the Topology map to check its CPU, Memory, Latency, and Jitter trends.\n"
            "3. **Inspect the logs:** Check for interface packet loss anomalies.\n"
            "4. **Query Specific Nodes:** Ask me about a specific branch (e.g. 'Why is SDSC Sriharikota failing?') to pull node diagnostic reports."
        )
