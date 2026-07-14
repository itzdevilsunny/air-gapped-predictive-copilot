import React, { useMemo, useEffect, useState, useRef } from "react";
import { Radio, Zap, AlertTriangle, CheckCircle2, Cpu, Wifi, Activity, CloudSun, Compass, Shield } from "lucide-react";
import type { ActiveAlert, EnrichedHistoryPoint } from "../types";
import type { MissionEvent } from "./MissionTimeline";

// ── Station map positions (% of SVG 800x520 viewport, based on India map) ─────
const STATION_POSITIONS: Record<string, { x: number; y: number; label: string; shortLabel: string }> = {
  "NOC-DEL":    { x: 42.0, y: 18.5, label: "NOC Delhi",          shortLabel: "DEL" },
  "NOC-MUM":    { x: 28.5, y: 42.0, label: "NOC Mumbai",          shortLabel: "MUM" },
  "MCF-HSN":    { x: 32.5, y: 66.5, label: "MCF Hassan",          shortLabel: "HSN" },
  "ISTRAC-BGL": { x: 34.5, y: 70.0, label: "ISTRAC Bangalore",    shortLabel: "BGL" },
  "SDSC-SHAR":  { x: 50.0, y: 65.5, label: "SDSC Sriharikota",   shortLabel: "SHAR" },
  "TRACK-PBL":  { x: 76.0, y: 62.0, label: "TRACK Port Blair",    shortLabel: "PBL" },
};

// ── India SVG outline (simplified path) ──────────────────────────────────────
const INDIA_PATH = `M 310 20 L 330 15 L 355 22 L 370 18 L 395 30 L 410 22 L 430 28 L 450 20 L 460 35 L 470 28 L 490 40 L 500 52 L 515 48 L 525 60 L 540 55 L 555 68 L 560 80 L 575 88 L 580 100 L 572 112 L 580 125 L 575 138 L 585 150 L 590 165 L 575 178 L 580 190 L 570 205 L 562 218 L 555 232 L 545 248 L 540 262 L 530 278 L 520 292 L 510 308 L 498 320 L 485 335 L 475 348 L 462 360 L 450 368 L 440 380 L 428 388 L 418 378 L 408 365 L 398 350 L 388 338 L 375 325 L 362 310 L 350 295 L 340 278 L 330 262 L 322 245 L 315 228 L 308 212 L 302 195 L 298 178 L 292 162 L 288 145 L 282 128 L 278 112 L 275 96 L 272 80 L 270 65 L 268 50 L 272 38 L 285 28 L 298 22 Z`;

