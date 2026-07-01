import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Database, Server, Zap, AlertTriangle, CheckCircle2,
  RefreshCw, TrendingUp, Clock, Hash, Radio,
  GitBranch, Cpu, Wifi, WifiOff, BarChart3, Brain, ShieldCheck, Sliders, MessageCircle
} from 'lucide-react';
import type { GeneratorStatus, Router, Snapshot, Incident } from './types';
import { GeneratorControl } from './GeneratorControl';
import { MetricsChart } from './MetricsChart';
import { DataTable } from './DataTable';
import { IncidentTimeline } from './IncidentTimeline';
import { DatabaseHealth } from './DatabaseHealth';
import { TopologySimulator } from './TopologySimulator';
import { PredictionPanel } from './PredictionPanel';
import { AnomalyPanel } from './AnomalyPanel';
import { RootCausePanel } from './RootCausePanel';
import { CopilotPanel } from './CopilotPanel';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8001/ws/ph1/stream';

const IS_DEV = import.meta.env.DEV;
const BASE_PH1 = IS_DEV ? 'http://localhost:5175' : '/ph1';
const BASE_PH6 = IS_DEV ? 'http://localhost:5176' : '/ph6';
const BASE_FRONTEND = IS_DEV ? 'http://localhost:5173' : '';

type Tab = 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'timeseries' | 'rawdata' | 'incidents' | 'dbhealth' | 'selfheal';

// ─── Local Mock Mode Constants ───
const NODES = ["ISTRAC-BGL", "SDSC-SHAR", "MCF-HSN", "NOC-DEL", "NOC-MUM", "TRACK-PBL"];

const STATIC_ROUTERS: Router[] = [
  { id: 'ISTRAC-BGL', name: 'ISTRAC Bangalore', location: 'Bangalore, Karnataka', ip_address: '10.100.10.1', site_type: 'ISTRAC', created_at: new Date().toISOString() },
  { id: 'SDSC-SHAR', name: 'SDSC Sriharikota', location: 'Sriharikota, Andhra Pradesh', ip_address: '10.100.20.1', site_type: 'SDSC', created_at: new Date().toISOString() },
  { id: 'MCF-HSN', name: 'MCF Hassan', location: 'Hassan, Karnataka', ip_address: '10.100.30.1', site_type: 'MCF', created_at: new Date().toISOString() },
  { id: 'NOC-DEL', name: 'NOC Delhi', location: 'New Delhi', ip_address: '10.100.40.1', site_type: 'NOC', created_at: new Date().toISOString() },
  { id: 'NOC-MUM', name: 'NOC Mumbai', location: 'Mumbai, Maharashtra', ip_address: '10.100.50.1', site_type: 'NOC', created_at: new Date().toISOString() },
  { id: 'TRACK-PBL', name: 'TRACK Port Blair', location: 'Port Blair, Andaman Islands', ip_address: '10.100.60.1', site_type: 'TRACK', created_at: new Date().toISOString() }
];

interface PhysicalLink {
  id: string;
  source: string;
  target: string;
  capacity: number;
  delay: number;
}

const LINKS: PhysicalLink[] = [
  { id: 'ISTRAC-SDSC', source: 'ISTRAC-BGL', target: 'SDSC-SHAR', capacity: 100.0, delay: 5.0 },
  { id: 'ISTRAC-MCF', source: 'ISTRAC-BGL', target: 'MCF-HSN', capacity: 80.0, delay: 3.0 },
  { id: 'SDSC-NOCDEL', source: 'SDSC-SHAR', target: 'NOC-DEL', capacity: 100.0, delay: 20.0 },
  { id: 'MCF-NOCMUM', source: 'MCF-HSN', target: 'NOC-MUM', capacity: 80.0, delay: 15.0 },
  { id: 'NOCDEL-NOCMUM', source: 'NOC-DEL', target: 'NOC-MUM', capacity: 150.0, delay: 10.0 },
  { id: 'ISTRAC-TRACK', source: 'ISTRAC-BGL', target: 'TRACK-PBL', capacity: 50.0, delay: 45.0 },
  { id: 'NOCMUM-TRACK', source: 'NOC-MUM', target: 'TRACK-PBL', capacity: 50.0, delay: 40.0 },
];

interface Demand {
  id: string;
  source_id: string;
  target_id: string;
  bandwidth_mbps: number;
  status: number;
}

const INITIAL_DEMANDS: Demand[] = [
  { id: 'FLOW-SDSC-DEL', source_id: 'SDSC-SHAR', target_id: 'NOC-DEL', bandwidth_mbps: 40.0, status: 1 },
  { id: 'FLOW-MCF-MUM', source_id: 'MCF-HSN', target_id: 'NOC-MUM', bandwidth_mbps: 30.0, status: 1 },
  { id: 'FLOW-TRACK-BGL', source_id: 'TRACK-PBL', target_id: 'ISTRAC-BGL', bandwidth_mbps: 15.0, status: 1 },
  { id: 'FLOW-BGL-DEL', source_id: 'ISTRAC-BGL', target_id: 'NOC-DEL', bandwidth_mbps: 25.0, status: 1 },
];

const BASELINES: Record<string, { latency: number; cpu: number; bandwidth: number }> = {
  "ISTRAC-BGL": { latency: 12.0, cpu: 35.0, bandwidth: 45.0 },
  "SDSC-SHAR": { latency: 18.0, cpu: 55.0, bandwidth: 60.0 },
  "MCF-HSN": { latency: 22.0, cpu: 40.0, bandwidth: 38.0 },
  "NOC-DEL": { latency: 35.0, cpu: 50.0, bandwidth: 55.0 },
  "NOC-MUM": { latency: 28.0, cpu: 45.0, bandwidth: 50.0 },
  "TRACK-PBL": { latency: 65.0, cpu: 30.0, bandwidth: 25.0 },
};

interface RetrievedDoc {
  id: string;
  title: string;
  category: string;
  relevance_score: number;
  snippet: string;
}

