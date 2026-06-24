"""
ISRO Phase 5 — Air-Gapped Copilot Knowledge Base
=================================================
Rich network SOP documents, incident reports, and troubleshooting guides
for ISRO MPLS operations. These form the RAG corpus for FAISS vector search.
"""

KNOWLEDGE_DOCS = [
    # ─── SOP Documents ───────────────────────────────────────────────────────
    {
        "id": "sop_qos_01",
        "title": "SOP-NET-01: ISRO MPLS QoS Policy — Traffic Shaping for Tracking Telemetry",
        "category": "QoS",
        "tags": ["congestion", "bandwidth", "qos", "mpls", "shaping", "traffic"],
        "content": (
            "Quality of Service (QoS) configuration for ISRO MPLS underlay ensures mission-critical "
            "tracking telemetry is never dropped during link saturation. "
            "Critical tracking telemetry (spacecraft downlink, telemetry, and command streams) MUST be "
            "mapped to IP Precedence 5 / DSCP EF (Expedited Forwarding). "
            "When bandwidth utilization exceeds 85%, immediately apply traffic shaping. "
            "Shape non-critical enterprise traffic to 10Mbps maximum. "
            "Apply QoS policy to output of all MPLS-facing interfaces: "
            "'service-policy output ISRO-QOS-SHAPING'. "
            "Priority queue must guarantee 40% bandwidth to telemetry class at all times. "
            "Verification: show policy-map interface | include dropped / output rate. "
            "If packet drops exceed 0.5% on critical class, escalate to NOC-DEL immediately."
        )
    },
    {
        "id": "sop_congestion_02",
        "title": "SOP-NET-02: MPLS Link Congestion Diagnosis and Resolution",
        "category": "Congestion",
        "tags": ["congestion", "latency", "packet_loss", "bandwidth", "mpls", "high load"],
        "content": (
            "MPLS Link Congestion is identified by three simultaneous indicators: "
            "1) Bandwidth utilization above 90%, 2) Latency increase greater than 30ms above baseline, "
            "3) Packet loss exceeding 1.5%. "
            "Immediate actions: First, identify the source of congestion using 'show interface counters'. "
            "Check MPLS traffic engineering (TE) tunnel utilization. "
            "Apply traffic shaping policy to reduce non-critical traffic load. "
            "If congestion persists, reroute mission-critical traffic via secondary MPLS path. "
            "For ISTRAC-BGL to NOC-DEL path congestion: activate backup tunnel Tunnel20. "
            "Escalation: If latency exceeds 100ms on tracking links, immediately notify Mission Director. "
            "Commands: "
            "'show mpls traffic-eng tunnels', "
            "'show ip cef detail', "
            "'interface Tunnel20; no shutdown' — to activate backup. "
            "Prevention: Set SNMP traps for bandwidth >80% on all MPLS-facing interfaces."
        )
    },
    {
        "id": "sop_flapping_03",
        "title": "SOP-NET-03: Link Flapping and OSPF Adjacency Loss Resolution",
        "category": "Link Stability",
        "tags": ["flapping", "jitter", "packet_loss", "ospf", "instability", "link"],
        "content": (
            "Link flapping (rapid link UP/DOWN cycling) causes OSPF adjacency teardown and reconvergence, "
            "disrupting telemetry for 30-90 seconds per flap event. "
            "Symptoms: High jitter (>8ms), packet loss >1%, link state changes in syslog. "
            "Root causes: Physical layer (damaged fiber, loose connectors), MTU mismatch, "
            "OSPF hello/dead timer mismatch, or carrier-delay not configured. "
            "Resolution Steps: "
            "1. Verify physical layer: 'show interface GigabitEthernet0/1 | include error'. "
            "2. Check OSPF neighbor state: 'show ip ospf neighbor'. "
            "3. Apply carrier-delay to suppress brief flaps: "
            "'interface GigabitEthernet0/1; carrier-delay msec 2000'. "
            "4. Tune OSPF timers for resilience: "
            "'ip ospf hello-interval 10; ip ospf dead-interval 40'. "
            "5. If physical faults confirmed, shut primary and activate secondary: "
            "'interface GigabitEthernet0/1; shutdown'. "
            "6. Enable BFD for fast detection: 'bfd interval 300 min_rx 300 multiplier 3'. "
            "Recovery verification: 'show ip ospf neighbor | include Full'."
        )
    },
    {
        "id": "sop_overload_04",
        "title": "SOP-NET-04: Device CPU and Memory Overload Response",
        "category": "Device Health",
        "tags": ["cpu", "memory", "overload", "crash", "performance", "router"],
        "content": (
            "CPU overload (>95%) and memory exhaustion (>90%) indicate router control plane stress, "
            "risking routing daemon crash and complete loss of network control. "
            "Immediate triage steps: "
            "1. Check CPU process hogs: 'show processes cpu sorted | head 20'. "
            "2. Check memory status: 'show memory statistics'. "
            "3. If routing tables have bloated, clear them: 'clear ip route *'. "
            "4. Set CPU threshold alarms: 'process cpu threshold type total rising 85 interval 5'. "
            "5. Enable SNMP CPU traps for NOC alerting: 'snmp-server enable traps cpu threshold'. "
            "6. If memory leak suspected (increasing memory consumption over time), "
            "identify and restart only the leaking process: 'restart process <process_name>'. "
            "7. As last resort if crash is imminent, plan for controlled failover. "
            "Prevention: Schedule periodic OSPF table refresh during low-traffic windows. "
            "Monitor: 'show platform resources' every 5 minutes during high load periods."
        )
    },
    {
        "id": "sop_link_down_05",
        "title": "SOP-NET-05: Emergency Link Down Recovery Procedure",
        "category": "Emergency",
        "tags": ["link_down", "emergency", "recovery", "interface", "shutdown"],
        "content": (
            "A link-down event (link_status=0) on any ISRO MPLS node requires immediate response. "
            "Severity: CRITICAL — All tracking data on that segment is interrupted. "
            "Step 1: Confirm the link is truly down (not a telemetry fault): "
            "'show interface GigabitEthernet0/1 | include line protocol'. "
            "Step 2: Check for physical layer errors: 'show interface counters errors'. "
            "Step 3: Attempt interface restoration: 'interface GigabitEthernet0/1; no shutdown'. "
            "Step 4: If link remains down after no-shutdown, verify Layer 1 with 'test cable-diagnostics tdr'. "
            "Step 5: Immediately activate the pre-configured backup path: "
            "'ip route 0.0.0.0 0.0.0.0 <backup_gateway> 1' — floating static for immediate traffic reroute. "
            "Step 6: Notify ISTRAC NOC and Mission Director within 5 minutes. "
            "Step 7: Dispatch field engineer to check physical media. "
            "Expected recovery time: 2-15 minutes for software fix, 2-4 hours for hardware fault."
        )
    },
    # ─── Architecture Reference Docs ─────────────────────────────────────────
    {
        "id": "arch_topology_06",
        "title": "ISRO MPLS Network Topology and Site Reference Guide",
        "category": "Architecture",
        "tags": ["topology", "network", "isro", "mpls", "sites", "routers", "architecture"],
        "content": (
            "ISRO MPLS Network connects 6 primary sites via dedicated MPLS backbone. "
            "ISTRAC Bangalore (ISTRAC-BGL): Master Network Operations Center. Baseline latency 12ms, CPU 35%, BW 45%. "
            "SDSC Sriharikota (SDSC-SHAR): Launch Site Operations. Baseline latency 18ms, CPU 55%, BW 60%. "
            "MCF Hassan (MCF-HSN): Master Control Facility for satellite operations. Baseline latency 22ms, CPU 40%, BW 38%. "
            "NOC Delhi (NOC-DEL): Northern India Gateway / Mission Control link. Baseline latency 35ms, CPU 50%, BW 55%. "
            "NOC Mumbai (NOC-MUM): Western India Gateway. Baseline latency 28ms, CPU 45%, BW 50%. "
            "TRACK Port Blair (TRACK-PBL): Downrange Tracking Station. Baseline latency 65ms, CPU 30%, BW 25%. "
            "Standard SLA: Latency <100ms, Packet loss <0.5%, Jitter <5ms on all critical paths. "
            "MPLS backbone capacity: 1Gbps core, 100Mbps access. "
            "Redundancy: Hot-standby secondary MPLS tunnels for all primary paths."
        )
    },
    {
        "id": "arch_qos_classes_07",
        "title": "ISRO MPLS Traffic Classification and DSCP Marking Guide",
        "category": "QoS",
        "tags": ["dscp", "classification", "traffic", "priority", "qos", "mpls"],
        "content": (
            "Traffic classes and DSCP markings for ISRO MPLS network: "
            "Class 1 - ISRO-CRITICAL-TELEMETRY: Spacecraft tracking, command uplink, telemetry downlink. "
            "  DSCP: EF (46), IP Precedence: 5. Guaranteed 40% bandwidth. Never shape or drop. "
            "Class 2 - ISRO-MISSION-CONTROL: Mission control voice, video. "
            "  DSCP: AF41 (34). Guaranteed 20% bandwidth. Shape to 50Mbps. "
            "Class 3 - ISRO-OPERATIONS: Engineering workstations, file transfers. "
            "  DSCP: AF21 (18). Best effort. Shape to 20Mbps during congestion. "
            "Class 4 - DEFAULT: General internet, email. "
            "  DSCP: 0. Drop eligible during congestion. Shape to 10Mbps. "
            "Verification commands: 'show class-map', 'show policy-map interface Tunnel10 output'."
        )
    },
    # ─── Incident Reports ────────────────────────────────────────────────────
    {
        "id": "incident_del_08",
        "title": "Incident ISRO-2025-08: NOC Delhi Router Memory Exhaustion",
        "category": "Incident",
        "tags": ["noc-del", "memory", "cpu", "incident", "delhi", "crash", "overload"],
        "content": (
            "Date: 2025-09-14. Duration: 47 minutes. Affected: NOC-DEL. "
            "Root Cause: Routing table bloat due to route flapping caused by a downstream BGP peer "
            "advertising 400,000+ unstable routes over 2 hours. "
            "Impact: Complete loss of NOC Delhi routing capability. Mission Control link interrupted. "
            "Resolution: "
            "1. Applied BGP route limit 'maximum-prefix 50000 80' to prevent future bloat. "
            "2. Cleared routing tables: 'clear ip route *'. "
            "3. Applied memory threshold monitoring: 'process cpu threshold type total rising 80 interval 5'. "
            "4. Restarted BGP process: 'clear ip bgp * soft'. "
            "Lessons Learned: Always configure BGP maximum-prefix limits. Monitor memory trending. "
            "Prevention: SNMP threshold alerts at 75% memory utilization."
        )
    },
    {
        "id": "incident_pbl_09",
        "title": "Incident ISRO-2025-11: TRACK Port Blair Link Flapping During Mission",
        "category": "Incident",
        "tags": ["track-pbl", "port-blair", "flapping", "mission", "incident", "jitter"],
        "content": (
            "Date: 2025-11-21. Duration: 2 hours 15 minutes. Affected: TRACK-PBL. "
            "Root Cause: Physical fiber damage on primary terrestrial link caused intermittent signal loss, "
            "resulting in rapid link flap cycles (28 flaps in 30 minutes). "
            "Impact: TRACK Port Blair downrange tracking data unavailable during critical GSAT launch phase. "
            "Resolution: "
            "1. Immediately switched to VSAT backup link. "
            "2. Increased carrier-delay on primary interface to 5 seconds to suppress flaps: "
            "'interface GigabitEthernet0/1; carrier-delay msec 5000'. "
            "3. Dispatched field team — confirmed fiber cut at 14km mark. "
            "4. Fiber spliced and primary link restored after 2h15m. "
            "Lessons Learned: VSAT backup link should be pre-provisioned as hot-standby. "
            "All downrange stations require automatic failover <30 seconds."
        )
    },
    {
        "id": "incident_bgl_10",
        "title": "Incident ISRO-2024-03: ISTRAC Bangalore MPLS Congestion During Chandrayaan Data Dump",
        "category": "Incident",
        "tags": ["istrac-bgl", "bangalore", "congestion", "bandwidth", "chandrayaan", "incident"],
        "content": (
            "Date: 2024-03-12. Duration: 1 hour 45 minutes. Affected: ISTRAC-BGL, SDSC-SHAR link. "
            "Root Cause: Unscheduled bulk data dump from Chandrayaan-3 science data (2.4TB) was injected "
            "into the MPLS network without QoS marking, consuming 96% of available bandwidth for 105 minutes. "
            "Impact: Mission telemetry latency rose to 450ms (threshold 25ms). Commands delayed by 8 seconds. "
            "Resolution: "
            "1. Identified bulk data flow using 'show ip flow top-talkers'. "
            "2. Applied ACL to rate-limit science data to 50Mbps: "
            "'access-list 110 permit ip host <data_server> any'. "
            "'rate-limit input access-group 110 50000000 8000 16000 conform-action transmit exceed-action drop'. "
            "3. Engaged secondary MPLS path for science data. "
            "Lessons Learned: All bulk data transfers MUST be pre-scheduled and QoS-marked. "
            "Science data = DSCP AF21, never EF or AF41."
        )
    },
    # ─── Troubleshooting Guides ───────────────────────────────────────────────
    {
        "id": "guide_diag_11",
        "title": "MPLS Network Diagnostic Command Reference — ISRO NOC Operations",
        "category": "Diagnostics",
        "tags": ["commands", "diagnostic", "show", "debug", "troubleshoot", "cisco"],
        "content": (
            "Essential Cisco IOS diagnostic commands for ISRO MPLS operations: "
            "Interface Health: 'show interface GigabitEthernet0/1' — check errors, drops, rate. "
            "Routing Table: 'show ip route' — verify routing prefixes and next-hops. "
            "OSPF State: 'show ip ospf neighbor' — confirm Full adjacency on all peers. "
            "MPLS Tunnels: 'show mpls traffic-eng tunnels brief' — check tunnel state and bandwidth. "
            "QoS Status: 'show policy-map interface Tunnel10 output' — check class drops. "
            "CPU/Memory: 'show processes cpu sorted | head 20', 'show memory statistics'. "
            "Packet Loss Test: 'ping <destination> repeat 1000 size 1400' — test with jumbo frames. "
            "Traceroute: 'traceroute mpls ipv4 <prefix>/32' — MPLS path verification. "
            "Interface Counters: 'show interface counters errors' — detect physical errors. "
            "BGP Summary: 'show ip bgp summary' — check BGP neighbor states and prefix counts. "
            "Syslog: 'show logging | include OSPF|BGP|MPLS' — filter relevant events."
        )
    },
    {
        "id": "guide_latency_12",
        "title": "Latency Troubleshooting Guide for ISRO Tracking Links",
        "category": "Performance",
        "tags": ["latency", "delay", "performance", "tracking", "slow", "high latency"],
        "content": (
            "High latency on ISRO tracking links threatens mission-critical command/response timing. "
            "Latency is defined as RTT measured by continuous ICMP echo to NOC-DEL anchor from each site. "
            "Normal baselines: ISTRAC-BGL 12ms, SDSC-SHAR 18ms, MCF-HSN 22ms, NOC-DEL 35ms, "
            "NOC-MUM 28ms, TRACK-PBL 65ms. "
            "Acceptable SLA deviation: +20ms (yellow), +50ms (red), +100ms (critical — escalate immediately). "
            "Common causes of high latency: "
            "1. MPLS link congestion (concurrent high bandwidth). "
            "2. Router CPU overload causing queuing delay in software forwarding path. "
            "3. OSPF suboptimal routing after link state changes. "
            "4. Physical media degradation increasing bit error rate and retransmission. "
            "Diagnostics: "
            "- Check interface output queue drops: 'show interface | include output drops'. "
            "- Verify MPLS TE path: 'show mpls traffic-eng tunnels | include Current'. "
            "- Test with varying packet sizes: 'ping repeat 100 size 64/512/1400'. "
            "Resolution: Apply QoS, fix congestion, or re-optimize OSPF weights."
        )
    },
    {
        "id": "guide_jitter_13",
        "title": "Jitter and Voice Quality Guide — ISRO Mission Control Voice Links",
        "category": "Performance",
        "tags": ["jitter", "voice", "quality", "latency variation", "mission control"],
        "content": (
            "Jitter (latency variation) above 5ms degrades mission control voice quality and "
            "can corrupt time-sensitive tracking command sequences. "
            "Measurement: Jitter = standard deviation of RTT across 100 consecutive probes. "
            "Acceptable: <3ms (green), 3-8ms (yellow, monitor), >8ms (red, take action). "
            "Causes of high jitter: "
            "1. Inconsistent output queuing due to mixed traffic types without QoS. "
            "2. Link flapping causing routing reconvergence every few seconds. "
            "3. Physical layer errors introducing variable retransmission delays. "
            "Remediation: "
            "1. Apply WFQ or LLQ (Low Latency Queuing) for voice/telemetry traffic. "
            "2. 'ip rtp priority 16384 16383 128' — hardware priority queue for RTP. "
            "3. Configure CBWFQ: 'policy-map ISRO-LLQ; class VOICE; priority 128'. "
            "4. Investigate link errors causing jitter spikes."
        )
    },
    {
        "id": "guide_ospf_14",
        "title": "OSPF Routing Protocol Tuning for ISRO MPLS Fast Convergence",
        "category": "Routing",
        "tags": ["ospf", "routing", "convergence", "hello", "dead", "timer", "reconvergence"],
        "content": (
            "OSPF convergence time directly impacts ISRO network recovery after link failures. "
            "Current configuration: Hello=10s, Dead=40s. Convergence target: <60 seconds. "
            "Optimization for faster convergence: "
            "Reduce Hello to 1s (with Dead=4s): 'ip ospf hello-interval 1; ip ospf dead-interval 4'. "
            "Warning: Aggressive timers increase CPU load — only apply on high-performance routers. "
            "For low-CPU sites (TRACK-PBL): keep Hello=30s to prevent CPU exhaustion. "
            "Enable OSPF Fast-Hello (sub-second): 'ip ospf dead-interval minimal hello-multiplier 5'. "
            "Supplement with BFD for physical layer fast detection: "
            "'bfd interval 300 min_rx 300 multiplier 3; ip ospf bfd'. "
            "Monitor convergence events: 'debug ip ospf events' (use only in maintenance window). "
            "Verify topology: 'show ip ospf database | include LSA'. "
            "OSPF area design: All ISRO routers in area 0 (backbone). No stub areas."
        )
    },
    {
        "id": "guide_prediction_15",
        "title": "AI Failure Prediction Interpretation Guide — ISRO NOC Operations",
        "category": "AI Operations",
        "tags": ["prediction", "ai", "failure", "risk", "score", "xgboost", "precursor"],
        "content": (
            "The ISRO Phase 2 XGBoost AI system predicts network failures 30-45 minutes in advance. "
            "Risk Score interpretation: "
            "0-30%: NORMAL — Continue monitoring at standard interval. "
            "30-60%: LOW RISK — Increase monitoring frequency to every 5 minutes. "
            "60-80%: MEDIUM RISK — Begin proactive mitigation. Deploy QoS policies. Check physical plant. "
            "80-95%: HIGH RISK — Immediate action required. Notify NOC supervisor. "
            "95-100%: CRITICAL — Failure imminent. Activate failover procedures immediately. "
            "Failure classes: "
            "Congestion: AI detects rising bandwidth, latency increasing, loss starting. "
            "Device Overload: AI detects CPU/memory creep over past 30 minutes. "
            "Link Flapping: AI detects increasing jitter variance and micro-packet-loss events. "
            "Actions per class are documented in SOP-NET-01 through SOP-NET-04. "
            "When AI prediction conflicts with rule engine: trust rule engine for CRITICAL state, "
            "use AI prediction for PREDICTIVE (early warning) state."
        )
    },
    {
        "id": "guide_anomaly_16",
        "title": "Anomaly Detection Operations Guide — Isolation Forest Interpretation",
        "category": "AI Operations",
        "tags": ["anomaly", "isolation forest", "unusual", "spike", "deviation", "detection"],
        "content": (
            "The ISRO Phase 3 Isolation Forest model detects unusual network behavior without "
            "predefined thresholds, catching novel failure patterns before they appear in rule systems. "
            "Anomaly Score interpretation: "
            "Score > +0.2: Normal behavior. No action. "
            "Score 0 to +0.2: Borderline — monitor closely. "
            "Score -0.1 to 0: Suspicious — investigate the anomalous metric. "
            "Score < -0.1: ANOMALY CONFIRMED — investigate immediately. "
            "Common anomaly patterns detected by Isolation Forest: "
            "1. Sudden bandwidth spike (unexpected large data transfer or DDoS). "
            "2. CPU spike without corresponding traffic increase (routing loop, software bug). "
            "3. Latency spike without corresponding bandwidth increase (path change, route flap). "
            "4. Packet loss spike without latency increase (physical layer error). "
            "Actions: "
            "1. Identify which metric caused the anomaly using trend charts. "
            "2. Correlate with Root Cause Engine Phase 4 for multi-signal analysis. "
            "3. Check syslog for corresponding events at anomaly timestamp."
        )
    }
]
