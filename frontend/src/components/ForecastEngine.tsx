import React, { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip,
} from "recharts";
import { TrendingUp, AlertTriangle, Clock, CheckCircle2, Zap } from "lucide-react";
import type { EnrichedHistoryPoint } from "../types";

interface RouterForecast {
  routerId: string; displayName: string; currentRisk: number;
  forecastedRisk30m: number; etaMinutes: number | null;
  trendSlope: number; confidence: number; chartData: ChartPoint[];
}
interface ChartPoint {
  t: string; history?: number; forecast?: number; upper?: number; lower?: number;
}

function expSmooth(values: number[], alpha = 0.25): number[] {
  const out: number[] = []; let s = values[0];
  for (const v of values) { s = alpha * v + (1 - alpha) * s; out.push(s); }
  return out;
}

function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 50 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  ys.forEach((y, x) => { sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; });
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  return { slope, intercept: (sumY - slope * sumX) / n };
}

function buildForecast(routerId: string, displayName: string, history: EnrichedHistoryPoint[]): RouterForecast {
  const risks = history.slice(-20).map(p => p.failure_risk);
  if (risks.length < 5) {
    const cr = risks[risks.length - 1] ?? 15;
    return { routerId, displayName, currentRisk: cr, forecastedRisk30m: cr, etaMinutes: null, trendSlope: 0, confidence: 0, chartData: [] };
  }
  const smoothed = expSmooth(risks);
  const { slope, intercept } = linearRegression(smoothed);
  const lastIdx = smoothed.length - 1;
  const currentRisk = Math.min(100, Math.max(0, intercept + slope * lastIdx));
  const forecastedRisk30m = Math.min(100, Math.max(0, currentRisk + slope * 15));
  const variance = risks.reduce((acc, r) => acc + Math.pow(r - currentRisk, 2), 0) / risks.length;
  const confidence = Math.min(95, Math.max(10, 100 - Math.sqrt(variance)));
  let etaMinutes: number | null = null;
  if (slope > 0.5 && currentRisk >= 40) {
    const secs = ((90 - currentRisk) / slope) * 120;
    if (secs > 0 && secs < 3600) etaMinutes = Math.round(secs / 60);
  }
  const chartData: ChartPoint[] = [];
  const hd = risks.slice(-10);
  hd.forEach((r, i) => { const m = -(hd.length - 1 - i) * 2; chartData.push({ t: m === 0 ? "NOW" : `${m}m`, history: Math.round(r) }); });
  for (let s2 = 1; s2 <= 15; s2++) {
    const proj = Math.min(100, Math.max(0, currentRisk + slope * s2));
    const sp = Math.sqrt(variance) * (s2 / 5);
    chartData.push({ t: `+${s2 * 2}m`, forecast: Math.round(proj), upper: Math.min(100, Math.round(proj + sp)), lower: Math.max(0, Math.round(proj - sp)) });
  }
  return { routerId, displayName, currentRisk: Math.round(currentRisk), forecastedRisk30m: Math.round(forecastedRisk30m), etaMinutes, trendSlope: slope, confidence: Math.round(confidence), chartData };
}

const riskColor = (r: number) => r >= 80 ? "#ef4444" : r >= 60 ? "#f59e0b" : r >= 40 ? "#06b6d4" : "#22c55e";
const riskLabel = (r: number) => r >= 80 ? "CRITICAL" : r >= 60 ? "ELEVATED" : r >= 40 ? "WATCH" : "NOMINAL";
const riskBadge = (r: number) => r >= 80 ? "bg-red-500/20 text-red-400 border-red-500/40" : r >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : r >= 40 ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" : "bg-green-500/20 text-green-400 border-green-500/40";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: { value?: number }) => x.value !== undefined);
  if (!p) return null;
  return (<div className="bg-[#0d1526] border border-[#1e3a5f] rounded px-3 py-2 text-xs font-mono shadow-xl"><p className="text-cyan-400 font-bold mb-1">{label}</p><p className="text-white">{(label as string).startsWith("+") ? "FORECAST" : "ACTUAL"}: <b>{p.value}%</b></p></div>);
};

