import React, { useMemo, useState, useEffect, useRef } from "react";
import { FileText, GitMerge, Radio, CheckCircle2, Cpu, Wifi, Activity } from "lucide-react";
import type { ActiveAlert, EnrichedHistoryPoint } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CorrelationCluster {
  id: string;
  rootCause: string;
  hypothesis: string;
  affectedNodes: string[];
  severity: "critical" | "elevated" | "nominal";
  confidence: number;
  pattern: string;
  recommendation: string;
  blastRadius: number; // 0-100 impact score
}

interface SitrepSection {
  heading: string;
  body: string;
}

interface RouterSummary {
  id: string;
  name: string;
  risk: number;
  latency: number;
  packetLoss: number;
  jitter: number;
  cpu: number;
  isAnomaly: boolean;
}

// ── Correlation Engine Logic ───────────────────────────────────────────────────
function computeClusters(
  alerts: ActiveAlert[],
  routerHistory: Record<string, EnrichedHistoryPoint[]>
): CorrelationCluster[] {
  if (alerts.length === 0) return [];

  // Collect per-alert telemetry context
  interface AlertContext {
    id: string;
    cpuHigh: boolean;
    latencyHigh: boolean;
    jitterHigh: boolean;
    packetLossHigh: boolean;
    riskScore: number;
    rootCause: string;
  }
  const contexts: AlertContext[] = alerts.map((a) => {
    const hist = routerHistory[a.router_id] ?? [];
    const recent = hist.slice(-5);
    const avgLatency = recent.reduce((s, p) => s + p.latency, 0) / (recent.length || 1);
    const avgJitter = recent.reduce((s, p) => s + p.jitter, 0) / (recent.length || 1);
    const avgPktLoss = recent.reduce((s, p) => s + p.packet_loss, 0) / (recent.length || 1);
    const avgCpu = recent.reduce((s, p) => s + p.cpu, 0) / (recent.length || 1);
    return {
      id: a.router_id,
      cpuHigh: avgCpu > 70,
      latencyHigh: avgLatency > 80,
      jitterHigh: avgJitter > 20,
      packetLossHigh: avgPktLoss > 2,
      riskScore: a.risk_score,
      rootCause: a.root_cause,
    };
  });

  // Pattern-based clustering
  const clusters: CorrelationCluster[] = [];
  const assigned = new Set<string>();

  // Cluster 1: CPU overload pattern
  const cpuNodes = contexts.filter((c) => c.cpuHigh && !assigned.has(c.id));
  if (cpuNodes.length > 0) {
    cpuNodes.forEach((c) => assigned.add(c.id));
    const maxRisk = Math.max(...cpuNodes.map((c) => c.riskScore));
    clusters.push({
      id: "cpu-overload",
      rootCause: "CPU RESOURCE EXHAUSTION",
      hypothesis:
        cpuNodes.length > 1
          ? `${cpuNodes.length} nodes simultaneously exhibiting CPU saturation. Probable shared upstream process spike or coordinated traffic surge. Possible DDoS-class event or runaway cron job propagating across fabric.`
          : `Node ${cpuNodes[0].id} exhibiting CPU saturation above operational threshold. Possible software loop, traffic burst, or BGP route computation spike.`,
      affectedNodes: cpuNodes.map((c) => c.id),
      severity: maxRisk >= 80 ? "critical" : "elevated",
      confidence: cpuNodes.length > 1 ? 88 : 72,
      pattern: "MULTI-NODE CPU SPIKE",
      recommendation: "Examine process tables. Throttle non-critical services. Check for BGP route oscillation. Consider traffic load-balancing to alternate paths.",
      blastRadius: Math.min(100, cpuNodes.length * 20 + maxRisk / 2),
    });
  }

  // Cluster 2: Jitter + packet loss → physical/transport layer
  const jitterNodes = contexts.filter((c) => (c.jitterHigh || c.packetLossHigh) && !assigned.has(c.id));
  if (jitterNodes.length > 0) {
    jitterNodes.forEach((c) => assigned.add(c.id));
    const maxRisk = Math.max(...jitterNodes.map((c) => c.riskScore));
    clusters.push({
      id: "transport-degradation",
      rootCause: "TRANSPORT LAYER DEGRADATION",
      hypothesis:
        jitterNodes.length > 1
          ? `${jitterNodes.length} nodes showing correlated jitter and packet loss. Pattern is consistent with a shared physical medium issue (optical fiber, microwave link, or satellite transponder degradation) or upstream ISP congestion.`
          : `Node ${jitterNodes[0].id} showing elevated jitter and packet loss consistent with physical link degradation or congestion on WAN segment.`,
      affectedNodes: jitterNodes.map((c) => c.id),
      severity: maxRisk >= 80 ? "critical" : "elevated",
      confidence: jitterNodes.length > 1 ? 91 : 68,
      pattern: "JITTER / PACKET-LOSS CORRELATION",
      recommendation: "Inspect physical layer (optical power levels, BER). Check ISP SLA. Activate backup link. Consider QoS prioritization for command-and-control traffic.",
      blastRadius: Math.min(100, jitterNodes.length * 18 + maxRisk / 3),
    });
  }

  // Cluster 3: Latency-only (routing/congestion)
  const latencyNodes = contexts.filter((c) => c.latencyHigh && !assigned.has(c.id));
  if (latencyNodes.length > 0) {
    latencyNodes.forEach((c) => assigned.add(c.id));
    const maxRisk = Math.max(...latencyNodes.map((c) => c.riskScore));
    clusters.push({
      id: "routing-congestion",
      rootCause: "ROUTING / CONGESTION ANOMALY",
      hypothesis:
        latencyNodes.length > 1
          ? `${latencyNodes.length} nodes reporting abnormal latency without packet loss, suggesting a routing table change or suboptimal path selection after a BGP event. Traffic may be hairpinning through a congested intermediate node.`
          : `Node ${latencyNodes[0].id} reporting latency spike without proportional packet loss — consistent with route change or queuing congestion at an intermediate hop.`,
      affectedNodes: latencyNodes.map((c) => c.id),
      severity: maxRisk >= 80 ? "critical" : "elevated",
      confidence: 74,
      pattern: "ISOLATED LATENCY SPIKE",
      recommendation: "Run traceroute to identify the anomalous hop. Verify BGP routing tables. Check MPLS label switching. Review traffic engineering policies.",
      blastRadius: Math.min(100, latencyNodes.length * 12 + maxRisk / 3),
    });
  }

  // Cluster 4: Unclustered — individual anomalies
  const remaining = contexts.filter((c) => !assigned.has(c.id));
  remaining.forEach((c) => {
    clusters.push({
      id: `individual-${c.id}`,
      rootCause: "ISOLATED ANOMALY",
      hypothesis: `Node ${c.id} exhibiting individual anomaly. Root cause: "${c.rootCause}". No correlated pattern detected with other active alerts. Likely node-specific hardware or software fault.`,
      affectedNodes: [c.id],
      severity: c.riskScore >= 80 ? "critical" : "elevated",
      confidence: 60,
      pattern: "STANDALONE FAULT",
      recommendation: `Inspect ${c.id} directly. Check system logs, interface errors, and hardware health. Restart affected services if safe to do so.`,
      blastRadius: Math.min(100, c.riskScore / 2),
    });
  });

  return clusters.sort((a, b) => b.blastRadius - a.blastRadius);
}

