import React, { useMemo } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  ZAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { ShieldAlert } from "lucide-react";
import type { EnrichedHistoryPoint } from "../types";

interface AnomalyScatterPlotProps {
  telemetryData: Record<string, { telemetry: { router_id: string; router_name: string; latency: number; cpu: number }; analysis: { failure_risk: number; is_anomaly: boolean } }>;
  routerHistory: Record<string, EnrichedHistoryPoint[]>;
}

interface ScatterPoint {
  x: number; // Latency (ms)
  y: number; // CPU (%)
  z: number; // Failure Risk (%)
  name: string;
  isAnomaly: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload as ScatterPoint;
  return (
    <div className="bg-[#0b0f19] border border-[#1e3a5f] p-3 rounded font-mono text-xs shadow-2xl flex flex-col gap-1">
      <p className="text-cyan-400 font-bold border-b border-[#1e3a5f]/40 pb-1">{pt.name}</p>
      <p className="text-slate-300">Latency: <span className="text-white font-bold">{pt.x} ms</span></p>
      <p className="text-slate-300">CPU Usage: <span className="text-white font-bold">{pt.y}%</span></p>
      <p className="text-slate-300">Failure Risk: <span className="text-white font-bold">{pt.z}%</span></p>
      <p className={`text-[10px] font-bold ${pt.isAnomaly ? "text-red-400" : "text-green-400"}`}>
        {pt.isAnomaly ? "⚠️ OUTLIER DETECTED" : "✅ NOMINAL NODE"}
      </p>
    </div>
  );
};

export const AnomalyScatterPlot: React.FC<AnomalyScatterPlotProps> = ({
  telemetryData,
  routerHistory
}) => {
  // Aggregate all history data points plus current points
  const points = useMemo<ScatterPoint[]>(() => {
    const data: ScatterPoint[] = [];

    // Add current live states
    Object.entries(telemetryData).forEach(([rid, node]) => {
      data.push({
        x: node.telemetry.latency,
        y: node.telemetry.cpu,
        z: node.analysis.failure_risk,
        name: `${rid} (LIVE)`,
        isAnomaly: node.analysis.is_anomaly || node.analysis.failure_risk >= 75
      });
    });

    // Add recent historical states to make the plot dense and beautiful
    Object.entries(routerHistory).forEach(([rid, history]) => {
      // Take last 10 historical points per router
      history.slice(-10).forEach((point) => {
        data.push({
          x: point.latency,
          y: point.cpu,
          z: point.failure_risk,
          name: rid,
          isAnomaly: point.is_anomaly || point.failure_risk >= 75
        });
      });
    });

    return data;
  }, [telemetryData, routerHistory]);

  const normalPoints = useMemo(() => points.filter(p => !p.isAnomaly), [points]);
  const anomalyPoints = useMemo(() => points.filter(p => p.isAnomaly), [points]);

  return (
    <div className="bg-[#0a1428] border border-[#1e3a5f]/60 rounded-xl p-4 flex flex-col gap-3 glass-panel">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e3a5f]/40">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-widest">
            Phase 3 Unsupervised Anomaly Boundary
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Isolation Forest Decision Boundary</span>
      </div>

      <p className="text-[10.5px] font-mono text-slate-400 leading-relaxed">
        Visualizes telemetry states across Latency (ms) vs. CPU Usage (%). The Isolation Forest algorithm flags points in the shaded outer boundaries as anomalies.
      </p>

      {/* Recharts Scatter Plot */}
      <div className="h-[260px] relative">
        {/* Shaded Anomaly Boundary Background Simulation */}
        <div className="absolute right-0 top-0 bottom-[35px] left-[45px] bg-gradient-to-tr from-transparent via-red-950/5 to-red-950/20 border-l border-t border-red-500/10 rounded pointer-events-none flex items-center justify-end pr-8 select-none">
          <span className="text-[9px] font-mono text-red-500/30 font-bold uppercase tracking-widest rotate-90">
            Outlier Boundary
          </span>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" strokeOpacity={0.25} />
            <XAxis
              type="number"
              dataKey="x"
              name="Latency"
              unit="ms"
              domain={[0, 300]}
              tick={{ fill: "#4b6a8a", fontSize: 9, fontFamily: "monospace" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="CPU"
              unit="%"
              domain={[0, 100]}
              tick={{ fill: "#4b6a8a", fontSize: 9, fontFamily: "monospace" }}
            />
            <ZAxis type="number" dataKey="z" range={[20, 200]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }} />
            
            {/* Nominal Points Series */}
            <Scatter
              name="Nominal Telemetry"
              data={normalPoints}
              fill="#22c55e"
              shape="circle"
              className="transition-all duration-300"
            />
            
            {/* Anomaly Points Series */}
            <Scatter
              name="Outlier Anomalies"
              data={anomalyPoints}
              fill="#ef4444"
              shape="triangle"
              className="animate-pulse"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="bg-[#030611] rounded border border-[#1e3a5f]/30 p-2 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase">In Forest Bounds</span>
          <span className="text-xs font-mono font-bold text-green-400">
            {normalPoints.length} Points
          </span>
        </div>
        <div className="bg-[#030611] rounded border border-[#1e3a5f]/30 p-2 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase">Flagged Outliers</span>
          <span className={`text-xs font-mono font-bold ${anomalyPoints.length > 0 ? "text-red-400 animate-pulse" : "text-slate-500"}`}>
            {anomalyPoints.length} Points
          </span>
        </div>
      </div>
    </div>
  );
};