const ForecastCard: React.FC<{ fc: RouterForecast; isTop?: boolean }> = ({ fc, isTop }) => {
  const col = riskColor(fc.forecastedRisk30m); const hcol = riskColor(fc.currentRisk);
  return (
    <div className={`rounded-lg border bg-[#0a1428] p-4 flex flex-col gap-3 transition-all ${isTop ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : "border-[#1e3a5f]/60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {fc.etaMinutes !== null && <Zap className="w-3.5 h-3.5 text-red-400 animate-pulse" />}
            <span className="font-mono font-bold text-sm text-white">{fc.routerId}</span>
            <span className="text-[10px] text-slate-400">{fc.displayName}</span>
          </div>
          {fc.etaMinutes !== null
            ? <div className="mt-1 flex items-center gap-1.5 text-red-400"><Clock className="w-3 h-3" /><span className="text-xs font-mono font-bold">FAULT ETA: ~{fc.etaMinutes}min</span></div>
            : <div className="mt-1 text-[10px] text-slate-500 font-mono">{fc.trendSlope < -0.5 ? "RECOVERING" : fc.trendSlope > 0.5 ? "DEGRADING" : "STABLE"}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${riskBadge(fc.currentRisk)}`}>NOW: {fc.currentRisk}%</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${riskBadge(fc.forecastedRisk30m)}`}>+30m: {fc.forecastedRisk30m}% {riskLabel(fc.forecastedRisk30m)}</span>
        </div>
      </div>
      {fc.chartData.length > 0 ? (
        <div className="h-[90px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fc.chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={`hg-${fc.routerId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={hcol} stopOpacity={0.3} /><stop offset="95%" stopColor={hcol} stopOpacity={0.02} /></linearGradient>
                <linearGradient id={`fg-${fc.routerId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={col} stopOpacity={0.4} /><stop offset="95%" stopColor={col} stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" strokeOpacity={0.4} />
              <XAxis dataKey="t" tick={{ fill: "#4b6a8a", fontSize: 8, fontFamily: "monospace" }} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fill: "#4b6a8a", fontSize: 8, fontFamily: "monospace" }} />
              <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.6} />
              <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.4} />
              <ReferenceLine x="NOW" stroke="#06b6d4" strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.7} />
              <Tooltip content={<FTip />} />
              <Area dataKey="upper" stroke="none" fill={col} fillOpacity={0.08} legendType="none" />
              <Area dataKey="lower" stroke="none" fill="#0a1428" fillOpacity={1} legendType="none" />
              <Area dataKey="history" type="monotone" stroke={hcol} strokeWidth={2} fill={`url(#hg-${fc.routerId})`} dot={false} activeDot={{ r: 3 }} />
              <Area dataKey="forecast" type="monotone" stroke={col} strokeWidth={2} strokeDasharray="5 3" fill={`url(#fg-${fc.routerId})`} dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="h-[60px] flex items-center justify-center text-xs text-slate-500 font-mono">AWAITING HISTORY DATA</div>}
      {fc.confidence > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500 font-mono uppercase">Confidence</span>
          <div className="flex-1 h-1 bg-[#1e3a5f] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${fc.confidence}%`, background: col }} /></div>
          <span className="text-[9px] text-slate-400 font-mono">{fc.confidence}%</span>
        </div>
      )}
    </div>
  );
};

interface ForecastEngineProps {
  routerHistory: Record<string, EnrichedHistoryPoint[]>;
  routerNames: Record<string, string>;
}

export const ForecastEngine: React.FC<ForecastEngineProps> = ({ routerHistory, routerNames }) => {
  const forecasts = useMemo<RouterForecast[]>(() =>
    Object.entries(routerHistory)
      .map(([rid, hist]) => buildForecast(rid, routerNames[rid] ?? rid, hist))
      .sort((a, b) => b.forecastedRisk30m - a.forecastedRisk30m),
    [routerHistory, routerNames]
  );
  const critCount = forecasts.filter(f => f.forecastedRisk30m >= 80).length;
  const watchCount = forecasts.filter(f => f.forecastedRisk30m >= 60 && f.forecastedRisk30m < 80).length;
  const etaNodes = forecasts.filter(f => f.etaMinutes !== null);
  if (forecasts.length === 0) return <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">FORECAST ENGINE: AWAITING TELEMETRY DATA</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Nodes Monitored", val: forecasts.length, sub: "All ground stations", col: "text-white", border: "border-[#1e3a5f]/60" },
          { label: "Critical @+30m", val: critCount, sub: "Risk >= 80%", col: critCount > 0 ? "text-red-400" : "text-green-400", border: critCount > 0 ? "border-red-500/50" : "border-[#1e3a5f]/60" },
          { label: "Watch @+30m", val: watchCount, sub: "Risk 60-79%", col: watchCount > 0 ? "text-amber-400" : "text-green-400", border: watchCount > 0 ? "border-amber-500/40" : "border-[#1e3a5f]/60" },
          { label: "Fault ETAs", val: etaNodes.length, sub: "Nodes nearing failure", col: etaNodes.length > 0 ? "text-red-400" : "text-green-400", border: etaNodes.length > 0 ? "border-red-500/50" : "border-[#1e3a5f]/60" },
        ].map(c => (
          <div key={c.label} className={`bg-[#0a1428] border ${c.border} rounded-lg p-3 flex flex-col gap-1`}>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{c.label}</span>
            <span className={`text-2xl font-black font-mono ${c.col} ${c.label === "Fault ETAs" && etaNodes.length > 0 ? "animate-pulse" : ""}`}>{c.val}</span>
            <span className="text-[10px] text-slate-400">{c.sub}</span>
          </div>
        ))}
      </div>
      {etaNodes.length > 0 ? (
        <div className="bg-red-950/30 border border-red-500/40 rounded-lg px-4 py-3 flex flex-wrap gap-3 items-center">
          <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
          <span className="text-xs font-mono text-red-300 font-bold">IMMINENT FAULT PREDICTION:</span>
          {etaNodes.map(f => (<span key={f.routerId} className="flex items-center gap-1 bg-red-500/20 border border-red-500/40 rounded px-2 py-0.5 text-[11px] font-mono text-red-300"><Clock className="w-3 h-3" />{f.routerId} — ~{f.etaMinutes}min</span>))}
        </div>
      ) : (
        <div className="bg-green-950/20 border border-green-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-xs font-mono text-green-300">ALL NODES FORECAST STABLE FOR NEXT 30 MINUTES</span>
        </div>
      )}
      <div className="bg-[#060e1f] border border-[#1e3a5f]/60 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1e3a5f]/60 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono text-cyan-300 font-bold uppercase tracking-wider">30-Minute Risk Forecast Ranking</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead><tr className="border-b border-[#1e3a5f]/40 text-[10px] text-slate-500 uppercase">
              <th className="text-left px-4 py-2">#</th><th className="text-left px-4 py-2">Node</th>
              <th className="text-right px-4 py-2">Current</th><th className="text-right px-4 py-2">+30m Forecast</th>
              <th className="text-right px-4 py-2">Trend</th><th className="text-right px-4 py-2">ETA Fault</th>
              <th className="text-right px-4 py-2">Confidence</th>
            </tr></thead>
            <tbody>
              {forecasts.map((fc, i) => (
                <tr key={fc.routerId} className="border-b border-[#1e3a5f]/20 hover:bg-[#0d1526] transition-colors">
                  <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2"><div className="flex items-center gap-2">{fc.etaMinutes !== null && <Zap className="w-3 h-3 text-red-400" />}<span className="text-white font-bold">{fc.routerId}</span><span className="text-slate-500 text-[10px]">{fc.displayName}</span></div></td>
                  <td className="px-4 py-2 text-right"><span style={{ color: riskColor(fc.currentRisk) }}>{fc.currentRisk}%</span></td>
                  <td className="px-4 py-2 text-right"><span className={`px-2 py-0.5 rounded border text-[10px] ${riskBadge(fc.forecastedRisk30m)}`}>{fc.forecastedRisk30m}% {riskLabel(fc.forecastedRisk30m)}</span></td>
                  <td className="px-4 py-2 text-right"><span className={fc.trendSlope > 0.5 ? "text-red-400" : fc.trendSlope < -0.5 ? "text-green-400" : "text-slate-400"}>{fc.trendSlope > 0.5 ? `DEGRADING` : fc.trendSlope < -0.5 ? "RECOVERING" : "STABLE"}</span></td>
                  <td className="px-4 py-2 text-right">{fc.etaMinutes !== null ? <span className="text-red-400 font-bold">~{fc.etaMinutes}min</span> : <span className="text-slate-500">—</span>}</td>
                  <td className="px-4 py-2 text-right"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-[#1e3a5f] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${fc.confidence}%`, background: riskColor(fc.forecastedRisk30m) }} /></div><span className="text-slate-400">{fc.confidence}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {forecasts.map((fc, i) => <ForecastCard key={fc.routerId} fc={fc} isTop={i === 0 && fc.forecastedRisk30m >= 70} />)}
      </div>
    </div>
  );
};
