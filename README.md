# 🛰️ ISRO Air-Gapped Predictive NOC Copilot

> **Autonomous 6-Phase AI-Driven Network Operations Centre for ISRO Ground Station Infrastructure**

A full-stack, real-time network intelligence platform that monitors, predicts, detects, diagnoses, and autonomously heals ISRO's mission-critical ground station network — from telemetry streaming to self-healing CLI script generation.

---

## 🖥️ Live Dashboards

| Dashboard | Port | Description |
|-----------|------|-------------|
| **Phase 1-5 Unified** | `5175` | Main NOC dashboard — Telemetry, ML Predictions, Anomaly Detection, Root Cause, AI Copilot |
| **Phase 6 Self-Healing** | `5176` | Network Topology Map + Autonomous Self-Healing Engine |
| **Phase 1 API Backend** | `8001` | FastAPI backend with WebSocket telemetry stream |
| **Legacy NOC Backend** | `8000` | Original backend API |

---

## 🏗️ Architecture — 6-Phase AI Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ISRO NOC AI Pipeline                              │
│                                                                     │
│  Phase 1: Telemetry Simulation & Live Data Streaming (SQLite+WS)   │
│      ↓                                                              │
│  Phase 2: XGBoost Failure Prediction (risk_score + ETA)            │
│      ↓                                                              │
│  Phase 3: Isolation Forest Anomaly Detection                        │
│      ↓                                                              │
│  Phase 4: Rule + AI Hybrid Root Cause Analysis                      │
│      ↓                                                              │
│  Phase 5: RAG AI Copilot (Gemini 2.5 Flash / Ollama / Local)       │
│      ↓                                                              │
│  Phase 6: Autonomous Self-Healing Engine (CLI Script Generation)    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/itzdevilsunny/air-gapped-predictive-copilot.git
cd air-gapped-predictive-copilot
```

### 2. Setup Python Virtual Environment
```bash
# Create venv inside backend directory
cd backend
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (Linux/Mac)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
cd ..
```

### 3. Setup Phase 1 Backend (Main AI Engine)
```bash
cd phase1-backend

# Install Python dependencies (uses same venv as backend)
..\backend\.venv\Scripts\pip install -r requirements.txt

# The SQLite database is auto-initialized on first run
```

### 4. Install Frontend Dependencies
```bash
# Phase 1-5 Unified Dashboard
cd phase1-dashboard
npm install
cd ..

# Phase 6 Self-Healing Dashboard
cd phase6-dashboard
npm install
cd ..
```

### 5. Launch Everything (Windows)
Use the included launch script:
```bash
start-all.bat
```

**Or start manually in separate terminals:**

```bash
# Terminal 1 — Phase 1 AI Backend (port 8001)
cd phase1-backend
..\backend\.venv\Scripts\python -m uvicorn phase1_api:app --host 127.0.0.1 --port 8001

# Terminal 2 — Phase 1-5 Dashboard (port 5175)
cd phase1-dashboard
npm run dev -- --port 5175

# Terminal 3 — Phase 6 Self-Healing Dashboard (port 5176)
cd phase6-dashboard
npm run dev -- --port 5176