const KNOWLEDGE_DOCS = [
  {
    id: "sop_qos_01",
    title: "SOP-NET-01: ISRO MPLS QoS Policy — Traffic Shaping for Tracking Telemetry",
    category: "QoS",
    tags: ["congestion", "bandwidth", "qos", "mpls", "shaping", "traffic"],
    content: "Quality of Service (QoS) configuration for ISRO MPLS underlay ensures mission-critical tracking telemetry is never dropped during link saturation. Critical tracking telemetry (spacecraft downlink, telemetry, and command streams) MUST be mapped to IP Precedence 5 / DSCP EF (Expedited Forwarding). When bandwidth utilization exceeds 85%, immediately apply traffic shaping. Shape non-critical enterprise traffic to 10Mbps maximum. Apply QoS policy to output of all MPLS-facing interfaces: 'service-policy output ISRO-QOS-SHAPING'. Priority queue must guarantee 40% bandwidth to telemetry class at all times. Verification: show policy-map interface | include dropped / output rate. If packet drops exceed 0.5% on critical class, escalate to NOC-DEL immediately."
  },
  {
    id: "sop_congestion_02",
    title: "SOP-NET-02: MPLS Link Congestion Diagnosis and Resolution",
    category: "Congestion",
    tags: ["congestion", "latency", "packet_loss", "bandwidth", "mpls", "high load"],
    content: "MPLS Link Congestion is identified by three simultaneous indicators: 1) Bandwidth utilization above 90%, 2) Latency increase greater than 30ms above baseline, 3) Packet loss exceeding 1.5%. Immediate actions: First, identify the source of congestion using 'show interface counters'. Check MPLS traffic engineering (TE) tunnel utilization. Apply traffic shaping policy to reduce non-critical traffic load. If congestion persists, reroute mission-critical traffic via secondary MPLS path. For ISTRAC-BGL to NOC-DEL path congestion: activate backup tunnel Tunnel20. Escalation: If latency exceeds 100ms on tracking links, immediately notify Mission Director. Commands: 'show mpls traffic-eng tunnels', 'show ip cef detail', 'interface Tunnel20; no shutdown' — to activate backup. Prevention: Set SNMP traps for bandwidth >80% on all MPLS-facing interfaces."
  },
  {
    id: "sop_flapping_03",
    title: "SOP-NET-03: Link Flapping and OSPF Adjacency Loss Resolution",
    category: "Link Stability",
    tags: ["flapping", "jitter", "packet_loss", "ospf", "instability", "link"],
    content: "Link flapping (rapid link UP/DOWN cycling) causes OSPF adjacency teardown and reconvergence, disrupting telemetry for 30-90 seconds per flap event. Symptoms: High jitter (>8ms), packet loss >1%, link state changes in syslog. Root causes: Physical layer (damaged fiber, loose connectors), MTU mismatch, OSPF hello/dead timer mismatch, or carrier-delay not configured. Resolution Steps: 1. Verify physical layer: 'show interface GigabitEthernet0/1 | include error'. 2. Check OSPF neighbor state: 'show ip ospf neighbor'. 3. Apply carrier-delay to suppress brief flaps: 'interface GigabitEthernet0/1; carrier-delay msec 2000'. 4. Tune OSPF timers for resilience: 'ip ospf hello-interval 10; ip ospf dead-interval 40'. 5. If physical faults confirmed, shut primary and activate secondary: 'interface GigabitEthernet0/1; shutdown'. 6. Enable BFD for fast detection: 'bfd interval 300 min_rx 300 multiplier 3'. Recovery verification: 'show ip ospf neighbor | include Full'."
  },
  {
    id: "sop_overload_04",
    title: "SOP-NET-04: Device CPU and Memory Overload Response",
    category: "Device Health",
    tags: ["cpu", "memory", "overload", "crash", "performance", "router"],
    content: "CPU overload (>95%) and memory exhaustion (>90%) indicate router control plane stress, risking routing daemon crash and complete loss of network control. Immediate triage steps: 1. Check CPU process hogs: 'show processes cpu sorted | head 20'. 2. Check memory status: 'show memory statistics'. 3. If routing tables have bloated, clear them: 'clear ip route *'. 4. Set CPU threshold alarms: 'process cpu threshold type total rising 85 interval 5'. 5. Enable SNMP CPU traps for NOC alerting: 'snmp-server enable traps cpu threshold'. 6. If memory leak suspected (increasing memory consumption over time), identify and restart only the leaking process: 'restart process <process_name>'. 7. As last resort if crash is imminent, plan for controlled failover. Prevention: Schedule periodic OSPF table refresh during low-traffic windows. Monitor: 'show platform resources' every 5 minutes during high load periods."
  },
  {
    id: "sop_link_down_05",
    title: "SOP-NET-05: Emergency Link Down Recovery Procedure",
    category: "Emergency",
    tags: ["link_down", "emergency", "recovery", "interface", "shutdown"],
    content: "A link-down event (link_status=0) on any ISRO MPLS node requires immediate response. Severity: CRITICAL — All tracking data on that segment is interrupted. Step 1: Confirm the link is truly down (not a telemetry fault): 'show interface GigabitEthernet0/1 | include line protocol'. Step 2: Check for physical layer errors: 'show interface counters errors'. Step 3: Attempt interface restoration: 'interface GigabitEthernet0/1; no shutdown'. Step 4: If link remains down after no-shutdown, verify Layer 1 with 'test cable-diagnostics tdr'. Step 5: Immediately activate the pre-configured backup path: 'ip route 0.0.0.0 0.0.0.0 <backup_gateway> 1' — floating static for immediate traffic reroute. Step 6: Notify ISTRAC NOC and Mission Director within 5 minutes. Step 7: Dispatch field engineer to check physical media. Expected recovery time: 2-15 minutes for software fix, 2-4 hours for hardware fault."
  },
  {
    id: "arch_topology_06",
    title: "ISRO MPLS Network Topology and Site Reference Guide",
    category: "Architecture",
    tags: ["topology", "network", "isro", "mpls", "sites", "routers", "architecture"],
    content: "ISRO MPLS Network connects 6 primary sites via dedicated MPLS backbone. ISTRAC Bangalore (ISTRAC-BGL): Master Network Operations Center. Baseline latency 12ms, CPU 35%, BW 45%. SDSC Sriharikota (SDSC-SHAR): Launch Site Operations. Baseline latency 18ms, CPU 55%, BW 60%. MCF Hassan (MCF-HSN): Master Control Facility for satellite operations. Baseline latency 22ms, CPU 40%, BW 38%. NOC Delhi (NOC-DEL): Northern India Gateway / Mission Control link. Baseline latency 35ms, CPU 50%, BW 55%. NOC Mumbai (NOC-MUM): Western India Gateway. Baseline latency 28ms, CPU 45%, BW 50%. TRACK Port Blair (TRACK-PBL): Downrange Tracking Station. Baseline latency 65ms, CPU 30%, BW 25%. Standard SLA: Latency <100ms, Packet loss <0.5%, Jitter <5ms on all critical paths. MPLS backbone capacity: 1Gbps core, 100Mbps access. Redundancy: Hot-standby secondary MPLS tunnels for all primary paths."
  },
  {
    id: "arch_qos_classes_07",
    title: "ISRO MPLS Traffic Classification and DSCP Marking Guide",
    category: "QoS",
    tags: ["dscp", "classification", "traffic", "priority", "qos", "mpls"],
    content: "Traffic classes and DSCP markings for ISRO MPLS network: Class 1 - ISRO-CRITICAL-TELEMETRY: Spacecraft tracking, command uplink, telemetry downlink. DSCP: EF (46), IP Precedence: 5. Guaranteed 40% bandwidth. Never shape or drop. Class 2 - ISRO-MISSION-CONTROL: Mission control voice, video. DSCP: AF41 (34). Guaranteed 20% bandwidth. Shape to 50Mbps. Class 3 - ISRO-OPERATIONS: Engineering workstations, file transfers. DSCP: AF21 (18). Best effort. Shape to 20Mbps during congestion. Class 4 - DEFAULT: General internet, email. DSCP: 0. Drop eligible during congestion. Shape to 10Mbps. Verification commands: 'show class-map', 'show policy-map interface Tunnel10 output'."
  },
  {
    id: "incident_del_08",
    title: "Incident ISRO-2025-08: NOC Delhi Router Memory Exhaustion",
    category: "Incident",
    tags: ["noc-del", "memory", "cpu", "incident", "delhi", "crash", "overload"],
    content: "Date: 2025-09-14. Duration: 47 minutes. Affected: NOC-DEL. Root Cause: Routing table bloat due to route flapping caused by a downstream BGP peer advertising 400,000+ unstable routes over 2 hours. Impact: Complete loss of NOC Delhi routing capability. Mission Control link interrupted. Resolution: 1. Applied BGP route limit 'maximum-prefix 50000 80' to prevent future bloat. 2. Cleared routing tables: 'clear ip route *'. 3. Applied memory threshold monitoring: 'process cpu threshold type total rising 80 interval 5'. 4. Restarted BGP process: 'clear ip bgp * soft'. Lessons Learned: Always configure BGP maximum-prefix limits. Monitor memory trending. Prevention: SNMP threshold alerts at 75% memory utilization."
  },
  {
    id: "incident_pbl_09",
    title: "Incident ISRO-2025-11: TRACK Port Blair Link Flapping During Mission",
    category: "Incident",
    tags: ["track-pbl", "port-blair", "flapping", "mission", "incident", "jitter"],
    content: "Date: 2025-11-21. Duration: 2 hours 15 minutes. Affected: TRACK-PBL. Root Cause: Physical fiber damage on primary terrestrial link caused intermittent signal loss, resulting in rapid link flap cycles (28 flaps in 30 minutes). Impact: TRACK Port Blair downrange tracking data unavailable during critical GSAT launch phase. Resolution: 1. Immediately switched to VSAT backup link. 2. Increased carrier-delay on primary interface to 5 seconds to suppress flaps: 'interface GigabitEthernet0/1; carrier-delay msec 5000'. 3. Dispatched field team — confirmed fiber cut at 14km mark. 4. Fiber spliced and primary link restored after 2h15m. Lessons Learned: VSAT backup link should be pre-provisioned as hot-standby. All downrange stations require automatic failover <30 seconds."
  },
  {
    id: "incident_bgl_10",
    title: "Incident ISRO-2024-03: ISTRAC Bangalore MPLS Congestion During Chandrayaan Data Dump",
    category: "Incident",
    tags: ["istrac-bgl", "bangalore", "congestion", "bandwidth", "chandrayaan", "incident"],
    content: "Date: 2024-03-12. Duration: 1 hour 45 minutes. Affected: ISTRAC-BGL, SDSC-SHAR link. Root Cause: Unscheduled bulk data dump from Chandrayaan-3 science data (2.4TB) was injected into the MPLS network without QoS marking, consuming 96% of available bandwidth for 105 minutes. Impact: Mission telemetry latency rose to 450ms (threshold 25ms). Commands delayed by 8 seconds. Resolution: 1. Identified bulk data flow using 'show ip flow top-talkers'. 2. Applied ACL to rate-limit science data to 50Mbps: 'access-list 110 permit ip host <data_server> any'. 'rate-limit input access-group 110 50000000 8000 16000 conform-action transmit exceed-action drop'. 3. Engaged secondary MPLS path for science data. Lessons Learned: All bulk data transfers MUST be pre-scheduled and QoS-marked. Science data = DSCP AF21, never EF or AF41."
  },
  {
    id: "guide_diag_11",
    title: "MPLS Network Diagnostic Command Reference — ISRO NOC Operations",
    category: "Diagnostics",
    tags: ["commands", "diagnostic", "show", "debug", "troubleshoot", "cisco"],
    content: "Essential Cisco IOS diagnostic commands for ISRO MPLS operations: Interface Health: 'show interface GigabitEthernet0/1' — check errors, drops, rate. Routing Table: 'show ip route' — verify routing prefixes and next-hops. OSPF State: 'show ip ospf neighbor' — confirm Full adjacency on all peers. MPLS Tunnels: 'show mpls traffic-eng tunnels brief' — check tunnel state and bandwidth. QoS Status: 'show policy-map interface Tunnel10 output' — check class drops. CPU/Memory: 'show processes cpu sorted | head 20', 'show memory statistics'. Packet Loss Test: 'ping <destination> repeat 1000 size 1400' — test with jumbo frames. Traceroute: 'traceroute mpls ipv4 <prefix>/32' — path verification. Interface Counters: 'show interface counters errors' — detect physical errors. BGP Summary: 'show ip bgp summary' — check BGP neighbor states and prefix counts. Syslog: 'show logging | include OSPF|BGP|MPLS' — filter relevant events."
  },
  {
    id: "guide_latency_12",
    title: "Latency Troubleshooting Guide for ISRO Tracking Links",
    category: "Performance",
    tags: ["latency", "delay", "performance", "tracking", "slow", "high latency"],
    content: "High latency on ISRO tracking links threatens mission-critical command/response timing. Latency is defined as RTT measured by continuous ICMP echo to NOC-DEL anchor from each site. Normal baselines: ISTRAC-BGL 12ms, SDSC-SHAR 18ms, MCF-HSN 22ms, NOC-DEL 35ms, NOC-MUM 28ms, TRACK-PBL 65ms. Acceptable SLA deviation: +20ms (yellow), +50ms (red), +100ms (critical — escalate immediately). Common causes of high latency: 1. MPLS link congestion (concurrent high bandwidth). 2. Router CPU overload causing queuing delay in software forwarding path. 3. OSPF suboptimal routing after link state changes. 4. Physical media degradation increasing bit error rate and retransmission. Diagnostics: Check interface output queue drops: 'show interface | include output drops'. Verify MPLS TE path: 'show mpls traffic-eng tunnels | include Current'. Test with varying packet sizes: 'ping repeat 100 size 64/512/1400'. Resolution: Apply QoS, fix congestion, or re-optimize OSPF weights."
  },
  {
    id: "guide_jitter_13",
    title: "Jitter and Voice Quality Guide — ISRO Mission Control Voice Links",
    category: "Performance",
    tags: ["jitter", "voice", "quality", "latency variation", "mission control"],
    content: "Jitter (latency variation) above 5ms degrades mission control voice quality and can corrupt time-sensitive tracking command sequences. Measurement: Jitter = standard deviation of RTT across 100 consecutive probes. Acceptable: <3ms (green), 3-8ms (yellow, monitor), >8ms (red, take action). Causes of high jitter: 1. Inconsistent output queuing due to mixed traffic types without QoS. 2. Link flapping causing routing reconvergence every few seconds. 3. Physical layer errors introducing variable retransmission delays. Remediation: 1. Apply WFQ or LLQ (Low Latency Queuing) for voice/telemetry traffic. 2. 'ip rtp priority 16384 16383 128' — hardware priority queue for RTP. 3. Configure CBWFQ: 'policy-map ISRO-LLQ; class VOICE; priority 128'. 4. Investigate link errors causing jitter spikes."
  },
  {
    id: "guide_ospf_14",
    title: "OSPF Routing Protocol Tuning for ISRO MPLS Fast Convergence",
    category: "Routing",
    tags: ["ospf", "routing", "convergence", "hello", "dead", "timer", "reconvergence"],
    content: "OSPF convergence time directly impacts ISRO network recovery after link failures. Current configuration: Hello=10s, Dead=40s. Convergence target: <60 seconds. Optimization for faster convergence: Reduce Hello to 1s (with Dead=4s): 'ip ospf hello-interval 1; ip ospf dead-interval 4'. Warning: Aggressive timers increase CPU load — only apply on high-performance routers. For low-CPU sites (TRACK-PBL): keep Hello=30s to prevent CPU exhaustion. Enable OSPF Fast-Hello (sub-second): 'ip ospf dead-interval minimal hello-multiplier 5'. Supplement with BFD for physical layer fast detection: 'bfd interval 300 min_rx 300 multiplier 3; ip ospf bfd'. Monitor convergence events: 'debug ip ospf events' (use only in maintenance window). Verify topology: 'show ip ospf database | include LSA'. OSPF area design: All ISRO routers in area 0 (backbone). No stub areas."
  },
  {
    id: "guide_prediction_15",
    title: "AI Failure Prediction Interpretation Guide — ISRO NOC Operations",
    category: "AI Operations",
    tags: ["prediction", "ai", "failure", "risk", "score", "xgboost", "precursor"],
    content: "The ISRO Phase 2 XGBoost AI system predicts network failures 30-45 minutes in advance. Risk Score interpretation: 0-30%: NORMAL — Continue monitoring at standard interval. 30-60%: LOW RISK — Increase monitoring frequency to every 5 minutes. 60-80%: MEDIUM RISK — Begin proactive mitigation. Deploy QoS policies. Check physical plant. 80-95%: HIGH RISK — Immediate action required. Notify NOC supervisor. 95-100%: CRITICAL — Failure imminent. Activate failover procedures immediately. Failure classes: Congestion: AI detects rising bandwidth, latency increasing, loss starting. Device Overload: AI detects CPU/memory creep over past 30 minutes. Link Flapping: AI detects increasing jitter variance and micro-packet-loss events. Actions per class are documented in SOP-NET-01 through SOP-NET-04. When AI prediction conflicts with rule engine: trust rule engine for CRITICAL state, use AI prediction for PREDICTIVE (early warning) state."
  },
  {
    id: "guide_anomaly_16",
    title: "Anomaly Detection Operations Guide — Isolation Forest Interpretation",
    category: "AI Operations",
    tags: ["anomaly", "isolation forest", "unusual", "spike", "deviation", "detection"],
    content: "The ISRO Phase 3 Isolation Forest model detects unusual network behavior without predefined thresholds, catching novel failure patterns before they appear in rule systems. Anomaly Score interpretation: Score > +0.2: Normal behavior. No action. Score 0 to +0.2: Borderline — monitor closely. Score -0.1 to 0: Suspicious — investigate the anomalous metric. Score < -0.1: ANOMALY CONFIRMED — investigate immediately. Common anomaly patterns detected by Isolation Forest: 1. Sudden bandwidth spike (unexpected large data transfer or DDoS). 2. CPU spike without corresponding traffic increase (routing loop, software bug). 3. Latency spike without corresponding bandwidth increase (path change, route flap). 4. Packet loss spike without latency increase (physical layer error). Actions: 1. Identify which metric caused the anomaly using trend charts. 2. Correlate with Root Cause Engine Phase 4 for multi-signal analysis. 3. Check syslog for corresponding events at anomaly timestamp."
  }
];

