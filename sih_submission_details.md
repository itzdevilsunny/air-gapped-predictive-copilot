# ISRO Air-Gapped Predictive NOC Copilot — Submission Details

This document contains the accurate technology stack and estimated implementation cost details for the **ISRO Air-Gapped Predictive NOC Copilot** project, formatted for direct copy-pasting into hackathon submission portals or proposal forms.

---

## 🛠️ Technologies to be Used in the Solution

The solution utilizes a highly optimized, modular, and air-gap-compatible technology stack designed to run locally on ground-station infrastructure without external network dependencies.

### 1. Frontend & Visualization Layer
* **React 18 & Vite:** High-performance, single-page application framework for real-time dashboard updates.
* **TypeScript:** Ensures type safety and solid code structure across dashboards.
* **Tailwind CSS:** Modern utility-first CSS framework for custom, high-visibility dark themes (glassmorphic panels, system topology views).
* **HTML5 Canvas:** Custom-built high-performance graphics engine for the real-time **Space Segment Radar** mapping satellite orbits and ground station links.
* **Recharts & Lucide React:** Clean visual graphing of telemetry history and modern iconography.

### 2. Backend & Event-Driven Streaming Engine
* **Python 3.10+:** Core runtime for telemetry processing, network calculations, and AI logic.
* **FastAPI:** Asynchronous, high-throughput web framework to handle parallel REST API requests.
* **Uvicorn:** Ultra-fast ASGI server for running the FastAPI application.
* **WebSockets (`websockets` library):** Establishes a persistent, high-frequency channel to stream real-time metric snapshots (CPU, bandwidth, latency, jitter) to the frontend every 1–2 seconds.

### 3. Data Engineering & Storage (Air-Gap Ready)
* **SQLite (WAL Mode):** Primary local database utilizing Write-Ahead Logging (WAL) to enable concurrent reads during high-speed telemetry ingestion.
* **InfluxDB Client:** Prepared client library integration for optional time-series storage to archive long-term network packet metrics.

### 4. Machine Learning & Predictive AI Pipeline
* **XGBoost:** Powers the **Phase 2 Predictive Anomaly Engine** to calculate threat scores (0–100%) and estimate Time-to-Failure (ETA) for network routers using rolling metrics.
* **Scikit-Learn (Isolation Forest):** Powers the **Phase 3 Unsupervised Anomaly Detection** to flag unseen traffic spikes and out-of-bounds network behaviors.
* **Joblib & Pandas/NumPy:** Utilized for model serialization, feature engineering (vectorized `.rolling()` windows), and high-frequency array computations.

### 5. Secure Knowledge Retrieval & LLM Core
* **Local RAG (Retrieval-Augmented Generation):** Implemented using Scikit-Learn's TF-IDF Vectorizer and Cosine Similarity to index and retrieve local Standard Operating Procedure (SOP) text documents securely.
* **Ollama (Production Deployment):** Runs local open-source Large Language Models (e.g., Llama 3 8B, Mistral 7B) on edge servers for 100% air-gapped operations.
* **Google Generative AI SDK (Hybrid Development):** Integrates Gemini 2.5 Flash/Pro for cloud-enabled high-reasoning development tasks.

### 6. Voice & Accessibility Interface
* **Web Speech API:** Leverages browser-integrated Speech-to-Text and Text-to-Speech engines for hands-free troubleshooting via the "Chitthi" voice assistant.

### 7. Network Automation & Remediation Engine
* **Cisco IOS CLI Generator:** Programmatic rule engine to output precise CLI configuration patches based on detected faults.
* **Netmiko (Python SSH):** Integration library for dispatching self-healing scripts directly to active routers over secure local management networks.

---

## 💰 Estimated Implementation Cost (Optional)

The system is designed with an **open-source core**, minimizing licensing costs. The primary investment goes toward secure local hardware for LLM inference, integration, and security auditing.

| Category | Description | Estimated Cost (INR) | Estimated Cost (USD) |
| :--- | :--- | :--- | :--- |
| **Edge Hardware (LLM Inference)** | 2x High-performance workstations / rack servers equipped with 1x NVIDIA RTX 6000 Ada (48GB VRAM) or A100 GPU to run local LLMs (Llama 3 70B / Mistral) at low latency. | ₹12,0,000 | $14,500 |
| **NOC Compute Nodes** | Redundant server hardware for running the FastAPI backend, SQLite/InfluxDB database, and React frontend clients. | ₹4,00,000 | $4,800 |
| **Software & AI Licenses** | Core stack built on open-source software (Python, React, SQLite, Ollama, FastAPI). | ₹0 (Free) | $0 (Free) |
| **Integration & Auditing** | Cybersecurity penetration testing, code review for air-gapped compliance, and integration with existing SNMP/Syslog infrastructure. | ₹3,0,000 | $3,600 |
| **Staff Training & Deployment** | Operators training, SOP digitalization, deployment support, and system documentation. | ₹1,00,000 | $1,200 |
| **Total Estimated Budget** | **Complete deployment for a local ISRO Ground Station NOC.** | **₹20,00,000** | **$24,100** |

### Cost Efficiency Justifications:
1. **Zero Recurring License Costs:** Avoids expensive proprietary APM (Application Performance Monitoring) licenses by building on top of custom FastAPI/SQLite and open-source dashboards.
2. **Local AI Model Hosting:** Ollama hosting eliminates ongoing API token costs (saving thousands of dollars annually in commercial LLM bills) while ensuring complete air-gapped security.