# Terminal 4 — Start Telemetry Generator (via dashboard UI or:)
cd phase1-backend
..\backend\.venv\Scripts\python generator.py
```

### 6. Open the Dashboards
- **Main NOC Dashboard:** http://localhost:5175
- **Phase 6 Self-Healing:** http://localhost:5176
- **API Docs:** http://localhost:8001/docs

---

## 📁 Project Structure

```
air-gapped-predictive-copilot/
├── phase1-backend/              # 🧠 Core AI Engine (FastAPI)
│   ├── phase1_api.py            #   Main API server (port 8001)
│   ├── generator.py             #   Telemetry simulator
│   ├── phase2_predictor.py      #   XGBoost failure prediction
│   ├── phase3_anomalies.py      #   Isolation Forest anomaly detection
│   ├── phase4_root_cause.py     #   Rule + AI root cause engine
│   ├── phase5_copilot.py        #   RAG AI copilot (Gemini/Ollama)
│   ├── phase5_knowledge_base.py #   ISRO SOP knowledge base
│   ├── phase6_selfheal.py       #   Self-healing recommendation engine
│   ├── db_schema.sql            #   SQLite schema
│   └── network_engine.py        #   Network simulation utilities
│
├── phase1-dashboard/            # 📊 Main NOC Dashboard (React+Vite)
│   └── src/
│       ├── App.tsx              #   Main unified dashboard app
│       ├── components/
│       │   ├── PredictionPanel.tsx      # Phase 2 ML predictions UI
│       │   ├── AnomalyPanel.tsx         # Phase 3 anomaly detection UI
│       │   ├── RootCausePanel.tsx       # Phase 4 root cause UI
│       │   ├── CopilotPanel.tsx         # Phase 5 AI chat UI
│       │   ├── MetricsChart.tsx         # Live telemetry charts
│       │   ├── RouterGrid.tsx           # Router status grid
│       │   ├── IncidentTimeline.tsx     # Incident log timeline
│       │   ├── GeneratorControl.tsx     # Telemetry generator controls
│       │   ├── DataTable.tsx            # Raw data table
│       │   ├── DatabaseHealth.tsx       # DB health monitor
│       │   └── TopologySimulator.tsx    # Network topology map
│       └── index.css            #   Design system
│
├── phase6-dashboard/            # 🔧 Phase 6 Self-Healing Dashboard (React+Vite)
│   └── src/
│       ├── App.tsx              #   Phase 6 unified command center
│       └── index.css            #   Dark command-center theme
│
├── backend/                     # 🏛️ Legacy NOC Backend (port 8000)
│   ├── main.py                  #   Original FastAPI backend
│   ├── copilot.py               #   Original copilot engine
│   └── requirements.txt         #   Python dependencies
│
├── frontend/                    # 🌐 Legacy Landing Page
│   └── src/                     #   Original dashboard
│
├── start-all.bat                # ▶️ Windows one-click launcher
├── start-phase1.bat             # ▶️ Legacy backend launcher
├── vercel.json                  # ☁️ Vercel deployment config
└── PROJECT_OVERVIEW.md          # 📄 Detailed project description
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ph1/snapshots` | GET | Raw telemetry data (paginated) |
| `/api/ph1/incidents` | GET | Incident log |
| `/api/ph1/generator/status` | GET | Generator status & row count |
| `/api/ph1/generator/start` | POST | Start telemetry generator |
| `/api/ph1/generator/stop` | POST | Stop telemetry generator |
| `/api/ph1/inject` | POST | Inject failure scenario |
| `/api/ph2/predictions` | GET | XGBoost failure predictions (all routers) |
| `/api/ph2/train` | POST | Retrain ML model |
| `/api/ph2/model/status` | GET | ML model metadata |
| `/api/ph3/anomalies` | GET | Isolation Forest anomaly scores |
| `/api/ph3/train` | POST | Retrain anomaly model |
| `/api/ph4/root_cause` | GET | Root cause analysis |
| `/api/ph5/query` | POST | AI copilot natural language query |
| `/api/ph5/status` | GET | AI engine status (Gemini/Ollama) |
| `/api/ph6/selfheal` | GET | Self-healing recommendations |
| `/api/ph6/topology` | GET | Network topology with live status |
| `/ws/ph1/stream` | WS | Real-time telemetry WebSocket stream |

---

## 🤖 AI Features

### Phase 2 — XGBoost Failure Predictor
- Trains on historical telemetry: latency, CPU, packet loss, bandwidth, jitter
- Computes rolling stats (5/15/30/60-min windows) + lag features
- Predicts: MPLS Congestion, Device Overload, Link Instability
- Risk score 0-100% with estimated time-to-failure

### Phase 3 — Isolation Forest Anomaly Detection
- Unsupervised multivariate anomaly detection
- Rolling feature engineering for temporal patterns
- Detects traffic spikes and metric outliers

### Phase 4 — Root Cause Analysis Engine
- Rule-based expert system with AI attribution
- Correlates multiple metrics to identify failure type
- Evidence-based confidence scoring

### Phase 5 — RAG AI Copilot
- Built-in ISRO network operations knowledge base (22KB of SOPs)
- Supports: Gemini 2.5 Flash API, Ollama (local LLM), Rule-based fallback
- Fully air-gapped compatible with local Ollama models

### Phase 6 — Autonomous Self-Healing Engine
- Correlates Phase 2 predictions + Phase 4 root cause in real-time
- Generates priority-ordered mitigation playbooks (P1-CRITICAL to P4-NORMAL)
- Auto-generates Cisco IOS CLI scripts for immediate remediation
- Auto-generates Python netmiko automation scripts
- Impact analysis with downstream router cascade prediction

---

## 🌐 ISRO Network Topology

```
                    ISTRAC-BGL (Master Hub)
                   /         |          \
          SDSC-SHAR      NOC-DEL      NOC-MUM
         (Launch Site)  (N.India)    (W.India)
                             |
                         TRACK-PBL
                        (Port Blair)
                   MCF-HSN
                  (Hassan)