// Simple Dijkstra Path Finder
function findShortestPath(
  nodes: string[],
  links: PhysicalLink[],
  linkStatus: Record<string, number>,
  source: string,
  target: string
): string[] | null {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  for (const n of nodes) {
    dist[n] = Infinity;
    prev[n] = null;
    unvisited.add(n);
  }
  dist[source] = 0;

  const adj: Record<string, { to: string; weight: number }[]> = {};
  for (const n of nodes) {
    adj[n] = [];
  }

  for (const link of links) {
    if (linkStatus[link.id] !== 0) {
      adj[link.source].push({ to: link.target, weight: link.delay });
      adj[link.target].push({ to: link.source, weight: link.delay });
    }
  }

  while (unvisited.size > 0) {
    let u: string | null = null;
    let minDist = Infinity;
    for (const node of unvisited) {
      if (dist[node] < minDist) {
        minDist = dist[node];
        u = node;
      }
    }

    if (u === null || u === target) {
      break;
    }

    unvisited.delete(u);

    for (const edge of adj[u]) {
      if (!unvisited.has(edge.to)) continue;
      const alt = dist[u] + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
      }
    }
  }

  if (dist[target] === Infinity) {
    return null;
  }

  const path: string[] = [];
  let curr: string | null = target;
  while (curr !== null) {
    path.push(curr);
    curr = prev[curr];
  }
  return path.reverse();
}

// Client-side RAG Document Matcher
function queryKnowledgeBase(query: string): RetrievedDoc[] {
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const results: { doc: typeof KNOWLEDGE_DOCS[0]; score: number }[] = [];

  for (const doc of KNOWLEDGE_DOCS) {
    let score = 0;
    const contentLower = doc.content.toLowerCase();
    const titleLower = doc.title.toLowerCase();

    doc.tags.forEach(tag => {
      if (query.toLowerCase().includes(tag.toLowerCase())) {
        score += 8;
      }
    });

    queryWords.forEach(word => {
      if (titleLower.includes(word)) {
        score += 4;
      }
      const count = (contentLower.match(new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length;
      score += count * 1.5;
    });

    if (score > 0) {
      if (query.toLowerCase().includes(doc.category.toLowerCase())) {
        score += 6;
      }
      results.push({ doc, score });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    return KNOWLEDGE_DOCS.slice(5, 8).map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      relevance_score: 50,
      snippet: d.content
    }));
  }

  return results.slice(0, 3).map((r) => {
    const maxScore = results[0]?.score || 1;
    const relevance = Math.round(Math.min(99, 60 + (r.score / maxScore) * 39));
    return {
      id: r.doc.id,
      title: r.doc.title,
      category: r.doc.category,
      relevance_score: relevance,
      snippet: r.doc.content
    };
  });
}

