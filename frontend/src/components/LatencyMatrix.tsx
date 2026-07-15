import React, { useMemo } from 'react';
import type { RouterState } from '../types';
import { Activity, ShieldAlert, Check } from 'lucide-react';

interface LatencyMatrixProps {
  telemetryData: Record<string, RouterState>;
}

const STATIONS = [
  { id: 'NOC-DEL', name: 'DEL' },
  { id: 'NOC-MUM', name: 'MUM' },
  { id: 'MCF-HSN', name: 'HSN' },
  { id: 'ISTRAC-BGL', name: 'BGL' },
  { id: 'SDSC-SHAR', name: 'SHAR' },
  { id: 'TRACK-PBL', name: 'PBL' }
];

export const LatencyMatrix: React.FC<LatencyMatrixProps> = ({ telemetryData }) => {
  // Compute distance scale factors between sites to make latencies realistic
  const getDistanceFactor = (id1: string, id2: string): number => {
    if (id1 === id2) return 0;
    const distanceMap: Record<string, Record<string, number>> = {
      'NOC-DEL': { 'NOC-MUM': 1.2, 'MCF-HSN': 1.8, 'ISTRAC-BGL': 1.7, 'SDSC-SHAR': 1.6, 'TRACK-PBL': 2.8 },
      'NOC-MUM': { 'NOC-DEL': 1.2, 'MCF-HSN': 0.8, 'ISTRAC-BGL': 0.9, 'SDSC-SHAR': 1.1, 'TRACK-PBL': 2.5 },
      'MCF-HSN': { 'NOC-DEL': 1.8, 'NOC-MUM': 0.8, 'ISTRAC-BGL': 0.3, 'SDSC-SHAR': 0.6, 'TRACK-PBL': 2.2 },
      'ISTRAC-BGL': { 'NOC-DEL': 1.7, 'NOC-MUM': 0.9, 'MCF-HSN': 0.3, 'SDSC-SHAR': 0.5, 'TRACK-PBL': 2.1 },
      'SDSC-SHAR': { 'NOC-DEL': 1.6, 'NOC-MUM': 1.1, 'MCF-HSN': 0.6, 'ISTRAC-BGL': 0.5, 'TRACK-PBL': 1.9 },
      'TRACK-PBL': { 'NOC-DEL': 2.8, 'NOC-MUM': 2.5, 'MCF-HSN': 2.2, 'ISTRAC-BGL': 2.1, 'SDSC-SHAR': 1.9 }
    };
    return distanceMap[id1]?.[id2] || 1.5;
  };

  // Generate inter-site matrix data dynamically based on active telemetry states
  const matrix = useMemo(() => {
    const data: Record<string, Record<string, { latency: number; loss: number; active: boolean }>> = {};

    STATIONS.forEach(s1 => {
      data[s1.id] = {};
      STATIONS.forEach(s2 => {
        if (s1.id === s2.id) {
          data[s1.id][s2.id] = { latency: 0, loss: 0, active: true };
          return;
        }

        const state1 = telemetryData[s1.id];
        const state2 = telemetryData[s2.id];
        
        const isS1Down = state1?.telemetry?.link_status === 0;
        const isS2Down = state2?.telemetry?.link_status === 0;

        if (isS1Down || isS2Down) {
          data[s1.id][s2.id] = { latency: -1, loss: 100, active: false };
          return;
        }

        const lat1 = state1?.telemetry?.latency || 15;
        const lat2 = state2?.telemetry?.latency || 15;
        const loss1 = state1?.telemetry?.packet_loss || 0;
        const loss2 = state2?.telemetry?.packet_loss || 0;

        const distance = getDistanceFactor(s1.id, s2.id);
        const compositeLatency = Math.round((lat1 + lat2) * 0.45 * distance);
        const compositeLoss = parseFloat(((loss1 + loss2) * 0.5).toFixed(2));

        data[s1.id][s2.id] = {
          latency: Math.max(5, compositeLatency),
          loss: compositeLoss,
          active: true
        };
      });
    });

    return data;
  }, [telemetryData]);

  // Color mapping based on latency values
  const getCellColor = (latency: number, active: boolean) => {
    if (!active || latency < 0) return 'rgba(244, 63, 94, 0.15) border border-red-500/40 text-red-400';
    if (latency === 0) return 'bg-slate-950/40 text-slate-600 border border-slate-900';
    if (latency < 45) return 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/25';
    if (latency < 90) return 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/25';
    return 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/25';
  };

  return (
    <div className="glass-panel border border-noc-border rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-noc-border/20 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-noc-primary animate-pulse" />
          <h3 className="text-xs font-mono font-bold text-noc-primary uppercase tracking-widest">
            MPLS Core Connectivity Matrix (Heatmap)
          </h3>
        </div>
        <span className="text-[9px] text-slate-500 font-mono">Dynamic Grid Metrics</span>
      </div>

      {/* Grid container */}
      <div className="flex flex-col gap-2 overflow-x-auto select-none">
        <div className="min-w-[380px] flex flex-col gap-1">
          {/* Column Header */}
          <div className="grid grid-cols-7 text-center text-[9px] font-mono font-black text-noc-muted">
            <div></div> {/* spacer */}
            {STATIONS.map(s => (
              <div key={s.id} className="pb-1 uppercase tracking-wider">{s.name}</div>
            ))}
          </div>

          {/* Rows */}
          {STATIONS.map(s1 => (
            <div key={s1.id} className="grid grid-cols-7 items-center text-center">
              {/* Row Header */}
              <div className="text-[10px] font-mono font-black text-noc-text text-left pl-1 uppercase tracking-wide">
                {s1.name}
              </div>

              {/* Data Cells */}
              {STATIONS.map(s2 => {
                const info = matrix[s1.id]?.[s2.id] || { latency: 0, loss: 0, active: true };
                const isDiagonal = s1.id === s2.id;
                
                return (
                  <div
                    key={s2.id}
                    className={`m-[2px] py-2.5 rounded font-mono text-[10px] transition-all duration-200 cursor-help flex flex-col items-center justify-center ${
                      isDiagonal 
                        ? 'bg-slate-900/30 text-slate-600 border border-slate-800/40' 
                        : getCellColor(info.latency, info.active)
                    }`}
                    title={
                      isDiagonal 
                        ? `${s1.id} Loopback` 
                        : !info.active 
                          ? `Outage: Link down between ${s1.id} and ${s2.id}` 
                          : `${s1.id} ↔ ${s2.id}\nLatency: ${info.latency} ms\nPacket Loss: ${info.loss}%`
                    }
                  >
                    {isDiagonal ? (
                      <Check className="w-3 h-3 text-slate-700" />
                    ) : info.latency < 0 ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                    ) : (
                      <>
                        <span className="font-bold">{info.latency}</span>
                        <span className="text-[7px] opacity-60 font-normal">{info.loss}%</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend footer */}
      <div className="flex justify-between items-center text-[8px] font-mono text-slate-500 border-t border-noc-border/10 pt-2">
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500/20 border border-emerald-500/40" /> &lt;45ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500/20 border border-amber-500/40" /> 45-90ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-rose-500/20 border border-rose-500/40" /> &gt;90ms
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-red-500/10 border border-red-500/40" /> Outage
          </span>
        </div>
        <span>Hover for route details</span>
      </div>
    </div>
  );
};
