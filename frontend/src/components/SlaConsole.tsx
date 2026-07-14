import React, { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ShieldCheck, AlertOctagon, Timer, BarChart2 } from "lucide-react";
import type { RouterState } from "../types";

interface SlaConsoleProps {
  telemetryData: Record<string, RouterState>;
  resolvedTimes: number[];
}

export const SlaConsole: React.FC<SlaConsoleProps> = ({
  telemetryData,
  resolvedTimes
}) => {
  // Generate historical incident recovery data based on resolvedTimes
  const chartData = useMemo(() => {
    if (resolvedTimes.length === 0) {
      // Default placeholder data if no incidents have resolved yet to make the chart look populated
      return [
        { id: "INC-8902", duration: 14, status: "SUCCESS" },
        { id: "INC-8903", duration: 18, status: "SUCCESS" },
        { id: "INC-8904", duration: 9, status: "SUCCESS" },
        { id: "INC-8905", duration: 11, status: "SUCCESS" }
      ];
    }
    return resolvedTimes.map((t, idx) => ({
      id: `INC-${8906 + idx}`,
      duration: Math.round(t),
      status: "SUCCESS"
    }));
  }, [resolvedTimes]);

  // Compute live SLA statistics per node
  const nodeSlas = useMemo(() => {
    return Object.entries(telemetryData).map(([id, state]) => {
      const isDown = state.telemetry.link_status === 0;
      const isCongested = state.telemetry.latency > 150 || state.telemetry.packet_loss > 2.0;

      // Base target SLA
      const targetSla = id === "ISTRAC-BGL" || id === "SDSC-SHAR" ? 99.99 : 99.95;
      
      // Calculate current mock SLA based on health state
      let currentSla = targetSla;
      if (isDown) {
        currentSla = parseFloat((targetSla - 0.12).toFixed(3));
      } else if (isCongested) {
        currentSla = parseFloat((targetSla - 0.04).toFixed(3));
      }

      return {
        id,
        name: state.telemetry.router_name,
        targetSla,
        currentSla,
        latency: state.telemetry.latency,
        packetLoss: state.telemetry.packet_loss,
        status: isDown ? "OUTAGE" : isCongested ? "DEGRADED" : "COMPLIANT"
      };
    });
  }, [telemetryData]);

  // Overall compliance indicators
  const stats = useMemo(() => {
    const totalNodes = nodeSlas.length;
    const compliantNodes = nodeSlas.filter(n => n.status === "COMPLIANT").length;
    const ratio = totalNodes > 0 ? (compliantNodes / totalNodes) * 100 : 100;
    
    const avgRecovery = resolvedTimes.length > 0
      ? Math.round(resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length)
      : 13; // default composite metric

    return {
      complianceScore: Math.round(ratio),
      avgRecovery,
      activeViolations: nodeSlas.filter(n => n.status !== "COMPLIANT").length
    };
  }, [nodeSlas, resolvedTimes]);

  return (
    <div className="bg-[#0a1428] border border-[#1e3a5f]/60 rounded-xl p-4 flex flex-col gap-4 glass-panel">
      {/* Header Title */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e3a5f]/40">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-widest">
            Phase 5 SLA & MTTR Compliance Console
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">ISRO QoS Compliance Engine</span>
      </div>

      {/* SLA Gauges & Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#030611] border border-[#1e3a5f]/30 rounded p-2 flex flex-col items-center justify-center text-center">
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Overall SLA Compliance</span>
          <span className={`text-sm font-mono font-bold mt-1 ${stats.complianceScore >= 90 ? "text-green-400" : "text-amber-400"}`}>
            {stats.complianceScore}%
          </span>
        </div>

        <div className="bg-[#030611] border border-[#1e3a5f]/30 rounded p-2 flex flex-col items-center justify-center text-center">
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Mean Recovery Time (MTTR)</span>
          <span className="text-sm font-mono font-bold text-cyan-400 mt-1 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {stats.avgRecovery}s
          </span>
        </div>

        <div className="bg-[#030611] border border-[#1e3a5f]/30 rounded p-2 flex flex-col items-center justify-center text-center">
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Active SLA Violations</span>
          <span className={`text-sm font-mono font-bold mt-1 ${stats.activeViolations > 0 ? "text-red-400 animate-pulse" : "text-slate-500"}`}>
            {stats.activeViolations}
          </span>
        </div>
      </div>

      {/* Grid of SLA States per Station */}
      <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
        {nodeSlas.map((n) => (
          <div key={n.id} className="bg-[#040816] border border-[#1e3a5f]/20 rounded px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono">
            <div className="flex flex-col">
              <span className="font-bold text-white">{n.name}</span>
              <span className="text-[8px] text-slate-500 uppercase">Target: {n.targetSla}%</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="block text-[8px] text-slate-500 uppercase">Current SLA</span>
                <span className={`font-bold ${n.status === "OUTAGE" ? "text-red-400" : n.status === "DEGRADED" ? "text-amber-400" : "text-green-400"}`}>
                  {n.currentSla}%
                </span>
              </div>

              <div className={`p-1 rounded ${n.status === "OUTAGE" ? "bg-red-500/10 text-red-400" : n.status === "DEGRADED" ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>
                {n.status === "COMPLIANT" ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <AlertOctagon className="w-3.5 h-3.5" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recovery Speeds Bar Chart */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">
          Telemetry Incident Resolution Recovery Speeds (MTTR)
        </span>
        <div className="h-[120px] bg-[#030611] rounded border border-[#1e3a5f]/20 p-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" strokeOpacity={0.2} />
              <XAxis dataKey="id" tick={{ fill: "#4b6a8a", fontSize: 8, fontFamily: "monospace" }} />
              <YAxis unit="s" tick={{ fill: "#4b6a8a", fontSize: 8, fontFamily: "monospace" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#1e3a5f" }}
                itemStyle={{ fontSize: 9, color: "#fff", fontFamily: "monospace" }}
                labelStyle={{ fontSize: 9, color: "#22d3ee", fontFamily: "monospace" }}
              />
              <Bar dataKey="duration" fill="#22d3ee" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