// Helper response generator for NLP Copilot
function generateCopilotResponse(query: string, routerContext: string | null, retrievedDocs: RetrievedDoc[], live: Record<string, Snapshot>): string {
  const queryLower = query.toLowerCase();

  if (queryLower.includes('network status') || queryLower.includes('current network status')) {
    let table = `| Router ID | Site Type | Status | Latency | Packet Loss | CPU Load | Bandwidth | Link status |\n`;
    table += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    NODES.forEach(rid => {
      const snap = live[rid];
      if (snap) {
        const state = snap.failure_label === 0 ? "🟢 NORMAL" : (snap.failure_label === 1 ? "🟡 CONGESTION" : (snap.failure_label === 2 ? "🟠 OVERLOAD" : "🔴 INSTABILITY"));
        const link = snap.link_status === 1 ? "UP" : "DOWN";
        table += `| **${rid}** | ${snap.site_type} | ${state} | ${snap.latency} ms | ${snap.packet_loss}% | ${snap.cpu}% | ${snap.bandwidth} M | ${link} |\n`;
      }
    });

    return (
      `### Live Network Telemetry Assessment Report\n\n` +
      `Here is the active telemetry status parsed from all 6 ground station routers:\n\n` +
      table + `\n` +
      `**Summary:**\n` +
      `- Active anomalous nodes: ${NODES.filter(rid => live[rid]?.failure_label > 0).length} of 6\n` +
      `- Maximum Latency: ${Math.max(...NODES.map(rid => live[rid]?.latency || 0))} ms\n\n` +
      `If you need troubleshooting commands for a specific node, ask: \`Diagnose [Router ID]\`.`
    );
  }

  let targetRouter = routerContext || "";
  NODES.forEach(rid => {
    if (queryLower.includes(rid.toLowerCase())) {
      targetRouter = rid;
    }
  });

  if (targetRouter) {
    const snap = live[targetRouter];
    if (snap) {
      const stateStr = snap.failure_label === 0 ? "Normal" : (snap.failure_label === 1 ? "Congested" : (snap.failure_label === 2 ? "Overloaded" : "Instability/Isolated"));
      const isHealthy = snap.failure_label === 0;

      let answer = `### Proactive Diagnostics for ${targetRouter} (${snap.router_name})\n\n`;
      answer += `*   **Current State:** \`${stateStr.toUpperCase()}\`\n`;
      answer += `*   **Telemetry Readings:**\n`;
      answer += `    *   Latency: \`${snap.latency} ms\`\n`;
      answer += `    *   Packet Loss: \`${snap.packet_loss}%\`\n`;
      answer += `    *   CPU Load: \`${snap.cpu}%\` (Memory: \`${snap.memory}%\`)\n`;
      answer += `    *   Link Status: \`${snap.link_status === 1 ? 'UP' : 'DOWN'}\`\n\n`;

      if (!isHealthy) {
        answer += `**Root Cause Diagnostics:**\n`;
        if (snap.failure_label === 1) {
          answer += `The device is suffering from high link saturation. Traffic exceeds port bandwidth capacity, causing packet drop rates of \`${snap.packet_loss}%\`.\n\n`;
          answer += `**Recommended Cisco IOS Playbook (SOP-NET-01):**\n`;
          answer += `\`\`\`cisco\n`;
          answer += `policy-map ISRO-EMERGENCY-QOS\n`;
          answer += ` class ISRO-CRITICAL-TELEMETRY\n`;
          answer += `  priority percent 50\n`;
          answer += ` class class-default\n`;
          answer += `  shape average 8000000\n`;
          answer += ` exit\n`;
          answer += `interface Tunnel10\n`;
          answer += ` service-policy output ISRO-EMERGENCY-QOS\n`;
          answer += `end\n`;
          answer += `\`\`\`\n`;
        } else if (snap.failure_label === 2) {
          answer += `Control-plane CPU exhaustion detected. Process queues are backlogging, causing variable latency spikes.\n\n`;
          answer += `**Recommended Cisco IOS Playbook (SOP-NET-04):**\n`;
          answer += `\`\`\`cisco\n`;
          answer += `show processes cpu sorted | head 20\n`;
          answer += `clear ip route *\n`;
          answer += `process cpu threshold type total rising 85 interval 5\n`;
          answer += `end\n`;
          answer += `\`\`\`\n`;
        } else if (snap.failure_label === 3) {
          if (snap.link_status === 0) {
            answer += `The router is isolated. Interface is physically down or administratively shutdown.\n\n`;
            answer += `**Recommended Cisco IOS Playbook (SOP-NET-05):**\n`;
            answer += `\`\`\`cisco\n`;
            answer += `interface GigabitEthernet0/1\n`;
            answer += ` no shutdown\n`;
            answer += ` exit\n`;
            answer += `ip route 0.0.0.0 0.0.0.0 10.100.1.254 1\n`;
            answer += `end\n`;
            answer += `\`\`\`\n`;
          } else {
            answer += `Link flapping or high packet loss on downstream interfaces causing neighbor adjacency loss.\n\n`;
            answer += `**Recommended Cisco IOS Playbook (SOP-NET-03):**\n`;
            answer += `\`\`\`cisco\n`;
            answer += `interface GigabitEthernet0/1\n`;
            answer += ` carrier-delay msec 2000\n`;
            answer += ` ip ospf hello-interval 10\n`;
            answer += ` ip ospf dead-interval 40\n`;
            answer += `end\n`;
            answer += `\`\`\`\n`;
          }
        }
      } else {
        answer += `No active issues detected. Device is operating within nominal parameters.\n`;
        answer += `If you anticipate high loads, consider checking standard interface statistics:\n`;
        answer += `\`\`\`cisco\n`;
        answer += `show interface GigabitEthernet0/1\n`;
        answer += `show ip ospf neighbor\n`;
        answer += `\`\`\`\n`;
      }
      return answer;
    }
  }

  if (queryLower.includes('congestion') || queryLower.includes('qos') || queryLower.includes('traffic shaping')) {
    return (
      `### Troubleshooting MPLS Link Congestion (RAG Match: SOP-NET-01 & SOP-NET-02)\n\n` +
      `Under saturation, you MUST protect the mission-critical telemetry class (IP Precedence 5 / DSCP EF) and shape default class traffic.\n\n` +
      `**Cisco IOS Implementation steps:**\n` +
      `1. Define class maps and map EF traffic:\n` +
      `\`\`\`cisco\n` +
      `class-map match-any ISRO-CRITICAL-TELEMETRY\n` +
      ` match ip precedence 5\n` +
      `exit\n` +
      `\`\`\`\n` +
      `2. Bind class to policy-map with bandwidth reservation:\n` +
      `\`\`\`cisco\n` +
      `policy-map ISRO-QOS-SHAPING\n` +
      ` class ISRO-CRITICAL-TELEMETRY\n` +
      `  priority percent 40\n` +
      ` class class-default\n` +
      `  shape average 10000000\n` +
      `exit\n` +
      `\`\`\`\n` +
      `3. Apply to tunnel output:\n` +
      `\`\`\`cisco\n` +
      `interface Tunnel10\n` +
      ` service-policy output ISRO-QOS-SHAPING\n` +
      `end\n` +
      `\`\`\`\n` +
      `Verify policy enforcement with \`show policy-map interface Tunnel10\`.`
    );
  }

  if (queryLower.includes('cpu') || queryLower.includes('memory') || queryLower.includes('overload')) {
    return (
      `### Router CPU & Memory Overload Playbook (RAG Match: SOP-NET-04 & Incident ISRO-2025-08)\n\n` +
      `High control-plane utilization risks crashing the routing process (OSPF, BGP). Run these commands to isolate and clear tables:\n\n` +
      `\`\`\`cisco\n` +
      `! 1. Identify high resource tasks\n` +
      `show processes cpu sorted | head 20\n` +
      `show memory statistics\n\n` +
      `! 2. Clear route cache and force reconvergence\n` +
      `clear ip route *\n` +
      `clear arp\n\n` +
      `! 3. Configure thresholds traps\n` +
      `process cpu threshold type total rising 85 interval 5\n` +
      `snmp-server enable traps cpu threshold\n` +
      `\`\`\`\n` +
      `Ensure you BGP prefix limits are configured to prevent routing table memory bloat.`
    );
  }

  if (queryLower.includes('flapping') || queryLower.includes('ospf') || queryLower.includes('timer')) {
    return (
      `### OSPF Tuning & Link Flap Dampening Playbook (RAG Match: SOP-NET-03 & SOP-NET-05)\n\n` +
      `To prevent rapid route reconvergence oscillations (flapping), apply interface carrier-delay filters:\n\n` +
      `\`\`\`cisco\n` +
      `interface GigabitEthernet0/1\n` +
      ` carrier-delay msec 2000\n` +
      ` ip ospf hello-interval 10\n` +
      ` ip ospf dead-interval 40\n` +
      ` exit\n` +
      `\`\`\`\n` +
      `Enable BFD for fast hardware failure detection:\n` +
      `\`\`\`cisco\n` +
      `interface GigabitEthernet0/1\n` +
      ` bfd interval 300 min_rx 300 multiplier 3\n` +
      `exit\n` +
      `\`\`\`\n` +
      `Confirm neighbor state is stable using \`show ip ospf neighbor\`.`
    );
  }

  const matchedDoc = retrievedDocs[0];
  let defaultResponse = `### Air-Gapped Network Copilot Assistance\n\n`;
  defaultResponse += `I analyzed your query: *"${query}"*.\n\n`;
  if (matchedDoc) {
    defaultResponse += `**Retrieved SOP Reference:** \`${matchedDoc.title}\`\n\n`;
    defaultResponse += `**Summary of SOP Guidance:**\n${matchedDoc.snippet}\n\n`;
  }
  defaultResponse += `Please specify a device (e.g. \`NOC-DEL\`) or failure condition to receive customized troubleshooting scripts or live status updates.`;
  return defaultResponse;
}