// ── Connectivity pairs (which stations show animated data links) ─────────────
const LINKS: Array<[string, string]> = [
  ["NOC-DEL", "ISTRAC-BGL"],
  ["NOC-DEL", "NOC-MUM"],
  ["NOC-MUM", "MCF-HSN"],
  ["MCF-HSN", "ISTRAC-BGL"],
  ["ISTRAC-BGL", "SDSC-SHAR"],
  ["SDSC-SHAR", "TRACK-PBL"],
  ["NOC-MUM", "SDSC-SHAR"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function riskColor(risk: number): string {
  if (risk >= 80) return "#ef4444";
  if (risk >= 60) return "#f59e0b";
  if (risk >= 30) return "#06b6d4";
  return "#22c55e";
}

function riskGlow(risk: number): string {
  if (risk >= 80) return "drop-shadow(0 0 6px #ef4444)";
  if (risk >= 60) return "drop-shadow(0 0 5px #f59e0b)";
  if (risk >= 30) return "drop-shadow(0 0 4px #06b6d4)";
  return "drop-shadow(0 0 4px #22c55e)";
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RouterTelemetry {
  router_id: string;
  router_name: string;
  latency: number;
  packet_loss: number;
  jitter: number;
  cpu: number;
}
interface RouterAnalysis {
  failure_risk: number;
  is_anomaly: boolean;
}
interface RouterData {
  telemetry: RouterTelemetry;
  analysis: RouterAnalysis;
}

interface BigBoardProps {
  telemetryData: Record<string, RouterData>;
  alerts: ActiveAlert[];
  missionEvents: MissionEvent[];
  routerHistory: Record<string, EnrichedHistoryPoint[]>;
  healthScore: number;
  utcTime: string;
  isMockMode: boolean;
  healActive: boolean;
}

// ── Animated data packet dot along a link ────────────────────────────────────
const DataPacket: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; delay: number; duration: number }> = ({
  x1, y1, x2, y2, color, delay, duration,
}) => {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const total = duration * 1000;
    const delayMs = delay * 1000;
    let started = false;
    const animate = (ts: number) => {
      if (!started) { if (ts - (start ?? ts) < delayMs) { start = start ?? ts; frame = requestAnimationFrame(animate); return; } started = true; start = ts; }
      const elapsed = (ts - (start ?? ts)) % total;
      setPos(elapsed / total);
      frame = requestAnimationFrame(animate);
    };
    setTimeout(() => { frame = requestAnimationFrame(animate); }, delayMs);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration]);
  const px = x1 + (x2 - x1) * pos;
  const py = y1 + (y2 - y1) * pos;
  return <circle cx={px} cy={py} r={2.5} fill={color} opacity={0.9} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />;
};

// ── Ring Gauge ────────────────────────────────────────────────────────────────
const RingGauge: React.FC<{ value: number; size: number; label: string; color: string }> = ({ value, size, label, color }) => {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e3a5f" strokeWidth={size * 0.08} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={size * 0.08}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={size * 0.18} fontWeight="bold" fontFamily="monospace">
        {value}%
      </text>
      <text x={size / 2} y={size / 2 + size * 0.18} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={size * 0.1} fontFamily="monospace">
        {label}
      </text>
    </svg>
  );
};