function generateSitrep(
  clusters: CorrelationCluster[],
  routerSummaries: RouterSummary[],
  utcTime: string,
  healthScore: number,
  isMockMode: boolean
): SitrepSection[] {
  const critical = clusters.filter((c) => c.severity === "critical");
  const elevated = clusters.filter((c) => c.severity === "elevated");
  const affectedCount = new Set(clusters.flatMap((c) => c.affectedNodes)).size;
  const modeStr = isMockMode ? "SIMULATION (SANDBOX)" : "LIVE OPERATIONS";
  const overallStatus = critical.length > 0 ? "RED" : elevated.length > 0 ? "AMBER" : "GREEN";

  const worstNode = routerSummaries.slice().sort((a, b) => b.risk - a.risk)[0];

  const sections: SitrepSection[] = [
    {
      heading: "1. SITUATION SUMMARY",
      body: [
        `CLASSIFICATION: ISRO PRED-NOC INTERNAL // UNCLASSIFIED`,
        `DTGZ: ${utcTime || new Date().toUTCString().replace("GMT", "UTC")}`,
        `OPERATION MODE: ${modeStr}`,
        `OVERALL STATUS: ${overallStatus}`,
        `NETWORK HEALTH INDEX: ${healthScore}/100`,
        ``,
        clusters.length === 0
          ? `All ISRO ground station nodes are operating within normal parameters. No active incidents detected. Network health index is ${healthScore}/100. Continuous monitoring active.`
          : `ISRO ground station network is experiencing ${critical.length > 0 ? "CRITICAL" : "ELEVATED"} operational disruption. ` +
            `${affectedCount} node(s) affected across ${clusters.length} correlated incident cluster(s). ` +
            `Network health index has degraded to ${healthScore}/100. Immediate attention is ${critical.length > 0 ? "REQUIRED" : "RECOMMENDED"}.`,
      ].join("\n"),
    },
  ];

  if (clusters.length > 0) {
    sections.push({
      heading: "2. INCIDENT CORRELATION ANALYSIS",
      body: clusters
        .map(
          (c, i) =>
            `[CLUSTER ${i + 1}] ${c.pattern}\n` +
            `ROOT CAUSE: ${c.rootCause}\n` +
            `AFFECTED NODES: ${c.affectedNodes.join(", ")}\n` +
            `HYPOTHESIS: ${c.hypothesis}\n` +
            `CONFIDENCE: ${c.confidence}%  |  BLAST RADIUS: ${Math.round(c.blastRadius)}/100\n` +
            `RECOMMENDATION: ${c.recommendation}`
        )
        .join("\n\n"),
    });

    sections.push({
      heading: "3. BLAST RADIUS ASSESSMENT",
      body:
        `TOTAL AFFECTED NODES: ${affectedCount} / ${routerSummaries.length}\n` +
        `MISSION-CRITICAL SYSTEMS AT RISK: ${critical.length > 0 ? "YES — COMMAND & CONTROL CHANNEL INTEGRITY COMPROMISED" : "NO"}\n` +
        (worstNode
          ? `HIGHEST RISK NODE: ${worstNode.id} (${worstNode.name}) — RISK SCORE: ${worstNode.risk}%\n` +
            `  Latency: ${worstNode.latency.toFixed(1)}ms | Jitter: ${worstNode.jitter.toFixed(1)}ms | Packet Loss: ${worstNode.packetLoss.toFixed(2)}% | CPU: ${worstNode.cpu.toFixed(1)}%`
          : "") +
        `\n\nCASCADE RISK: ${affectedCount >= 3 ? "HIGH — Multiple correlated failures increase probability of cascade event. Recommend activating contingency comms path." : affectedCount >= 2 ? "MEDIUM — Monitor closely for cascade propagation." : "LOW — Isolated incident, limited cascade potential."}`,
    });
  }

  sections.push({
    heading: clusters.length > 0 ? "4. RECOMMENDED ACTIONS (PRIORITY ORDER)" : "3. STATUS & MONITORING",
    body:
      clusters.length === 0
        ? `a. CONTINUE: Normal monitoring cadence maintained.\nb. FORECAST ENGINE: All nodes trending stable for next 30 minutes.\nc. STANDBY: Auto-heal orchestrator in CLOSED-LOOP mode — ready to respond to any detected anomaly.\nd. NO ACTION REQUIRED at this time.`
        : clusters
            .map(
              (c, i) =>
                `${String.fromCharCode(97 + i).toUpperCase()}. [${c.severity.toUpperCase()}] ${c.rootCause} — ${c.affectedNodes.join(", ")}\n   → ${c.recommendation}`
            )
            .join("\n"),
  });

  sections.push({
    heading: clusters.length > 0 ? "5. END OF SITREP" : "4. END OF SITREP",
    body: `Report generated by ISRO PRED-NOC AI Correlation Engine.\nNext automatic assessment: in 60 seconds.\nFor escalation: Contact NOC Watch Officer.\n// AUTO-GENERATED — DO NOT DISTRIBUTE WITHOUT AUTHORIZATION //`,
  });

  return sections;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const SeverityBadge: React.FC<{ severity: CorrelationCluster["severity"] }> = ({ severity }) => {
  const cls =
    severity === "critical"
      ? "bg-red-500/20 text-red-400 border-red-500/40"
      : severity === "elevated"
      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
      : "bg-green-500/20 text-green-400 border-green-500/40";
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${cls}`}>
      {severity.toUpperCase()}
    </span>
  );
};

const BlastBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 70 ? "#ef4444" : value >= 40 ? "#f59e0b" : "#22c55e";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#1e3a5f] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-8">{Math.round(value)}</span>
    </div>
  );
};

const ClusterCard: React.FC<{ cluster: CorrelationCluster; index: number }> = ({ cluster, index }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <div
      className={`rounded-lg border bg-[#0a1428] overflow-hidden transition-all duration-300 ${
        cluster.severity === "critical"
          ? "border-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.12)]"
          : cluster.severity === "elevated"
          ? "border-amber-500/40"
          : "border-[#1e3a5f]/60"
      }`}
    >
      {/* Card Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#0d1526] transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              cluster.severity === "critical" ? "bg-red-500/20" : "bg-amber-500/20"
            }`}
          >
            <GitMerge
              className={`w-4 h-4 ${cluster.severity === "critical" ? "text-red-400" : "text-amber-400"}`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xs text-white">CLUSTER {index + 1}</span>
              <SeverityBadge severity={cluster.severity} />
              <span className="text-[10px] font-mono text-slate-400 bg-[#1e3a5f]/60 px-2 py-0.5 rounded">
                {cluster.pattern}
              </span>
            </div>
            <p className="text-[11px] font-mono text-cyan-300 font-bold mt-0.5 truncate">
              {cluster.rootCause}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-500 font-mono">BLAST RADIUS</p>
            <div className="w-24">
              <BlastBar value={cluster.blastRadius} />
            </div>
          </div>
          <span className="text-slate-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Card Body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e3a5f]/40 pt-3 flex flex-col gap-3">
          {/* Affected nodes */}
          <div className="flex flex-wrap gap-1.5">
            {cluster.affectedNodes.map((n) => (
              <span
                key={n}
                className="text-[10px] font-mono font-bold bg-[#1e3a5f]/60 border border-[#2a4a7f]/60 text-cyan-300 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Radio className="w-2.5 h-2.5" />
                {n}
              </span>
            ))}
          </div>

          {/* Hypothesis */}
          <div className="bg-[#060e1f] rounded border border-[#1e3a5f]/40 p-3">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1">
              AI HYPOTHESIS
            </p>
            <p className="text-xs text-slate-300 font-mono leading-relaxed">{cluster.hypothesis}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#060e1f] rounded border border-[#1e3a5f]/40 p-2">
              <p className="text-[9px] text-slate-500 font-mono uppercase">Confidence</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-400"
                    style={{ width: `${cluster.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-cyan-400 font-mono font-bold">{cluster.confidence}%</span>
              </div>
            </div>
            <div className="bg-[#060e1f] rounded border border-[#1e3a5f]/40 p-2">
              <p className="text-[9px] text-slate-500 font-mono uppercase">Blast Radius</p>
              <div className="mt-1">
                <BlastBar value={cluster.blastRadius} />
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div
            className={`rounded border p-3 ${
              cluster.severity === "critical"
                ? "bg-red-950/30 border-red-500/30"
                : "bg-amber-950/20 border-amber-500/20"
            }`}
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              ⚡ RECOMMENDED ACTION
            </p>
            <p
              className={`text-xs font-mono leading-relaxed ${
                cluster.severity === "critical" ? "text-red-300" : "text-amber-300"
              }`}
            >
              {cluster.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Auto-Typing SITREP Text ────────────────────────────────────────────────────
interface TypedSitrepProps {
  sections: SitrepSection[];
  statusColor: string;
}

const TypedSitrep: React.FC<TypedSitrepProps> = ({
  sections,
  statusColor,
}) => {
  const fullText = sections
    .map((s) => `══ ${s.heading} ══\n${s.body}`)
    .join("\n\n");
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  const fullTextRef = useRef(fullText);
  useEffect(() => {
    fullTextRef.current = fullText;
  }, [fullText]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i >= fullTextRef.current.length) {
        setDone(true);
        clearInterval(interval);
        return;
      }
      setDisplayed(fullTextRef.current.slice(0, i + 1));
      i += 4;
    }, 10);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#020810] border border-[#1e3a5f]/60 rounded-lg p-4 font-mono text-xs leading-relaxed overflow-y-auto max-h-[520px] relative">
      {/* Terminal header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1e3a5f]/40">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        <span className="ml-2 text-[10px] text-slate-500">PRED-NOC SITREP TERMINAL v1.0</span>
        <div className="ml-auto flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor === "RED" ? "bg-red-400" : statusColor === "AMBER" ? "bg-amber-400" : "bg-green-400"} animate-pulse`} />
          <span className={`text-[10px] font-bold ${statusColor === "RED" ? "text-red-400" : statusColor === "AMBER" ? "text-amber-400" : "text-green-400"}`}>
            STATUS: {statusColor}
          </span>
        </div>
      </div>
      <pre className="whitespace-pre-wrap text-green-300/90">
        {done ? fullText : displayed}
        {!done && <span className="animate-pulse text-green-400">█</span>}
      </pre>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
interface SitrepPanelProps {
  alerts: ActiveAlert[];
  routerHistory: Record<string, EnrichedHistoryPoint[]>;
  telemetryData: Record<string, { telemetry: { router_id: string; router_name: string; latency: number; packet_loss: number; jitter: number; cpu: number }; analysis: { failure_risk: number; is_anomaly: boolean } }>;
  healthScore: number;
  utcTime: string;
  isMockMode: boolean;
}

export const SitrepPanel: React.FC<SitrepPanelProps> = ({
  alerts,
  routerHistory,
  telemetryData,
  healthScore,
  utcTime,
  isMockMode,
}) => {
  const routerSummaries: RouterSummary[] = useMemo(
    () =>
      Object.entries(telemetryData).map(([id, s]) => ({
        id,
        name: s.telemetry.router_name,
        risk: s.analysis.failure_risk,
        latency: s.telemetry.latency,
        packetLoss: s.telemetry.packet_loss,
        jitter: s.telemetry.jitter,
        cpu: s.telemetry.cpu,
        isAnomaly: s.analysis.is_anomaly,
      })),
    [telemetryData]
  );

  const clusters = useMemo(
    () => computeClusters(alerts, routerHistory),
    [alerts, routerHistory]
  );

  const sitrepSections = useMemo(
    () => generateSitrep(clusters, routerSummaries, utcTime, healthScore, isMockMode),
    [clusters, routerSummaries, utcTime, healthScore, isMockMode]
  );

  const overallStatus =
    clusters.some((c) => c.severity === "critical")
      ? "RED"
      : clusters.some((c) => c.severity === "elevated")
      ? "AMBER"
      : "GREEN";

  const totalAffected = new Set(clusters.flatMap((c) => c.affectedNodes)).size;

  const handleExportSitrep = () => {
    const reportTitle = "========================================================\n" +
                        "     ISRO PRED-NOC SITUATIONAL INCIDENT REPORT (SITREP)  \n" +
                        "========================================================\n\n";
    const meta = `Generated Time: ${utcTime || new Date().toUTCString()}\n` +
                 `Grid Composite Health Score: ${healthScore}/100\n` +
                 `Total Active Alerts: ${alerts.length}\n` +
                 `Overall Status: ${overallStatus}\n\n`;

    let clustersTxt = "--- CORRELATED INCIDENT CLUSTERS ---\n";
    if (clusters.length === 0) {
      clustersTxt += "No correlated incident clusters detected. System operates normally.\n\n";
    } else {
      clusters.forEach((c, idx) => {
        clustersTxt += `[Cluster #${idx + 1}] Pattern: ${c.pattern}\n` +
                       `  Root Cause: ${c.rootCause}\n` +
                       `  Blast Radius Index: ${c.blastRadius}%\n` +
                       `  Hypothesis: ${c.hypothesis}\n` +
                       `  Affected Nodes: ${c.affectedNodes.join(", ")}\n` +
                       `  Operational Action: ${c.recommendation}\n\n`;
      });
    }

    let sitrepTxt = "--- AUTO-GENERATED SITREP SUMMARY ---\n";
    sitrepSections.forEach(s => {
      sitrepTxt += `[${s.heading.toUpperCase()}]\n${s.body}\n\n`;
    });

    const footer = "========================================================\n" +
                   "Report compiled by ISRO Air-Gapped Network Copilot.\n" +
                   "Security Classification: INTERNAL / RESTRICTED\n" +
                   "========================================================";

    const fullText = reportTitle + meta + clustersTxt + sitrepTxt + footer;
    
    // Create blob & download
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ISRO_NOC_SITREP_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const alertsHash = useMemo(() => {
    return alerts.map((a) => `${a.router_id}-${a.risk_score}`).join("|");
  }, [alerts]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Status Bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "NETWORK STATUS",
            value: overallStatus,
            sub: clusters.length > 0 ? `${clusters.length} incident cluster(s)` : "All systems nominal",
            color:
              overallStatus === "RED"
                ? "text-red-400"
                : overallStatus === "AMBER"
                ? "text-amber-400"
                : "text-green-400",
            border:
              overallStatus === "RED"
                ? "border-red-500/50"
                : overallStatus === "AMBER"
                ? "border-amber-500/40"
                : "border-green-500/30",
            pulse: overallStatus !== "GREEN",
          },
          {
            label: "ACTIVE ALERTS",
            value: alerts.length.toString(),
            sub: alerts.length > 0 ? "Immediate attention required" : "No active alerts",
            color: alerts.length > 0 ? "text-red-400" : "text-green-400",
            border: alerts.length > 0 ? "border-red-500/40" : "border-[#1e3a5f]/60",
            pulse: alerts.length > 0,
          },
          {
            label: "NODES AFFECTED",
            value: `${totalAffected} / ${routerSummaries.length}`,
            sub: totalAffected > 0 ? "Under investigation" : "All nodes clear",
            color: totalAffected > 0 ? "text-amber-400" : "text-green-400",
            border: totalAffected > 0 ? "border-amber-500/40" : "border-[#1e3a5f]/60",
            pulse: false,
          },
          {
            label: "HEALTH INDEX",
            value: `${healthScore}`,
            sub: healthScore >= 80 ? "Optimal" : healthScore >= 60 ? "Degraded" : "Critical",
            color: healthScore >= 80 ? "text-green-400" : healthScore >= 60 ? "text-amber-400" : "text-red-400",
            border: healthScore >= 80 ? "border-green-500/30" : healthScore >= 60 ? "border-amber-500/40" : "border-red-500/50",
            pulse: false,
          },
        ].map((c) => (
          <div key={c.label} className={`bg-[#0a1428] border ${c.border} rounded-lg p-3 flex flex-col gap-1`}>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{c.label}</span>
            <span className={`text-xl font-black font-mono ${c.color} ${c.pulse ? "animate-pulse" : ""}`}>
              {c.value}
            </span>
            <span className="text-[10px] text-slate-400">{c.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Alert Correlations ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
            ALERT CORRELATION CLUSTERS
          </h3>
          {clusters.length === 0 && (
            <span className="text-[10px] text-green-400 font-mono bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">
              NO INCIDENTS
            </span>
          )}
        </div>

        {clusters.length === 0 ? (
          <div className="bg-green-950/20 border border-green-500/30 rounded-lg px-4 py-6 flex items-center justify-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-mono text-green-300 font-bold">NO CORRELATED INCIDENTS DETECTED</p>
              <p className="text-xs text-green-400/60 font-mono mt-0.5">All ISRO ground station nodes operating within normal parameters.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {clusters.map((c, i) => (
              <ClusterCard key={c.id} cluster={c} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Node Telemetry Snapshot ──────────────────────────────────────────── */}
      <div className="bg-[#060e1f] border border-[#1e3a5f]/60 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1e3a5f]/60 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono text-cyan-300 font-bold uppercase tracking-wider">
            NODE TELEMETRY SNAPSHOT
          </span>
          <span className="ml-auto text-[10px] text-slate-500 font-mono">{utcTime || "SYNCING…"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1e3a5f]/40 text-[10px] text-slate-500 uppercase">
                <th className="text-left px-4 py-2">Node</th>
                <th className="text-right px-4 py-2">Risk</th>
                <th className="text-right px-4 py-2">Latency</th>
                <th className="text-right px-4 py-2">Jitter</th>
                <th className="text-right px-4 py-2">Pkt Loss</th>
                <th className="text-right px-4 py-2">CPU</th>
                <th className="text-right px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {routerSummaries.sort((a, b) => b.risk - a.risk).map((r) => (
                <tr key={r.id} className="border-b border-[#1e3a5f]/20 hover:bg-[#0d1526] transition-colors">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Wifi className={`w-3 h-3 ${r.risk >= 60 ? "text-amber-400" : "text-green-400"}`} />
                      <span className="text-white font-bold">{r.id}</span>
                      <span className="text-slate-500 text-[10px]">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span style={{ color: r.risk >= 80 ? "#ef4444" : r.risk >= 60 ? "#f59e0b" : "#22c55e" }}>{r.risk}%</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={r.latency > 80 ? "text-red-400" : r.latency > 50 ? "text-amber-400" : "text-slate-300"}>{r.latency.toFixed(1)}ms</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={r.jitter > 20 ? "text-red-400" : r.jitter > 10 ? "text-amber-400" : "text-slate-300"}>{r.jitter.toFixed(1)}ms</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={r.packetLoss > 2 ? "text-red-400" : r.packetLoss > 0.5 ? "text-amber-400" : "text-slate-300"}>{r.packetLoss.toFixed(2)}%</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      <span className={r.cpu > 70 ? "text-red-400" : r.cpu > 50 ? "text-amber-400" : "text-slate-300"}>{r.cpu.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.isAnomaly ? (
                      <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded font-bold">ANOMALY</span>
                    ) : r.risk >= 60 ? (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded">ELEVATED</span>
                    ) : (
                      <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-0.5 rounded">NOMINAL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AI-Generated SITREP Terminal ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e3a5f]/40 pb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
              AUTO-GENERATED SITREP
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">(Situational Report — regenerates every 60s)</span>
          </div>
          
          <button
            onClick={handleExportSitrep}
            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/40 hover:border-cyan-400 rounded text-[10px] font-mono font-bold text-cyan-300 transition-all cursor-pointer hover:shadow-glow-cyan"
            title="Download full incident report and SITREP as standard text file"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>EXPORT REPORT</span>
          </button>
        </div>
        <TypedSitrep key={`${overallStatus}-${alertsHash}`} sections={sitrepSections} statusColor={overallStatus} />
      </div>
    </div>
  );
};