```

| Router | Role | Criticality |
|--------|------|-------------|
| ISTRAC-BGL | Master NOC Hub | CRITICAL |
| SDSC-SHAR | Launch Site Operations | CRITICAL |
| MCF-HSN | Satellite Control | HIGH |
| NOC-DEL | Northern India Gateway | HIGH |
| NOC-MUM | Western India Gateway | MEDIUM |
| TRACK-PBL | Downrange Tracking Station | HIGH |

---

## ⚙️ Environment Variables (Optional)

Create a `.env` file in `phase1-backend/` for AI features:

```env
# Gemini API (for Phase 5 Copilot - most powerful mode)
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama (for fully air-gapped mode)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# InfluxDB (optional time-series storage)
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your_token
INFLUX_ORG=isro-noc
INFLUX_BUCKET=isro_telemetry
```

---

## 🔧 Failure Injection

Test the AI engine by injecting synthetic failures via the dashboard or API:

```bash
# Inject MPLS Congestion on ISTRAC-BGL for 60 steps
curl -X POST http://localhost:8001/api/ph1/inject \
  -H "Content-Type: application/json" \
  -d '{"router_id": "ISTRAC-BGL", "failure_type": "congestion", "duration_steps": 60}'

# Available failure types: normal, congestion, overload, instability, link_down
```

---

## 📦 Dependencies

### Python (phase1-backend)
- `fastapi` — Async web framework
- `uvicorn` — ASGI server
- `xgboost` — Gradient boosting ML model
- `scikit-learn` — Isolation Forest, TF-IDF
- `pandas` / `numpy` — Data processing
- `joblib` — Model serialization
- `google-generativeai` — Gemini API (optional)

### Node.js (phase1-dashboard, phase6-dashboard)
- `react` + `react-dom` — UI framework
- `vite` — Build tool
- `typescript` — Type safety
- `recharts` — Chart library
- `lucide-react` — Icons

---

## 🏆 Key Technical Innovations

1. **Zero-Copy AI Loop**: Background analysis thread (4s interval) pre-computes all ML results and serves them from cache — API responses are <1ms
2. **WAL Mode SQLite**: Write-Ahead Logging enables concurrent reads during generator writes
3. **Vectorized Feature Engineering**: Pandas `.rolling()` + `pd.concat()` instead of row-by-row assignment — eliminates DataFrame fragmentation
4. **MAX(id) over COUNT(*)**: Generator status uses indexed primary key lookup instead of full-table scan — 1000x faster on 180MB database
5. **Thread-Pool Offloading**: CPU-bound ML inference runs via `asyncio.to_thread()` — keeps FastAPI event loop non-blocking

---

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| AI Analysis Loop | ~0.45s per cycle |
| API Response Time | <5ms (cached) |
| WebSocket Latency | ~2s refresh |
| Telemetry Throughput | ~120 rows/min |
| SQLite DB Size | ~180MB (160K+ rows) |

---

## 📄 License

MIT License — Built for ISRO Smart India Hackathon 2025

---

*Built with ❤️ by Team — Autonomous AI-driven Network Operations for India's Space Programme*