// ── Event Ticker ──────────────────────────────────────────────────────────────
const EventTicker: React.FC<{ events: MissionEvent[] }> = ({ events }) => {
  const tickerRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const recent = events.slice(-30).reverse();
    return recent.length > 0 ? recent : [{ id: "idle", severity: "info" as const, title: "MONITORING ACTIVE", detail: "All systems nominal. No events in queue.", node: undefined, timestamp: new Date().toISOString() }];
  }, [events]);

  const severityColor = (s: string) => s === "critical" ? "text-red-400" : s === "warning" ? "text-amber-400" : s === "success" ? "text-green-400" : "text-cyan-400";
  const severityBg = (s: string) => s === "critical" ? "bg-red-500/20" : s === "warning" ? "bg-amber-500/15" : s === "success" ? "bg-green-500/15" : "bg-cyan-500/10";

  return (
    <div className="flex items-stretch overflow-hidden" style={{ height: "36px" }}>
      <div className="bg-cyan-500/20 border-r border-cyan-500/30 px-3 flex items-center shrink-0">
        <span className="text-[10px] font-mono font-black text-cyan-300 tracking-widest uppercase flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
          OPS FEED
        </span>
      </div>
      <div ref={tickerRef} className="flex-1 overflow-hidden relative flex items-center">
        <div
          className="flex items-center gap-4 whitespace-nowrap"
          style={{ animation: "ticker-scroll 60s linear infinite", willChange: "transform" }}
        >
          {[...items, ...items].map((ev, i) => (
            <span key={`${ev.id}-${i}`} className={`inline-flex items-center gap-2 px-2 py-0.5 rounded text-[11px] font-mono shrink-0 ${severityBg(ev.severity)}`}>
              <span className={`font-bold ${severityColor(ev.severity)}`}>[{ev.severity.toUpperCase()}]</span>
              {ev.node && <span className="text-slate-400">{ev.node}:</span>}
              <span className="text-slate-200">{ev.title}</span>
              <span className="text-slate-500">—</span>
              <span className="text-slate-400 text-[10px]">{ev.detail.slice(0, 60)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Station Node on Map ───────────────────────────────────────────────────────
const StationNode: React.FC<{
  id: string; x: number; y: number; label: string; shortLabel: string;
  risk: number; isAnomaly: boolean; isAlert: boolean;
  selected: boolean; onClick: () => void;
}> = ({ x, y, label, shortLabel, risk, isAnomaly, isAlert, selected, onClick }) => {
  const color = riskColor(risk);
  const r = 14;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Outer pulsing ring for alerts */}
      {(isAlert || isAnomaly) && (
        <circle cx={x} cy={y} r={r + 8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4}
          style={{ animation: "ping 1.5s ease-out infinite" }} />
      )}
      {/* Selection ring */}
      {selected && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />}
      {/* Main node circle */}
      <circle cx={x} cy={y} r={r} fill="#0a1428" stroke={color} strokeWidth={2.5}
        style={{ filter: riskGlow(risk), transition: "all 0.5s ease" }} />
      {/* Risk fill arc (simplified as inner circle opacity) */}
      <circle cx={x} cy={y} r={r * 0.65} fill={color} opacity={0.25} />
      {/* Label */}
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="white"
        fontSize={8} fontWeight="bold" fontFamily="monospace">{shortLabel}</text>
      {/* Station name label below */}
      <rect x={x - 30} y={y + r + 3} width={60} height={12} rx={2} fill="#0a1428" opacity={0.8} />
      <text x={x} y={y + r + 9} textAnchor="middle" dominantBaseline="middle" fill={color}
        fontSize={7} fontFamily="monospace">{label.split(" ").slice(0, 2).join(" ")}</text>
      {/* Risk % badge */}
      <rect x={x + r - 4} y={y - r - 8} width={22} height={11} rx={2} fill="#0a1428" stroke={color} strokeWidth={0.8} opacity={0.95} />
      <text x={x + r + 7} y={y - r - 2} textAnchor="middle" dominantBaseline="middle" fill={color}
        fontSize={7} fontFamily="monospace" fontWeight="bold">{risk}%</text>
    </g>
  );
};

// ── Satellite Orbits definitions ──────────────────────────────────────────────
interface SimulatedSatellite {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  radius: number;
  speed: string;
  alt: string;
  color: string;
  visibleNodes: string[];
}

// ── Main Big Board ─────────────────────────────────────────────────────────────
export const BigBoard: React.FC<BigBoardProps> = ({
  telemetryData, alerts, missionEvents, routerHistory, healthScore, utcTime, isMockMode, healActive,
}) => {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [missionElapsed, setMissionElapsed] = useState(0);
  const [time, setTime] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<"detail" | "satellites">("satellites");

  // Mission elapsed counter (seconds since page load, simulating mission ops time)
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setMissionElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Smooth orbital tracking loop
  useEffect(() => {
    let frame: number;
    const tick = () => {
      setTime(prev => (prev + 0.035) % 100);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `T+${h}:${m}:${sec}`;
  };

  const stations = useMemo(() =>
    Object.entries(STATION_POSITIONS).map(([id, pos]) => {
      const d = telemetryData[id];
      // Simulated weather attenuation based on station id
      let cloudCover = 10;
      let weather = "NOMINAL (CLEAR)";
      if (id === "NOC-MUM") { cloudCover = 78; weather = "HEAVY RAIN (FADE ALERT)"; }
      else if (id === "TRACK-PBL") { cloudCover = 45; weather = "OVERCAST"; }
      else if (id === "SDSC-SHAR") { cloudCover = 25; weather = "PARTLY CLOUDY"; }

      const signalStrength = Math.round(100 - (cloudCover * 0.45));

      return {
        id, ...pos,
        risk: d?.analysis.failure_risk ?? 0,
        cpu: d?.telemetry.cpu ?? 0,
        latency: d?.telemetry.latency ?? 0,
        jitter: d?.telemetry.jitter ?? 0,
        packetLoss: d?.telemetry.packet_loss ?? 0,
        isAnomaly: d?.analysis.is_anomaly ?? false,
        isAlert: alerts.some(a => a.router_id === id),
        name: d?.telemetry.router_name ?? id,
        cloudCover,
        weather,
        signalStrength,
      };
    }),
    [telemetryData, alerts]
  );

  const selected = selectedStation ? stations.find(s => s.id === selectedStation) : null;
  const criticalCount = alerts.length;
  const overallStatus = healActive ? "HEALING" : criticalCount > 0 ? "CRITICAL" : healthScore < 60 ? "DEGRADED" : "NOMINAL";
  const statusColor = overallStatus === "CRITICAL" ? "#ef4444" : overallStatus === "HEALING" ? "#06b6d4" : overallStatus === "DEGRADED" ? "#f59e0b" : "#22c55e";

  // SVG dimensions
  const SVG_W = 520;
  const SVG_H = 380;
  const toSVG = (pct: number, dim: number) => (pct / 100) * dim;

  // Orbit Calculation
  const satellites = useMemo<SimulatedSatellite[]>(() => {
    // 1. GSAT-30: Geostationary stationary float
    const gsatX = toSVG(44.0 + Math.sin(time * 0.08) * 3, SVG_W);
    const gsatY = toSVG(50.0 + Math.cos(time * 0.08) * 3, SVG_H);

    // 2. CARTOSAT-3: Polar sun-synchronous top-to-bottom
    const polarPct = (time * 1.6) % 100;
    const cartoX = toSVG(33.0 + (polarPct / 100) * 15, SVG_W);
    const cartoY = toSVG(-20 + (polarPct / 100) * 140, SVG_H);

    // 3. RISAT-2B: inclined Equatorial SW-to-NE
    const eqPct = ((time + 40) * 1.3) % 100;
    const risatX = toSVG(-20 + (eqPct / 100) * 140, SVG_W);
    const risatY = toSVG(78.0 - (eqPct / 100) * 60, SVG_H);

    const list = [
      { id: "GSAT-30", name: "GSAT-30", type: "GEOSTATIONARY", x: gsatX, y: gsatY, radius: 100, speed: "3.07 km/s", alt: "35,786 km", color: "#a855f7" },
      { id: "CARTOSAT-3", name: "CARTOSAT-3", type: "POLAR ORBIT (LEO)", x: cartoX, y: cartoY, radius: 80, speed: "7.52 km/s", alt: "509 km", color: "#f43f5e" },
      { id: "RISAT-2B", name: "RISAT-2B", type: "RADAR IMAGING", x: risatX, y: risatY, radius: 90, speed: "7.56 km/s", alt: "557 km", color: "#3b82f6" },
    ];

    return list.map(sat => {
      const visibleNodes: string[] = [];
      stations.forEach(st => {
        const sx = toSVG(st.x, SVG_W);
        const sy = toSVG(st.y, SVG_H);
        const dist = Math.sqrt(Math.pow(sx - sat.x, 2) + Math.pow(sy - sat.y, 2));
        if (dist < sat.radius) {
          visibleNodes.push(st.id);
        }
      });
      return { ...sat, visibleNodes };
    });
  }, [time, stations]);

  // Handle auto-switch sidebar to detail if a node is clicked
  const handleStationClick = (id: string) => {
    setSelectedStation(id);
    setSidebarTab("detail");
  };

  return (
    <div className="flex flex-col h-full bg-[#020810] rounded-xl overflow-hidden" style={{ minHeight: "600px" }}>

      {/* ── Top Status Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2 bg-[#030a18] border-b border-[#1e3a5f]/60 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
            <span className="font-mono font-black text-xs tracking-widest" style={{ color: statusColor }}>
              {overallStatus}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 font-mono text-xs text-slate-500">
            <span className="text-cyan-400 font-bold">{formatElapsed(missionElapsed)}</span>
            <span>OPS SESSION</span>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 font-mono text-xs text-slate-500">
            <span>UTC:</span>
            <span className="text-slate-300">{utcTime?.slice(5, 25) || "SYNCING"}</span>
          </div>
          {isMockMode && (
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded">SANDBOX SIM</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center hidden sm:block">
            <p className="text-[10px] font-mono text-slate-500 uppercase">Health</p>
            <p className="text-lg font-black font-mono" style={{ color: healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444" }}>{healthScore}</p>
          </div>
          <div className="text-center hidden sm:block">
            <p className="text-[10px] font-mono text-slate-500 uppercase">Alerts</p>
            <p className={`text-lg font-black font-mono ${criticalCount > 0 ? "text-red-400 animate-pulse" : "text-green-400"}`}>{criticalCount}</p>
          </div>
          <div className="text-center hidden md:block">
            <p className="text-[10px] font-mono text-slate-500 uppercase">Constellation</p>
            <p className="text-lg font-black font-mono text-purple-400">{satellites.length} sats</p>
          </div>
        </div>
      </div>

      {/* ── Main Content Grid ────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden min-h-0">

        {/* Left: India Map + Stations + Satellite orbits ───────────────────── */}
        <div className="lg:col-span-7 relative overflow-hidden flex items-center justify-center bg-[#020810] p-4">
          {/* Grid lines background */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: "linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />

          <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ maxWidth: "100%", maxHeight: "100%", overflow: "visible" }}>
            <defs>
              <filter id="map-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="map-bg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </radialGradient>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 Z" fill="#06b6d4" opacity="0.6" />
              </marker>
            </defs>

            {/* India map fill */}
            <path d={INDIA_PATH} fill="url(#map-bg)" stroke="#1e3a5f" strokeWidth={1.5} opacity={0.8} />

            {/* Data flow link lines */}
            {LINKS.map(([from, to], li) => {
              const fp = STATION_POSITIONS[from]; const tp = STATION_POSITIONS[to];
              if (!fp || !tp) return null;
              const fx = toSVG(fp.x, SVG_W); const fy = toSVG(fp.y, SVG_H);
              const tx = toSVG(tp.x, SVG_W); const ty = toSVG(tp.y, SVG_H);
              const fd = telemetryData[from]; const td = telemetryData[to];
              const maxRisk = Math.max(fd?.analysis.failure_risk ?? 0, td?.analysis.failure_risk ?? 0);
              const linkColor = riskColor(maxRisk);
              return (
                <g key={`link-${li}`}>
                  <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={linkColor} strokeWidth={1} strokeDasharray="4 3" opacity={0.15} />
                  <line x1={fx} y1={fy} x2={tx} y2={ty} stroke={linkColor} strokeWidth={0.5} opacity={0.25} />
                  <DataPacket x1={fx} y1={fy} x2={tx} y2={ty} color={linkColor} delay={li * 0.7} duration={2.5 + li * 0.3} />
                  <DataPacket x1={tx} y1={ty} x2={fx} y2={fy} color={linkColor} delay={li * 0.5 + 1.2} duration={3 + li * 0.2} />
                </g>
              );
            })}

            {/* Satellite coverage footprint circles & downlink laser beams */}
            {satellites.map(sat => (
              <g key={`sat-g-${sat.id}`}>
                {/* Coverage Footprint Circle */}
                <circle cx={sat.x} cy={sat.y} r={sat.radius} fill="none" stroke={sat.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />
                <circle cx={sat.x} cy={sat.y} r={sat.radius} fill={sat.color} opacity={0.03} />

                {/* Downlink active links to visible ground stations */}
                {sat.visibleNodes.map(nodeId => {
                  const pos = STATION_POSITIONS[nodeId];
                  if (!pos) return null;
                  const stX = toSVG(pos.x, SVG_W);
                  const stY = toSVG(pos.y, SVG_H);
                  return (
                    <g key={`downlink-${sat.id}-${nodeId}`}>
                      {/* Laser connection beam */}
                      <line x1={sat.x} y1={sat.y} x2={stX} y2={stY} stroke={sat.color} strokeWidth={1.5} opacity={0.55} style={{ strokeDasharray: "5 4", strokeDashoffset: time * 10 }} />
                      <line x1={sat.x} y1={sat.y} x2={stX} y2={stY} stroke="#ffffff" strokeWidth={0.8} opacity={0.7} />
                    </g>
                  );
                })}

                {/* Orbit Path Trajectory Line */}
                {sat.id === "CARTOSAT-3" && (
                  <path d={`M ${toSVG(33, SVG_W)} ${toSVG(-20, SVG_H)} L ${toSVG(48, SVG_W)} ${toSVG(120, SVG_H)}`} fill="none" stroke={sat.color} strokeWidth={0.5} strokeDasharray="8 6" opacity={0.15} />
                )}
                {sat.id === "RISAT-2B" && (
                  <path d={`M ${toSVG(-20, SVG_W)} ${toSVG(78, SVG_H)} L ${toSVG(120, SVG_W)} ${toSVG(18, SVG_H)}`} fill="none" stroke={sat.color} strokeWidth={0.5} strokeDasharray="8 6" opacity={0.15} />
                )}

                {/* Satellite symbol node */}
                <circle cx={sat.x} cy={sat.y} r={7} fill="#0d1526" stroke={sat.color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 5px ${sat.color})` }} />
                <circle cx={sat.x} cy={sat.y} r={2.5} fill="#ffffff" />
                <text x={sat.x} y={sat.y - 10} textAnchor="middle" fill={sat.color} fontSize={7} fontWeight="bold" fontFamily="monospace">{sat.name}</text>
              </g>
            ))}

            {/* Station nodes */}
            {stations.map(st => (
              <StationNode
                key={st.id}
                id={st.id}
                x={toSVG(st.x, SVG_W)}
                y={toSVG(st.y, SVG_H)}
                label={st.label}
                shortLabel={st.shortLabel}
                risk={st.risk}
                isAnomaly={st.isAnomaly}
                isAlert={st.isAlert}
                selected={selectedStation === st.id}
                onClick={() => handleStationClick(st.id)}
              />
            ))}

            {/* Title overlay */}
            <text x={SVG_W / 2} y={15} textAnchor="middle" fill="#1e3a5f" fontSize={10} fontFamily="monospace" fontWeight="bold">
              ISRO GROUND CONSTELLATION CONTROL radar
            </text>
          </svg>
        </div>

        {/* Right Sidebar: Details / Space-Segment Consolation Deck ────────── */}
        <div className="lg:col-span-5 flex flex-col border-l border-[#1e3a5f]/40 overflow-y-auto">
          {/* Tab Selection */}
          <div className="grid grid-cols-2 border-b border-[#1e3a5f]/40 bg-[#060a16]">
            <button
              onClick={() => setSidebarTab("satellites")}
              className={`py-2 text-[10px] font-mono font-bold tracking-wider uppercase border-b-2 transition-colors ${
                sidebarTab === "satellites" ? "text-purple-300 border-purple-500 bg-[#0c1428]/40" : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
            >
              🛰️ Space Segment
            </button>
            <button
              onClick={() => setSidebarTab("detail")}
              className={`py-2 text-[10px] font-mono font-bold tracking-wider uppercase border-b-2 transition-colors ${
                sidebarTab === "detail" ? "text-cyan-300 border-cyan-500 bg-[#0c1428]/40" : "text-slate-500 border-transparent hover:text-slate-300"
              }`}
            >
              🛠️ Node Details
            </button>
          </div>

          {sidebarTab === "satellites" ? (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
              {/* Space Weather Section */}
              <div className="bg-[#0a1428]/80 border border-[#1e3a5f]/40 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-[#1e3a5f]/40">
                  <CloudSun className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] font-mono font-black text-purple-300 uppercase tracking-widest">Space Weather Dashboard</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                  <div className="bg-[#050c18] border border-[#1e3a5f]/20 rounded p-1.5">
                    <p className="text-slate-500 text-[9px] uppercase">Solar Wind</p>
                    <p className="text-white font-bold">342.1 km/s <span className="text-green-400 text-[8px]">Stable</span></p>
                  </div>
                  <div className="bg-[#050c18] border border-[#1e3a5f]/20 rounded p-1.5">
                    <p className="text-slate-500 text-[9px] uppercase">Magnetosphere</p>
                    <p className="text-white font-bold">Kp Index: 1 <span className="text-green-400 text-[8px]">Quiet</span></p>
                  </div>
                  <div className="bg-[#050c18] border border-[#1e3a5f]/20 rounded p-1.5">
                    <p className="text-slate-500 text-[9px] uppercase">Ionosphere F2</p>
                    <p className="text-white font-bold">9.2 MHz <span className="text-green-400 text-[8px]">Nominal</span></p>
                  </div>
                  <div className="bg-[#050c18] border border-[#1e3a5f]/20 rounded p-1.5">
                    <p className="text-slate-500 text-[9px] uppercase">Proton Flux</p>
                    <p className="text-white font-bold">0.14 pfu <span className="text-green-400 text-[8px]">Safe</span></p>
                  </div>
                </div>
              </div>

              {/* Satellites tracking list */}
              <div className="flex flex-col gap-2">
                <span className="text-[9.5px] font-mono font-black text-slate-500 uppercase tracking-widest">Active Satellite Constellation</span>
                {satellites.map(sat => (
                  <div key={sat.id} className="bg-[#0a1428]/80 border border-[#1e3a5f]/40 rounded-lg p-3 flex flex-col gap-2 transition-all hover:border-[#1e3a5f]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: sat.color }} />
                        <span className="text-xs font-mono font-black text-white">{sat.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 bg-[#1e3a5f]/40 px-2 py-0.5 rounded uppercase">{sat.type}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-300">
                      <div>
                        <span className="text-slate-500 uppercase text-[8.5px]">Altitude:</span> {sat.alt}
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase text-[8.5px]">Orbital Velocity:</span> {sat.speed}
                      </div>
                    </div>

                    <div className="border-t border-[#1e3a5f]/30 pt-1.5 flex flex-wrap gap-1 items-center">
                      <span className="text-[9px] font-mono text-slate-500 uppercase mr-1">Visible Stations:</span>
                      {sat.visibleNodes.length > 0 ? (
                        sat.visibleNodes.map(nodeId => (
                          <span key={nodeId} className="text-[9px] font-mono bg-green-500/10 border border-green-500/30 text-green-300 px-1.5 py-0.5 rounded font-bold">
                            {nodeId}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] font-mono text-slate-500 italic">No nodes in footprint</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Selected station detail */}
              {selected ? (
                <div className="p-4 border-b border-[#1e3a5f]/40 bg-[#060e1f] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">SELECTED STATION</p>
                      <p className="font-mono font-black text-sm text-white">{selected.id}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{selected.name}</p>
                    </div>
                    <button onClick={() => setSelectedStation(null)} className="text-slate-500 hover:text-white text-xs font-mono">✕ DESELECT</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 justify-items-center">
                    <RingGauge value={Math.round(selected.risk)} size={80} label="RISK" color={riskColor(selected.risk)} />
                    <RingGauge value={Math.round(selected.cpu)} size={80} label="CPU" color={selected.cpu > 70 ? "#ef4444" : selected.cpu > 50 ? "#f59e0b" : "#22c55e"} />
                    <RingGauge value={Math.min(100, Math.round(selected.latency / 2))} size={80} label="LATENCY" color={selected.latency > 80 ? "#ef4444" : selected.latency > 40 ? "#f59e0b" : "#22c55e"} />
                  </div>

                  <div className="bg-[#050c18] border border-[#1e3a5f]/40 rounded-lg p-2.5 flex flex-col gap-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-[#1e3a5f]/25">
                      <span className="text-slate-400 flex items-center gap-1"><CloudSun className="w-3.5 h-3.5" /> Station Weather:</span>
                      <span className="font-bold text-white uppercase text-[11px]">{selected.weather}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Signal Attenuation (Downlink):</span>
                      <span className={`font-bold ${selected.signalStrength >= 85 ? "text-green-400" : selected.signalStrength >= 65 ? "text-amber-400" : "text-red-400"}`}>
                        {selected.signalStrength}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    {[
                      { l: "Latency", v: `${selected.latency.toFixed(1)} ms`, bad: selected.latency > 80 },
                      { l: "Jitter", v: `${selected.jitter.toFixed(1)} ms`, bad: selected.jitter > 20 },
                      { l: "Pkt Loss", v: `${selected.packetLoss.toFixed(2)} %`, bad: selected.packetLoss > 2 },
                      { l: "Anomaly Flag", v: selected.isAnomaly ? "YES" : "NO", bad: selected.isAnomaly },
                    ].map(m => (
                      <div key={m.l} className="bg-[#0a1428] rounded border border-[#1e3a5f]/40 px-2 py-1.5">
                        <p className="text-[9px] text-slate-500 uppercase">{m.l}</p>
                        <p className={`font-bold ${m.bad ? "text-red-400" : "text-green-400"}`}>{m.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 border-b border-[#1e3a5f]/40 bg-[#060e1f] text-center">
                  <p className="text-[10px] text-slate-500 font-mono">Select a ground station node on the map to display metrics</p>
                </div>
              )}

              {/* All-stations risk overview */}
              <div className="p-4 flex-1">
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">All Station Risk Grid</p>
                <div className="grid grid-cols-3 gap-3 justify-items-center">
                  {stations.map(st => (
                    <button
                      key={st.id}
                      onClick={() => handleStationClick(st.id)}
                      className="flex flex-col items-center gap-1 hover:opacity-85 transition-opacity"
                    >
                      <RingGauge value={Math.round(st.risk)} size={68} label={st.shortLabel} color={riskColor(st.risk)} />
                      {st.isAlert && (
                        <span className="text-[8px] font-mono font-bold text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded animate-pulse">ALERT</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Key metrics KPIs */}
          <div className="px-3 pb-3 border-t border-[#1e3a5f]/40 pt-3 bg-[#030a18]">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-2">NETWORK KPIs</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Avg Latency", value: `${(Object.values(telemetryData).reduce((s, d) => s + d.telemetry.latency, 0) / (Object.values(telemetryData).length || 1)).toFixed(1)} ms` },
                { label: "Avg CPU", value: `${(Object.values(telemetryData).reduce((s, d) => s + d.telemetry.cpu, 0) / (Object.values(telemetryData).length || 1)).toFixed(1)} %` },
                { label: "Active Alerts", value: alerts.length.toString() },
                { label: "Daily Events", value: missionEvents.length.toString() },
              ].map(kpi => (
                <div key={kpi.label} className="bg-[#0a1428] rounded border border-[#1e3a5f]/40 px-2 py-1.5 font-mono">
                  <p className="text-[9px] text-slate-500 uppercase">{kpi.label}</p>
                  <p className="text-sm font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Event Ticker ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[#1e3a5f]/60 bg-[#030a18]">
        <EventTicker events={missionEvents} />
      </div>
    </div>
  );
};