export default function Phase1Dashboard({ isInline = false }: { isInline?: boolean }) {
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = (isInline ? params.get('subtab') : params.get('tab')) as Tab;
    return ['overview', 'predictions', 'anomalies', 'rootcause', 'copilot', 'timeseries', 'rawdata', 'incidents', 'dbhealth', 'selfheal'].includes(urlTab) ? urlTab : 'overview';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (isInline) {
      url.searchParams.set('tab', 'ph1');
      url.searchParams.set('subtab', tab);
    } else {
      url.searchParams.set('tab', tab);
      url.searchParams.delete('subtab');
    }
    window.history.pushState({}, '', url.toString());
  }, [tab, isInline]);

  const [genStatus, setGenStatus] = useState<GeneratorStatus | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [liveData, setLiveData] = useState<Record<string, Snapshot>>({});
  const [selectedRouter, setSelectedRouter] = useState<string>('NOC-DEL');
  const [wsConnected, setWsConnected] = useState(false);
  const [utcTime, setUtcTime] = useState('');
  const [totalRows, setTotalRows] = useState(0);

  // ─── Local Mock Mode Telemetry Simulation Hook States ───
  const [isLocalMockMode, setIsLocalMockMode] = useState(false);

  const simRef = useRef({
    linkStatus: {
      'ISTRAC-SDSC': 1,
      'ISTRAC-MCF': 1,
      'SDSC-NOCDEL': 1,
      'MCF-NOCMUM': 1,
      'NOCDEL-NOCMUM': 1,
      'ISTRAC-TRACK': 1,
      'NOCMUM-TRACK': 1,
    } as Record<string, number>,
    injections: {} as Record<string, { type: string; duration: number }>,
    history: {} as Record<string, Snapshot[]>,
    incidents: [] as Incident[],
    totalRows: 1250,
    isRunning: true,
    startTime: Date.now(),
    liveData: {} as Record<string, Snapshot>
  });

  // Client-side simulation physics engine tick
  const tickPhysics = useCallback(() => {
    const state = simRef.current;
    if (!state.isRunning) return;

    // 1. Decrement injections
    const activeInjections: Record<string, { type: string; duration: number }> = {};
    for (const rid of Object.keys(state.injections)) {
      const inj = state.injections[rid];
      if (inj.duration > 1) {
        state.injections[rid] = { ...inj, duration: inj.duration - 1 };
        activeInjections[rid] = state.injections[rid];
      } else {
        delete state.injections[rid];
      }
    }

    // 2. Recompute link status and demands
    const linkStatus: Record<string, number> = {
      'ISTRAC-SDSC': 1,
      'ISTRAC-MCF': 1,
      'SDSC-NOCDEL': 1,
      'MCF-NOCMUM': 1,
      'NOCDEL-NOCMUM': 1,
      'ISTRAC-TRACK': 1,
      'NOCMUM-TRACK': 1,
    };
    const demands = [ ...INITIAL_DEMANDS ];

    for (const rid of Object.keys(activeInjections)) {
      const inj = activeInjections[rid];
      if (inj.type === 'link_down') {
        if (rid === 'NOC-DEL') {
          linkStatus['SDSC-NOCDEL'] = 0;
        } else if (rid === 'NOC-MUM') {
          linkStatus['MCF-NOCMUM'] = 0;
        } else {
          if (rid === 'ISTRAC-BGL') linkStatus['ISTRAC-SDSC'] = 0;
          else if (rid === 'SDSC-SHAR') linkStatus['ISTRAC-SDSC'] = 0;
          else if (rid === 'MCF-HSN') linkStatus['ISTRAC-MCF'] = 0;
          else if (rid === 'TRACK-PBL') linkStatus['ISTRAC-TRACK'] = 0;
        }
      } else if (inj.type === 'congestion') {
        demands.push({
          id: `FLOW-CONGESTION-${rid}`,
          source_id: 'ISTRAC-BGL',
          target_id: rid,
          bandwidth_mbps: 500.0,
          status: 1
        });
      }
    }
    state.linkStatus = linkStatus;

    // 3. Compute routing & flows
    const linkUtilization: Record<string, number> = {};
    const routerTraffic: Record<string, number> = {};

    LINKS.forEach(l => {
      linkUtilization[`${l.source}->${l.target}`] = 0.0;
      linkUtilization[`${l.target}->${l.source}`] = 0.0;
    });
    NODES.forEach(n => {
      routerTraffic[n] = 0.0;
    });

    demands.forEach(demand => {
      if (demand.status !== 1) return;
      const path = findShortestPath(NODES, LINKS, linkStatus, demand.source_id, demand.target_id);
      if (path && path.length > 0) {
        for (let i = 0; i < path.length - 1; i++) {
          const u = path[i];
          const v = path[i+1];
          linkUtilization[`${u}->${v}`] += demand.bandwidth_mbps;
          routerTraffic[u] += demand.bandwidth_mbps;
        }
        routerTraffic[demand.target_id] += demand.bandwidth_mbps;
      }
    });

    // 4. Compute link physics
    const linkLatency: Record<string, number> = {};
    const linkLoss: Record<string, number> = {};

    LINKS.forEach(link => {
      const upFlowKey = `${link.source}->${link.target}`;
      const downFlowKey = `${link.target}->${link.source}`;
      
      [upFlowKey, downFlowKey].forEach(flowKey => {
        const util = linkUtilization[flowKey] || 0;
        const cap = link.capacity;
        const delay = link.delay;

        let loss = 0;
        let lat = delay;

        if (util > cap) {
          loss = ((util - cap) / util) * 100.0;
          lat = delay + 500.0;
        } else {
          loss = 0.0;
          if (util > 0) {
            const rho = util / cap;
            const queueDelay = rho < 0.99 ? (rho / (1.0 - rho)) * 2.0 : 200.0;
            lat = delay + queueDelay;
          }
        }
        linkLatency[flowKey] = lat;
        linkLoss[flowKey] = loss;
      });
    });

    // 5. Compute router aggregates
    const newLiveData: Record<string, Snapshot> = {};
    const timestamp = new Date().toISOString();

    NODES.forEach(rid => {
      const baseline = BASELINES[rid] || { latency: 25, cpu: 40, bandwidth: 40 };
      const config = STATIC_ROUTERS.find(r => r.id === rid)!;

      const outEdges = LINKS.filter(l => {
        if (linkStatus[l.id] === 0) return false;
        return l.source === rid || l.target === rid;
      }).map(l => {
        const otherNode = l.source === rid ? l.target : l.source;
        return `${rid}->${otherNode}`;
      });

      let maxLat = 0;
      let maxLoss = 0;

      if (outEdges.length === 0) {
        maxLat = 9999.0;
        maxLoss = 100.0;
      } else {
        maxLat = Math.max(...outEdges.map(e => linkLatency[e] || 0), 0);
        maxLoss = Math.max(...outEdges.map(e => linkLoss[e] || 0), 0);
      }

      let traffic = routerTraffic[rid] || 0;

      const hasOverload = activeInjections[rid]?.type === 'overload';
      if (hasOverload) {
        traffic += 400.0;
      }

      const MAX_ROUTER_CAP = 300.0;
      let cpu = Math.min(10.0 + (traffic / MAX_ROUTER_CAP) * 80.0, 99.9);
      let mem = Math.min(20.0 + (traffic / MAX_ROUTER_CAP) * 60.0, 95.0);

      let jitter = maxLat * 0.1;

      let failureLabel = 0;
      if (cpu > 85 || maxLoss > 5.0 || traffic > MAX_ROUTER_CAP) {
        if (traffic > MAX_ROUTER_CAP) failureLabel = 1;
        else if (cpu > 85) failureLabel = 2;
        else if (maxLoss > 5.0) failureLabel = 3;
      }
      if (outEdges.length === 0) {
        failureLabel = 3;
      }

      const hasInstability = activeInjections[rid]?.type === 'instability';
      if (hasInstability) {
        jitter = 12.5 + Math.random() * 5;
        maxLoss = 8.2 + Math.random() * 2;
        failureLabel = 3;
      }

      const hasLinkDown = activeInjections[rid]?.type === 'link_down';
      if (hasLinkDown) {
        failureLabel = 3;
      }

      const noise = (Math.random() - 0.5) * 0.5;
      const noiseCpu = (Math.random() - 0.5) * 2;
      const noiseMem = (Math.random() - 0.5) * 1;

      const snap: Snapshot = {
        id: Math.floor(Math.random() * 100000),
        router_id: rid,
        router_name: config.name,
        timestamp,
        latency: maxLat > 9000 ? 9999.0 : Math.max(1.0, parseFloat((maxLat + noise).toFixed(2))),
        packet_loss: Math.max(0.0, parseFloat((maxLoss + (Math.random() * 0.05)).toFixed(3))),
        jitter: Math.max(0.0, parseFloat((jitter + (Math.random() * 0.1)).toFixed(2))),
        bandwidth: Math.max(0.0, parseFloat((traffic + noise).toFixed(2))),
        cpu: Math.max(0.1, Math.min(99.9, parseFloat((cpu + noiseCpu).toFixed(2)))),
        memory: Math.max(0.1, Math.min(99.9, parseFloat((mem + noiseMem).toFixed(2)))),
        link_status: outEdges.length > 0 ? 1 : 0,
        failure_label: failureLabel,
        ip_address: config.ip_address,
        site_type: config.site_type,
      };

      newLiveData[rid] = snap;
    });

    state.liveData = newLiveData;
    (window as any).__liveTelemetry = newLiveData;
    state.totalRows += NODES.length;

    NODES.forEach(rid => {
      if (!state.history[rid]) {
        state.history[rid] = [];
      }
      state.history[rid].push(newLiveData[rid]);
      if (state.history[rid].length > 100) {
        state.history[rid].shift();
      }
    });

    NODES.forEach(rid => {
      const snap = newLiveData[rid];
      const activeInc = state.incidents.find(inc => inc.router_id === rid && inc.resolved_at === null);

      if (snap.failure_label > 0 && !activeInc) {
        const failureTypeMap: Record<number, string> = { 1: 'congestion', 2: 'overload', 3: 'instability' };
        const ftype = snap.link_status === 0 ? 'link_down' : (failureTypeMap[snap.failure_label] || 'unknown');
        const severity = snap.failure_label === 3 ? 'CRITICAL' : 'WARNING';
        
        const newInc: Incident = {
          id: Math.floor(Math.random() * 100000),
          router_id: rid,
          router_name: snap.router_name,
          started_at: snap.timestamp,
          resolved_at: null,
          failure_type: ftype,
          severity,
          peak_latency: snap.latency,
          peak_loss: snap.packet_loss,
          peak_cpu: snap.cpu,
          notes: `Auto-detected local simulation: ${ftype} on ${snap.router_name}`
        };
        state.incidents = [newInc, ...state.incidents];
      } else if (snap.failure_label === 0 && activeInc) {
        state.incidents = state.incidents.map(inc => {
          if (inc.id === activeInc.id) {
            return { ...inc, resolved_at: snap.timestamp };
          }
          return inc;
        });
      }
    });

    setLiveData({ ...state.liveData });
    setTotalRows(state.totalRows);
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => {
      setUtcTime(new Date().toUTCString().replace('GMT', 'UTC'));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-detect offline mode and seed mock history
  useEffect(() => {
    let active = true;

    // Seed initial normal history for plotting
    const now = Date.now();
    const hist: Record<string, Snapshot[]> = {};
    NODES.forEach(rid => {
      const config = STATIC_ROUTERS.find(r => r.id === rid)!;
      const baseline = BASELINES[rid] || { latency: 25, cpu: 40, bandwidth: 40 };
      const arr: Snapshot[] = [];
      for (let i = 40; i >= 0; i--) {
        const ts = new Date(now - i * 10000).toISOString();
        const noise = (Math.random() - 0.5) * 0.5;
        const noiseCpu = (Math.random() - 0.5) * 2;
        const noiseMem = (Math.random() - 0.5) * 1;
        arr.push({
          id: Math.floor(Math.random() * 100000),
          router_id: rid,
          router_name: config.name,
          timestamp: ts,
          latency: Math.max(1.0, parseFloat((baseline.latency + noise).toFixed(2))),
          packet_loss: Math.max(0.0, parseFloat((Math.random() * 0.05).toFixed(3))),
          jitter: Math.max(0.0, parseFloat((baseline.latency * 0.1 + (Math.random() * 0.1)).toFixed(2))),
          bandwidth: Math.max(0.0, parseFloat((baseline.bandwidth + noise).toFixed(2))),
          cpu: Math.max(0.1, Math.min(99.9, parseFloat((baseline.cpu + noiseCpu).toFixed(2)))),
          memory: Math.max(0.1, Math.min(99.9, parseFloat((baseline.cpu * 1.1 + noiseMem).toFixed(2)))),
          link_status: 1,
          failure_label: 0,
          ip_address: config.ip_address,
          site_type: config.site_type,
        });
      }
      hist[rid] = arr;
    });
    simRef.current.history = hist;

    // Ping server to detect sandbox requirement
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (active) {
        controller.abort();
        activateLocalMock();
      }
    }, 2000);

    fetch(`${API}/api/ph1/routers`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        clearTimeout(timeout);
        if (active) {
          if (Array.isArray(data) && data.length > 0) {
            setRouters(data);
          } else {
            activateLocalMock();
          }
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (active) {
          activateLocalMock();
        }
      });

    const activateLocalMock = () => {
      setIsLocalMockMode(true);
      setRouters(STATIC_ROUTERS);
      setWsConnected(true);
    };

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  // Poll generator status
  const fetchStatus = useCallback(() => {
    if (isLocalMockMode) {
      const state = simRef.current;
      setGenStatus({
        running: state.isRunning,
        pid: state.isRunning ? 4912 : null,
        uptime_seconds: state.isRunning ? Math.floor((Date.now() - state.startTime) / 1000) : 0,
        total_rows: state.totalRows,
        total_incidents: state.incidents.length,
        latest_timestamp: new Date().toISOString(),
        rows_last_30s: state.isRunning ? 90 : 0,
        rows_per_minute: state.isRunning ? 180 : 0,
        influx_available: false,
        sqlite_path: "phase1.db (LOCAL SANDBOX)"
      });
      setTotalRows(state.totalRows);
      return;
    }
    fetch(`${API}/api/ph1/generator/status`)
      .then(r => r.json())
      .then((s: GeneratorStatus) => {
        setGenStatus(s);
        setTotalRows(s.total_rows);
      })
      .catch(() => {});
  }, [isLocalMockMode]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 3000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // WebSocket live stream
  useEffect(() => {
    if (isLocalMockMode) return;
    let ws: WebSocket | null = null;
    let reconnect: any = null;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'live_update') {
            setLiveData(msg.data);
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnect = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        if (ws) {
          ws.close();
        }
      };
    };
    connect();
    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      clearTimeout(reconnect);
    };
  }, [isLocalMockMode]);

  // Background Physics Simulation loop
  useEffect(() => {
    if (!isLocalMockMode) return;
    tickPhysics();
    const interval = setInterval(tickPhysics, 2000);
    return () => clearInterval(interval);
  }, [isLocalMockMode, tickPhysics]);

  // Fetch Interceptor for offline mode
  useEffect(() => {
    if (!isLocalMockMode) return;

    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      
      if (urlStr.includes('/api/ph1') || urlStr.includes('/api/ph2') || urlStr.includes('/api/ph3') || urlStr.includes('/api/ph4') || urlStr.includes('/api/ph5') || urlStr.includes('/api/ph6')) {
        const urlObj = new URL(urlStr, window.location.origin);
        
        // 1. GET /api/ph1/routers
        if (urlObj.pathname.endsWith('/api/ph1/routers')) {
          return new Response(JSON.stringify(STATIC_ROUTERS), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // 2. GET /api/ph1/generator/status
        if (urlObj.pathname.endsWith('/api/ph1/generator/status')) {
          const state = simRef.current;
          return new Response(JSON.stringify({
            running: state.isRunning,
            pid: state.isRunning ? 4912 : null,
            uptime_seconds: state.isRunning ? Math.floor((Date.now() - state.startTime) / 1000) : 0,
            total_rows: state.totalRows,
            total_incidents: state.incidents.length,
            latest_timestamp: new Date().toISOString(),
            rows_last_30s: state.isRunning ? 90 : 0,
            rows_per_minute: state.isRunning ? 180 : 0,
            influx_available: false,
            sqlite_path: "phase1.db (LOCAL SANDBOX)"
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 3. POST /api/ph1/generator/start
        if (urlObj.pathname.endsWith('/api/ph1/generator/start')) {
          simRef.current.isRunning = true;
          simRef.current.startTime = Date.now();
          return new Response(JSON.stringify({ status: "started", pid: 4912 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 4. POST /api/ph1/generator/stop
        if (urlObj.pathname.endsWith('/api/ph1/generator/stop')) {
          simRef.current.isRunning = false;
          return new Response(JSON.stringify({ status: "stopped" }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 5. POST /api/ph1/inject
        if (urlObj.pathname.endsWith('/api/ph1/inject')) {
          try {
            const req = JSON.parse(init?.body as string);
            const { router_id, failure_type, duration_steps } = req;
            simRef.current.injections[router_id] = { type: failure_type, duration: duration_steps };
            
            return new Response(JSON.stringify({
              status: "injected",
              router_id,
              failure_type,
              duration_steps
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (e) {
            return new Response(JSON.stringify({ detail: "Invalid request payload" }), { status: 400 });
          }
        }

        // 6. GET /api/ph1/snapshots
        if (urlObj.pathname.endsWith('/api/ph1/snapshots')) {
          const router_id = urlObj.searchParams.get('router_id');
          const failure_label = urlObj.searchParams.get('failure_label');
          const limit = parseInt(urlObj.searchParams.get('limit') || '100');
          const offset = parseInt(urlObj.searchParams.get('offset') || '0');

          let flatData: Snapshot[] = [];
          if (router_id) {
            flatData = simRef.current.history[router_id] || [];
          } else {
            NODES.forEach(rid => {
              flatData = flatData.concat(simRef.current.history[rid] || []);
            });
          }

          if (failure_label !== null && failure_label !== undefined && failure_label !== '') {
            const fl = parseInt(failure_label);
            flatData = flatData.filter(s => s.failure_label === fl);
          }

          flatData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          const pageData = flatData.slice(offset, offset + limit);

          return new Response(JSON.stringify({
            total: flatData.length,
            limit,
            offset,
            data: pageData
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 7. GET /api/ph1/incidents
        if (urlObj.pathname.endsWith('/api/ph1/incidents')) {
          let incs = simRef.current.incidents;
          const limitParam = parseInt(urlObj.searchParams.get('limit') || '50');
          const router_id = urlObj.searchParams.get('router_id');
          if (router_id) {
            incs = incs.filter(i => i.router_id === router_id);
          }
          return new Response(JSON.stringify(incs.slice(0, limitParam)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 8. GET /api/ph1/health
        if (urlObj.pathname.endsWith('/api/ph1/health')) {
          return new Response(JSON.stringify({
            sqlite: { status: "ok", path: "phase1.db (LOCAL SANDBOX)" },
            influxdb: { status: "unavailable", url: "http://localhost:8086", client_installed: false },
            api: "ok"
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 9. GET /api/ph1/metrics/:router_id
        if (urlObj.pathname.includes('/api/ph1/metrics/')) {
          const parts = urlObj.pathname.split('/');
          const router_id = parts[parts.length - 1];
          const hist = simRef.current.history[router_id] || [];
          return new Response(JSON.stringify(hist), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 10. GET /api/ph2/predictions
        if (urlObj.pathname.endsWith('/api/ph2/predictions')) {
          const preds: Record<string, any> = {};
          NODES.forEach(rid => {
            const snap = simRef.current.liveData[rid];
            if (!snap) return;
            let risk_score = 0;
            let prediction = "Normal operation";
            let failure_type = "none";
            let eta_minutes: number | null = null;
            
            if (snap.failure_label === 1) {
              risk_score = 85 + Math.floor(Math.random() * 10);
              prediction = "Impending congestion failure on interface GigabitEthernet0/1";
              failure_type = "congestion";
              eta_minutes = 5 + Math.floor(Math.random() * 5);
            } else if (snap.failure_label === 2) {
              risk_score = 90 + Math.floor(Math.random() * 8);
              prediction = "Device CPU / Memory overload imminent";
              failure_type = "overload";
              eta_minutes = 3 + Math.floor(Math.random() * 5);
            } else if (snap.failure_label === 3) {
              risk_score = 95 + Math.floor(Math.random() * 4);
              prediction = "Link flapping / interface stability failure detected";
              failure_type = "instability";
              eta_minutes = 1 + Math.floor(Math.random() * 3);
            } else {
              if (snap.bandwidth > 150.0) {
                risk_score = 45 + Math.floor((snap.bandwidth - 150) / 150 * 30);
                prediction = "Early Warning: Elevated link bandwidth usage";
                failure_type = "congestion";
                eta_minutes = 25 + Math.floor(Math.random() * 15);
              } else if (snap.cpu > 65.0) {
                risk_score = 50 + Math.floor((snap.cpu - 65) / 35 * 25);
                prediction = "Early Warning: Elevated CPU processing load";
                failure_type = "overload";
                eta_minutes = 20 + Math.floor(Math.random() * 20);
              }
            }
            preds[rid] = {
              router_id: rid,
              router_name: snap.router_name,
              risk_score,
              prediction,
              eta_minutes,
              failure_type
            };
          });
          return new Response(JSON.stringify(preds), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 11. GET /api/ph2/model/status
        if (urlObj.pathname.endsWith('/api/ph2/model/status')) {
          return new Response(JSON.stringify({
            trained: true,
            status: "Model active",
            accuracy: 0.942,
            precision: 0.95,
            recall: 0.93,
            trained_at: new Date(Date.now() - 3600000).toISOString(),
            num_samples: 4200
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 12. POST /api/ph2/train
        if (urlObj.pathname.endsWith('/api/ph2/train')) {
          return new Response(JSON.stringify({
            status: "success",
            accuracy: 0.952,
            precision: 0.96,
            recall: 0.94,
            message: "Model retrained successfully on client-side simulation."
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 13. GET /api/ph3/anomalies
        if (urlObj.pathname.endsWith('/api/ph3/anomalies')) {
          const anomalies: Record<string, any> = {};
          NODES.forEach(rid => {
            const snap = simRef.current.liveData[rid];
            if (!snap) return;
            
            const baseline = BASELINES[rid] || { latency: 25, cpu: 40, bandwidth: 40 };
            
            let is_anomaly = false;
            let anomaly_score = 0.05 + Math.random() * 0.1;
            
            if (snap.failure_label > 0) {
              anomaly_score = 0.55 + Math.random() * 0.25;
            }
            is_anomaly = anomaly_score > 0.5;

            const explanation = is_anomaly 
              ? `Multi-dimensional telemetry deviation detected. Node metrics violate Isolation Forest baseline limits.`
              : "Operational metrics are within 1-sigma baseline profile.";
            
            const spikes: any[] = [];
            if (snap.latency > baseline.latency + 20) {
              spikes.push({ metric: 'latency', type: 'latency spike', current: snap.latency, baseline: baseline.latency, severity: 'WARNING', message: 'Latency exceeded SLA limits' });
            }
            if (snap.cpu > baseline.cpu + 25) {
              spikes.push({ metric: 'cpu', type: 'CPU overload', current: snap.cpu, baseline: baseline.cpu, severity: 'CRITICAL', message: 'CPU Core saturation' });
            }
            if (snap.packet_loss > 1.0) {
              spikes.push({ metric: 'packet_loss', type: 'packet drop surge', current: snap.packet_loss, baseline: 0.0, severity: 'CRITICAL', message: 'SLA violation: packet loss detected' });
            }

            anomalies[rid] = {
              router_id: rid,
              router_name: snap.router_name,
              is_anomaly,
              anomaly_score,
              explanation,
              spikes,
              latest_metrics: {
                latency: snap.latency,
                packet_loss: snap.packet_loss,
                jitter: snap.jitter,
                bandwidth: snap.bandwidth,
                cpu: snap.cpu,
                memory: snap.memory
              }
            };
          });
          return new Response(JSON.stringify(anomalies), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 14. GET /api/ph3/model/status
        if (urlObj.pathname.endsWith('/api/ph3/model/status')) {
          return new Response(JSON.stringify({
            trained: true,
            status: "Isolation Forest active",
            trained_at: new Date(Date.now() - 3600000).toISOString(),
            num_samples: 4200
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 15. POST /api/ph3/train
        if (urlObj.pathname.endsWith('/api/ph3/train')) {
          return new Response(JSON.stringify({
            status: "success",
            message: "Isolation Forest baselines refit successfully on client-side simulation."
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 16. GET /api/ph4/root_cause
        if (urlObj.pathname.endsWith('/api/ph4/root_cause')) {
          const rcs: Record<string, any> = {};
          NODES.forEach(rid => {
            const snap = simRef.current.liveData[rid];
            if (!snap) return;

            const baseline = BASELINES[rid] || { latency: 25, cpu: 40, bandwidth: 40 };
            
            let status = "NORMAL";
            let root_cause = "Normal operations";
            let confidence_score = 98.0;
            let rule_triggered = "None";
            let ai_attribution = "Normal Profile";
            const evidences = ["All primary metrics matching baseline templates."];
            let cli_fix = `! ${snap.router_name} is operating within normal parameters.\n! No troubleshooting actions necessary.`;

            if (snap.link_status === 0) {
              status = "CRITICAL";
              root_cause = "Link Down";
              rule_triggered = "IF link_status == 0";
              confidence_score = 100.0;
              ai_attribution = "XGBoost classified active Link Down";
              evidences.push("Interface link status is DOWN (0)");
              cli_fix = `! Emergency Link Restoration for ${snap.router_name}\ninterface GigabitEthernet0/1\n description Primary Tunnel link went DOWN\n no shutdown\n exit\nshow ip interface brief\nend`;
            } else if (snap.failure_label === 1) {
              status = "CRITICAL";
              root_cause = "Link Congestion";
              rule_triggered = "IF packet_loss ↑ AND latency ↑ AND bandwidth > 90%";
              confidence_score = 95.0;
              ai_attribution = "XGBoost classified active Link Congestion";
              evidences.push(`High Bandwidth saturation: ${snap.bandwidth}Mbps utilized`);
              evidences.push(`Elevated latency spike: ${snap.latency}ms`);
              evidences.push(`Sudden packet loss: ${snap.packet_loss}% drops`);
              cli_fix = `! Apply Traffic Shaping and Queue Priority on ${snap.router_name}\npolicy-map ISRO-QOS-SHAPING\n class ISRO-CRITICAL-TELEMETRY\n  priority percent 40\n class class-default\n  shape average 15000000\n exit\ninterface Tunnel10\n service-policy output ISRO-QOS-SHAPING\nend`;
            } else if (snap.failure_label === 2) {
              status = "CRITICAL";
              root_cause = "Device Overload";
              rule_triggered = "IF CPU > 85% AND memory > 80%";
              confidence_score = 90.0;
              ai_attribution = "XGBoost classified active Device Overload";
              evidences.push(`Critical CPU core load: ${snap.cpu}% utilized`);
              evidences.push(`Saturated memory usage: ${snap.memory}% used`);
              cli_fix = `! CPU Resource Throttling and Process Logging on ${snap.router_name}\nprocess cpu threshold type total rising 85 interval 5\nsnmp-server enable traps cpu\nclear ip route *\nclear arp\nend`;
            } else if (snap.failure_label === 3) {
              status = "CRITICAL";
              root_cause = "Link Flapping";
              rule_triggered = "IF jitter ↑ AND packet_loss ↑ AND link_status == 1";
              confidence_score = 80.0;
              ai_attribution = "XGBoost classified active Link Flapping";
              evidences.push(`High link jitter: ${snap.jitter}ms`);
              evidences.push(`Packet drops: ${snap.packet_loss}% packet loss`);
              cli_fix = `! Link Flap Dampening configuration on ${snap.router_name}\ninterface GigabitEthernet0/1\n carrier-delay msec 2000\n ip ospf dead-interval 40\n ip ospf hello-interval 10\nend`;
            } else {
              if (snap.bandwidth > 150.0) {
                status = "PREDICTIVE";
                root_cause = "Link Congestion";
                confidence_score = 65.0;
                ai_attribution = "XGBoost early warning for Link Congestion (prob: 65%)";
                evidences.push("Precursor: rising traffic volumes exceed 1-sigma historical baseline.");
                cli_fix = `! Proactive QoS Policy deployment for impending Congestion\npolicy-map ISRO-PROACTIVE-SHAPING\n class ISRO-CRITICAL-TELEMETRY\n  bandwidth percent 30\n exit\ninterface Tunnel10\n service-policy output ISRO-PROACTIVE-SHAPING\nend`;
              } else if (snap.cpu > 65.0) {
                status = "PREDICTIVE";
                root_cause = "Device Overload";
                confidence_score = 70.0;
                ai_attribution = "XGBoost early warning for Device Overload (prob: 70%)";
                evidences.push("Precursor: CPU usage trends upward over the last 15 minutes.");
                cli_fix = `! Proactive control plane threshold monitoring\nsnmp-server enable traps cpu threshold\nprocess cpu threshold type total rising 75 interval 10\nend`;
              }
            }

            rcs[rid] = {
              router_id: rid,
              router_name: snap.router_name,
              status,
              root_cause,
              confidence_score,
              rule_triggered,
              ai_attribution,
              evidences,
              cli_fix,
              latest_metrics: {
                latency: snap.latency,
                packet_loss: snap.packet_loss,
                jitter: snap.jitter,
                bandwidth: snap.bandwidth,
                cpu: snap.cpu,
                memory: snap.memory,
                link_status: snap.link_status
              }
            };
          });
          return new Response(JSON.stringify(rcs), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 17. POST /api/ph5/query
        if (urlObj.pathname.endsWith('/api/ph5/query')) {
          try {
            const body = JSON.parse(init?.body as string);
            const query = body.query || '';
            const routerContext = body.router_context || null;
            
            const retrievedDocs = queryKnowledgeBase(query);
            const answer = generateCopilotResponse(query, routerContext, retrievedDocs, simRef.current.liveData);

            return new Response(JSON.stringify({
              answer,
              engine: "Local Expert Engine (SANDBOX)",
              ollama_available: true,
              ollama_status: "Active",
              retrieved_documents: retrievedDocs,
              target_router: routerContext,
              live_telemetry_count: NODES.length,
              timestamp: new Date().toISOString()
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (e) {
            return new Response(JSON.stringify({ detail: "Invalid query payload" }), { status: 400 });
          }
        }

        // 18. GET /api/ph5/status
        if (urlObj.pathname.endsWith('/api/ph5/status')) {
          return new Response(JSON.stringify({
            ollama_available: true,
            ollama_status: "Ready",
            ollama_url: "http://127.0.0.1:11434",
            ollama_model: "llama3",
            knowledge_docs: KNOWLEDGE_DOCS.length,
            engine: "Local Expert Engine (SANDBOX)",
            status: "ready"
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 19. GET /api/ph6/selfheal
        if (urlObj.pathname.endsWith('/api/ph6/selfheal')) {
          const selfheals: Record<string, any> = {};
          
          const ROUTER_DEPENDENCIES = {
            "ISTRAC-BGL": {
              name: "ISTRAC Bangalore",
              role: "Master NOC Hub",
              criticality: "CRITICAL",
              services: ["Mission Control Link", "Spacecraft Tracking Master", "Data Archival", "Network Management"],
              downstream: ["NOC-DEL", "NOC-MUM", "SDSC-SHAR"],
              backup_path: "via NOC-DEL secondary MPLS"
            },
            "SDSC-SHAR": {
              name: "SDSC Sriharikota",
              role: "Launch Site Operations",
              criticality: "CRITICAL",
              services: ["Launch Command Link", "Real-time Countdown Data", "Safety System Telemetry"],
              downstream: [],
              backup_path: "via VSAT backup (30s failover)"
            },
            "MCF-HSN": {
              name: "MCF Hassan",
              role: "Satellite Control Facility",
              criticality: "HIGH",
              services: ["Satellite TT&C Commands", "Orbital Maintenance Data", "GEO Belt Coordination"],
              downstream: [],
              backup_path: "via MCF Bhopal secondary"
            },
            "NOC-DEL": {
              name: "NOC Delhi",
              role: "Northern India Gateway",
              criticality: "HIGH",
              services: ["MPLS Backbone Routing", "Government Network Interface", "NIC Peering"],
              downstream: ["TRACK-PBL"],
              backup_path: "via NOC-MUM alternate path"
            },
            "NOC-MUM": {
              name: "NOC Mumbai",
              role: "Western India Gateway",
              criticality: "MEDIUM",
              services: ["International Peering", "ISRO External Data Exchange", "Cloud Connectivity"],
              downstream: [],
              backup_path: "via NOC-DEL reroute"
            },
            "TRACK-PBL": {
              name: "TRACK Port Blair",
              role: "Downrange Tracking Station",
              criticality: "HIGH",
              services: ["Launch Vehicle Downrange Tracking", "Telemetry Reception", "Radar Data"],
              downstream: [],
              backup_path: "via VSAT emergency channel"
            }
          };

          const PLAYBOOKS: Record<string, any> = {
            "Link Congestion": {
              steps: ["Apply QoS traffic shaping to throttle non-critical flows", "Activate secondary MPLS tunnel to distribute load", "Rate-limit bulk data transfers (science data, file backups)"],
              cli: (name: string, rid: string) => `! policy-map ISRO-EMERGENCY-QOS on ${name}\npolicy-map ISRO-EMERGENCY-QOS\n class class-default\n  shape average 8000000\nend`,
              fix_min: 3,
              auto: true
            },
            "Device Overload": {
              steps: ["Identify top CPU processes", "Clear bloated IP routing tables", "Apply CPU threshold monitoring"],
              cli: (name: string, rid: string) => `! clear tables on ${name}\nclear ip route *\nclear arp\nend`,
              fix_min: 5,
              auto: true
            },
            "Link Flapping": {
              steps: ["Apply carrier-delay to suppress brief flaps", "Tune OSPF hello/dead timers"],
              cli: (name: string, rid: string) => `! ospf tuning on ${name}\ninterface GigabitEthernet0/1\n carrier-delay msec 2000\nend`,
              fix_min: 2,
              auto: true
            },
            "Link Down": {
              steps: ["Attempt interface restoration", "Activate backup static route", "Dispatch field engineer"],
              cli: (name: string, rid: string) => `! restore interface on ${name}\ninterface GigabitEthernet0/1\n no shutdown\nend`,
              fix_min: 15,
              auto: false
            },
            "Normal": {
              steps: ["No action required."],
              cli: (name: string, rid: string) => `! Healthy.`,
              fix_min: 0,
              auto: false
            }
          };

          NODES.forEach(rid => {
            const snap = simRef.current.liveData[rid];
            if (!snap) return;
            
            const dep = ROUTER_DEPENDENCIES[rid as keyof typeof ROUTER_DEPENDENCIES];
            
            let status = "NORMAL";
            let priority = "P4-NORMAL";
            let priority_color = "green";
            let failure_type = "Normal";
            
            if (snap.link_status === 0) {
              status = "CRITICAL";
              priority = "P1-CRITICAL";
              priority_color = "red";
              failure_type = "Link Down";
            } else if (snap.failure_label === 1) {
              status = "CRITICAL";
              priority = "P1-CRITICAL";
              priority_color = "red";
              failure_type = "Link Congestion";
            } else if (snap.failure_label === 2) {
              status = "CRITICAL";
              priority = "P1-CRITICAL";
              priority_color = "red";
              failure_type = "Device Overload";
            } else if (snap.failure_label === 3) {
              status = "CRITICAL";
              priority = "P1-CRITICAL";
              priority_color = "red";
              failure_type = "Link Flapping";
            } else {
              if (snap.bandwidth > 150.0) {
                status = "PREDICTIVE";
                priority = "P2-HIGH";
                priority_color = "orange";
                failure_type = "Link Congestion";
              } else if (snap.cpu > 65.0) {
                status = "PREDICTIVE";
                priority = "P2-HIGH";
                priority_color = "orange";
                failure_type = "Device Overload";
              }
            }

            const pb = PLAYBOOKS[failure_type] || PLAYBOOKS["Normal"];
            
            selfheals[rid] = {
              router_id: rid,
              router_name: dep.name,
              role: dep.role,
              criticality: dep.criticality,
              status,
              priority,
              priority_color,
              risk_score: snap.failure_label > 0 ? 90.0 : 5.0,
              predicted_failure: failure_type,
              time_to_failure: status === "PREDICTIVE" ? "~30m" : null,
              root_cause: failure_type === "Normal" ? "Normal operations" : failure_type,
              confidence_score: 95.0,
              rule_triggered: status !== "NORMAL" ? "Baseline limit violation" : "None",
              ai_attribution: status !== "NORMAL" ? "Dynamic baseline anomaly" : "Normal Profile",
              evidences: status !== "NORMAL" ? [`Metric deviation detected on ${dep.name}`] : [],
              latest_metrics: {
                latency: snap.latency,
                packet_loss: snap.packet_loss,
                jitter: snap.jitter,
                bandwidth: snap.bandwidth,
                cpu: snap.cpu,
                memory: snap.memory,
                link_status: snap.link_status
              },
              failure_type,
              impact_analysis: status !== "NORMAL" ? [`Affected Services: ${dep.services.join(', ')}`] : [],
              mitigation_steps: pb.steps,
              cli_fix: pb.cli(dep.name, rid),
              automation_script: `# Automated recovery script for ${dep.name}`,
              estimated_fix_minutes: pb.fix_min,
              auto_applicable: pb.auto,
              services: dep.services,
              downstream_routers: dep.downstream,
              backup_path: dep.backup_path
            };
          });

          return new Response(JSON.stringify(selfheals), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isLocalMockMode]);

  const liveSnapshots = Object.values(liveData) as Snapshot[];
  const activeAlerts = liveSnapshots.filter(s => s.failure_label > 0);

  return (
    <div style={{ minHeight: isInline ? 'calc(100vh - 82px)' : '100vh', background: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {!isInline && (
      <header style={{
        background: '#030813',
        borderBottom: '1px solid var(--c-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            padding: '8px',
            background: 'var(--c-primary)15',
            borderRadius: 8,
            border: '1px solid var(--c-primary)30'
          }}>
            <GitBranch style={{ width: 20, height: 20, color: 'var(--c-primary)' }} />
          </div>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: 'var(--c-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              ISRO PRED-NOC
              <span style={{
                fontSize: 9,
                background: 'var(--c-warning)20',
                color: 'var(--c-warning)',
                border: '1px solid var(--c-warning)40',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.1em'
              }}>PHASE 1 — DATA ENGINE</span>
            </h1>
            <p style={{ fontSize: 10, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              SYNTHETIC NETWORK SIMULATOR · INFLUXDB TIME-SERIES · SQLITE STORAGE
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Phase Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--c-border)', borderRadius: 4, padding: 3, background: 'var(--c-bg2)' }}>
            <button
              onClick={() => setTab('overview')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'overview' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'overview' ? 'var(--c-primary)15' : 'none',
                border: tab === 'overview' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'overview') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'overview') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 1: SIM
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('predictions')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'predictions' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'predictions' ? 'var(--c-primary)15' : 'none',
                border: tab === 'predictions' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'predictions') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'predictions') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 2: ML
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('anomalies')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'anomalies' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'anomalies' ? 'var(--c-primary)15' : 'none',
                border: tab === 'anomalies' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'anomalies') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'anomalies') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 3: ANOMALY
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('rootcause')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'rootcause' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'rootcause' ? 'var(--c-primary)15' : 'none',
                border: tab === 'rootcause' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'rootcause') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'rootcause') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 4: RCA
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('copilot')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'copilot' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'copilot' ? 'var(--c-primary)15' : 'none',
                border: tab === 'copilot' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'copilot') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'copilot') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 5: COPILOT
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <a
              href={`${BASE_PH6}/`}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-muted)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; }}
            >
              PH 6: HEAL
            </a>
          </div>

          {/* Dashboard Navigation Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--c-border)', borderRadius: 4, padding: 3, background: 'var(--c-bg2)' }}>
            <a
              href={`${BASE_FRONTEND}/`}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-text)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-text)'; }}
            >
              ◀ BACK
            </a>
            <span style={{ color: 'var(--c-border)', fontSize: 10 }}>|</span>
            <a
              href={`${BASE_PH6}/`}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-text)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-text)'; }}
            >
              NEXT ▶
            </a>
          </div>

          {/* UTC Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
            <Clock style={{ width: 13, height: 13, color: 'var(--c-primary)' }} />
            <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{utcTime || '...'}</span>
          </div>

          {/* WS Status */}
          <span className={`pill ${wsConnected ? 'pill-success' : 'pill-danger'}`}>
            {wsConnected ? <Wifi style={{ width: 10, height: 10 }} /> : <WifiOff style={{ width: 10, height: 10 }} />}
            {wsConnected ? 'STREAM LIVE' : 'DISCONNECTED'}
          </span>

          {/* Generator Status */}
          <span className={`pill ${genStatus?.running ? 'pill-primary' : 'pill-muted'}`}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: genStatus?.running ? 'var(--c-primary)' : 'var(--c-muted)',
              display: 'inline-block',
              animation: genStatus?.running ? 'pulse-dot 1.5s infinite' : 'none'
            }} />
            {genStatus?.running ? 'GENERATOR ACTIVE' : 'GENERATOR STOPPED'}
          </span>
        </div>
      </header>
      )}

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 1,
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-border)'
      }}>
        {[
          { label: 'Total DB Rows', value: totalRows.toLocaleString(), icon: <Database size={14} />, color: 'var(--c-primary)' },
          { label: 'Rows / Min', value: genStatus ? `${genStatus.rows_per_minute}` : '--', icon: <TrendingUp size={14} />, color: 'var(--c-success)' },
          { label: 'Active Routers', value: `${liveSnapshots.length} / 6`, icon: <Server size={14} />, color: 'var(--c-primary)' },
          { label: 'Failure Events', value: `${activeAlerts.length}`, icon: <AlertTriangle size={14} />, color: activeAlerts.length > 0 ? 'var(--c-danger)' : 'var(--c-muted)' },
          { label: 'Total Incidents', value: genStatus ? `${genStatus.total_incidents}` : '--', icon: <Hash size={14} />, color: 'var(--c-orange)' },
          { label: 'Generator PID', value: genStatus?.pid ? `${genStatus.pid}` : 'OFFLINE', icon: <Cpu size={14} />, color: genStatus?.running ? 'var(--c-success)' : 'var(--c-muted)' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--c-card)', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--c-muted)', marginBottom: 4 }}>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
              <span className="section-label" style={{ fontSize: 9 }}>{kpi.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: kpi.color, lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--c-bg2)', borderBottom: '1px solid var(--c-border)', padding: '0 24px' }}>
        <div className="tab-bar" style={{ borderBottom: 'none' }}>
          {([
            ['overview', 'Phase 1: Simulator', <Activity size={12} />],
            ['predictions', 'Phase 2: ML Predictions', <Brain size={12} />],
            ['anomalies', 'Phase 3: Anomaly Detection', <ShieldCheck size={12} />],
            ['rootcause', 'Phase 4: Root Cause Engine', <Sliders size={12} />],
            ['copilot', 'Phase 5: AI Copilot', <MessageCircle size={12} />],
            ['selfheal', 'Phase 6: Autonomous Heal', <Zap size={12} />],
            ['timeseries', 'Time-Series Explorer', <BarChart3 size={12} />],
            ['rawdata', 'Raw Data Table', <Database size={12} />],
            ['incidents', 'Incident Log', <AlertTriangle size={12} />],
            ['dbhealth', 'DB Health', <CheckCircle2 size={12} />],
          ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
            key === 'selfheal' ? (
              <a
                key={key}
                href={`${BASE_PH6}/`}
                className="tab-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
              >
                {icon} {label}
              </a>
            ) : (
              <button
                key={key}
                className={`tab-btn ${tab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {icon} {label}
              </button>
            )
          ))}
          
          {isLocalMockMode && (
            <span className="pill pill-primary" style={{ marginLeft: 'auto', border: '1px solid var(--c-primary)50', background: 'var(--c-primary)10', color: 'var(--c-primary)', display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center', height: 24, fontSize: 9 }}>
              <Radio style={{ width: 10, height: 10, animation: 'pulse-dot 1.5s infinite' }} />
              TELEMETRY: SIMULATION (SANDBOX)
            </span>
          )}
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
              <GeneratorControl status={genStatus} onRefresh={fetchStatus} api={API} />
              <TopologySimulator liveData={liveData} routers={routers} selectedId={selectedRouter} onSelect={setSelectedRouter} />
            </div>
          </div>
        )}

        {tab === 'predictions' && (
          <PredictionPanel api={API} />
        )}

        {tab === 'anomalies' && (
          <AnomalyPanel api={API} />
        )}

        {tab === 'rootcause' && (
          <RootCausePanel api={API} />
        )}

        {tab === 'copilot' && (
          <CopilotPanel api={API} />
        )}

        {tab === 'timeseries' && (
          <MetricsChart
            api={API}
            routers={routers}
            selectedRouterId={selectedRouter}
            onSelectRouter={setSelectedRouter}
          />
        )}

        {tab === 'rawdata' && (
          <DataTable api={API} routers={routers} />
        )}

        {tab === 'incidents' && (
          <IncidentTimeline api={API} />
        )}

        {tab === 'dbhealth' && (
          <DatabaseHealth api={API} genStatus={genStatus} />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        padding: '8px 24px',
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--c-muted)',
        background: '#030813'
      }}>
        <span>ISRO PRED-NOC Phase 1 · Synthetic MPLS Telemetry Engine · v1.0</span>
        <span>
          SQLite: <span style={{ color: 'var(--c-success)' }}>LOCAL</span> &nbsp;|&nbsp;
          InfluxDB: <span style={{ color: genStatus?.influx_available ? 'var(--c-success)' : 'var(--c-warning)' }}>
            {genStatus?.influx_available ? 'CONNECTED' : 'FALLBACK MODE'}
          </span>
          &nbsp;|&nbsp; {totalRows.toLocaleString()} ROWS
        </span>
      </footer>
    </div>
  );
}
