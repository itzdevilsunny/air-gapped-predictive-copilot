# ISRO Air-Gapped Predictive NOC Copilot

## 1. Problem Statement
Managing mission-critical space communication networks and ground station infrastructure at ISRO requires flawless execution. Network Operations Centers (NOCs) handle vast amounts of telemetry data from routers, switches, and satellite links. 
Currently, network monitoring is largely **reactive** and **manual**. When critical anomalies occur (such as OSPF routing instability, sudden link flapping, or solar flare disruptions), NOC engineers must manually cross-reference real-time metrics with hundreds of pages of Standard Operating Procedures (SOPs). In isolated, high-security (air-gapped) environments, operators lack access to modern cloud-based troubleshooting aids, leading to high Mean Time To Resolution (MTTR) and high cognitive load during high-stakes space missions.

## 2. What We Are Solving
We are building an **Intelligent, Air-Gapped-Ready Network Operations Copilot** that acts as an expert digital assistant for NOC engineers. 

Specifically, this platform solves:
* **Information Overload:** By visualizing complex topology and live metrics in an intuitive, unified dashboard.
* **Slow Troubleshooting:** By detecting anomalies in real-time and automatically retrieving the exact mitigation steps from internal SOPs using AI.
* **Lack of Predictive Insights:** By simulating and analyzing network behavior to flag failure risks before they cause total outages.
* **Accessibility during Crises:** By providing a voice-enabled AI assistant ("Chitthi") that allows engineers to troubleshoot hands-free while focusing on primary mission displays.

## 3. Technology Stack
The project is built on a modern, high-performance, and modular stack:

**Frontend (Client & Visualization):**
* **React 18 & Vite:** For a lightning-fast, component-based user interface.
* **TypeScript:** Ensures type safety and reduces runtime errors.
* **Tailwind CSS:** For rapid, custom styling and dynamic themes (glassmorphism, radar UI).
* **Lucide React:** Modern iconography.
* **HTML5 Canvas:** Used for the high-performance, custom animated Space Segment Radar display.

**Backend (Data & AI Engine):**
* **Python 3.10+:** Core language for data processing and AI logic.
* **FastAPI:** High-performance asynchronous web framework for REST APIs and WebSocket management.
* **Uvicorn:** ASGI server to run the backend.
* **Scikit-Learn:** Used for TF-IDF vectorization and Cosine Similarity to power the local Retrieval-Augmented Generation (RAG) system.
* **Pydantic:** Data validation and settings management.

**AI & Machine Learning:**
* **Local RAG Architecture:** Reads local `.txt` and `.md` SOP files to build a secure knowledge base.
* **LLM Integration:** Currently integrated with **Groq (Llama 3)** for ultra-fast voice chat and **Gemini 2.5 Flash** for complex reasoning. (Designed to be swappable with local **Ollama** models for 100% air-gapped environments).
* **Speech/Voice:** Browser-based Web Speech API for dictation and speech synthesis.

## 4. How It Works (Step-by-Step)
1. **Telemetry Generation:** The Python `simulator.py` continuously generates realistic network metrics (CPU, bandwidth, latency) for ground routers (e.g., SDSC-SHAR, ISTRAC) and orbital mechanics/signal data for satellites (Cartosat-3, GSAT-31).
2. **Real-Time Streaming:** This data is pushed to the React frontend via a high-frequency **WebSocket** connection (approx. every 1-2 seconds).
3. **Visualization & Detection:** The frontend updates the Topology Map and Satellite Radar instantly. If the backend simulator detects metrics crossing critical thresholds (e.g., simulated Solar Flare zeroes out SNR), it flags an anomaly.
4. **Context Retrieval (RAG):** When an engineer asks the Copilot for help, the backend intercepts the query. It uses Scikit-Learn to convert the query into a vector and finds the most mathematically similar local SOP documents (e.g., `solar_flare_mitigation.txt`).
5. **AI Synthesis:** The backend packages the user's query, the live telemetry data of the failing node, and the retrieved SOP text, sending it to the LLM. 
6. **Actionable Output:** The LLM streams back a precise, context-aware solution based *only* on ISRO's SOPs, which is read aloud by the "Chitthi" voice assistant or displayed in the chat panel.

## 5. Feasibility and Viability
**Feasibility: High**
* **Standard Hardware:** The entire stack (Node.js, Python, Scikit-Learn) runs efficiently on standard commercial off-the-shelf (COTS) hardware without requiring massive GPU clusters, unless a heavy local LLM is deployed.
* **Modular Design:** The simulation engine can be easily replaced by API calls to actual network monitoring tools (like Cisco DNA, SolarWinds, or PRTG) with minimal changes to the frontend.

**Viability: Extremely High for Defense/Space Sectors**
* **Data Security:** The RAG architecture ensures that proprietary network layouts and SOPs are never used to train public models. The system can be fully isolated.
* **Operational Impact:** Reducing the time it takes to diagnose a satellite link failure from 15 minutes to 15 seconds can save millions of dollars and secure mission success.

## 6. Future Scope and Improvements
To take this Copilot from a high-fidelity prototype to a production-ready enterprise tool, the following enhancements are recommended:

* **True Air-Gapping via Local LLMs:** Fully replace the Gemini/Groq external API calls with a locally hosted LLM (e.g., Llama-3-8B running on local Nvidia GPUs via Ollama or vLLM). This guarantees zero data exfiltration.
* **Integration with Live Hardware:** Replace the Python simulator by ingesting actual SNMP traps, Syslog data, and NetFlow metrics from live ISRO network switches.
* **Advanced Predictive AI:** Move beyond threshold-based anomaly detection. Train deep learning models (like LSTMs or Time-Series Transformers) on historical network logs to predict link failures *hours* before they happen.
* **Closed-Loop Automation (Self-Healing):** Upgrade the Copilot from an "advisor" to an "operator". Allow the AI to suggest a script (e.g., reroute traffic via BGP), ask the engineer for a "One-Click Approve," and then automatically execute the SSH commands to the router to fix the issue.
* **Multi-Modal AI:** Allow engineers to upload screenshots of legacy terminal interfaces or error logs, letting a Vision-Language Model parse the image and provide solutions.
