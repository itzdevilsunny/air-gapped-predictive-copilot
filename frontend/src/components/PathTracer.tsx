import React, { useState, useMemo } from "react";
import { ArrowRight, Route, ShieldAlert } from "lucide-react";
import type { RouterState } from "../types";

// Topology adjacency links list
const NEIGHBORS: Record<string, string[]> = {
  "NOC-DEL": ["NOC-MUM", "SDSC-SHAR"],
  "NOC-MUM": ["NOC-DEL", "MCF-HSN"],
  "MCF-HSN": ["NOC-MUM", "ISTRAC-BGL"],
  "ISTRAC-BGL": ["MCF-HSN", "SDSC-SHAR", "TRACK-PBL"],
  "SDSC-SHAR": ["NOC-DEL", "ISTRAC-BGL", "TRACK-PBL"],
  "TRACK-PBL": ["SDSC-SHAR", "ISTRAC-BGL"]
};

interface PathTracerProps {
  telemetryData: Record<string, RouterState>;
}

export const PathTracer: React.FC<PathTracerProps> = ({ telemetryData }) => {
  const [source, setSource] = useState<string>("NOC-DEL");
  const [destination, setDestination] = useState<string>("TRACK-PBL");

  const stations = useMemo(() => Object.keys(telemetryData), [telemetryData]);

  // Find shortest path based on current router states (BFS ignoring down/highly risk routers if possible)
  const pathDetails = useMemo(() => {
    const queue: string[][] = [[source]];
    const visited = new Set<string>([source]);
    let shortestPath: string[] | null = null;

    // Standard BFS to find shortest hop path
    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const lastNode = currentPath[currentPath.length - 1];

      if (lastNode === destination) {
        shortestPath = currentPath;
        break;
      }

      const neighbors = NEIGHBORS[lastNode] || [];
      for (const neighbor of neighbors) {
        const isNeighborDown = telemetryData[neighbor]?.telemetry.link_status === 0;
        const isNeighborHighRisk = telemetryData[neighbor]?.analysis.failure_risk >= 90;

        // Skip down neighbors to simulate dynamic BGP failover/rerouting
        if (!visited.has(neighbor) && !isNeighborDown && !isNeighborHighRisk) {
          visited.add(neighbor);
          queue.push([...currentPath, neighbor]);
        }
      }
    }

    // Fallback BFS (if all paths are congested/blocked, try to find ANY route even if risky)
    if (!shortestPath) {
      const fallbackQueue: string[][] = [[source]];
      const fallbackVisited = new Set<string>([source]);

      while (fallbackQueue.length > 0) {
        const currentPath = fallbackQueue.shift()!;
        const lastNode = currentPath[currentPath.length - 1];

        if (lastNode === destination) {
          shortestPath = currentPath;
          break;
        }

        const neighbors = NEIGHBORS[lastNode] || [];
        for (const neighbor of neighbors) {
          const isNeighborDown = telemetryData[neighbor]?.telemetry.link_status === 0;
          if (!fallbackVisited.has(neighbor) && !isNeighborDown) {
            fallbackVisited.add(neighbor);
            fallbackQueue.push([...currentPath, neighbor]);
          }
        }
      }
    }

    // Calculate details
    if (!shortestPath) {
      return { path: null, totalLatency: 0, hops: 0, status: "DISCONNECTED" };
    }

    let totalLatency = 0;
    shortestPath.forEach(node => {
      totalLatency += telemetryData[node]?.telemetry.latency || 0;
    });

    // Check if any node in path is warning/degraded
    const hasElevatedRisk = shortestPath.some(
      node => (telemetryData[node]?.analysis.failure_risk ?? 0) >= 60
    );

    return {
      path: shortestPath,
      totalLatency,
      hops: shortestPath.length - 1,
      status: hasElevatedRisk ? "DEGRADED" : "NOMINAL"
    };
  }, [source, destination, telemetryData]);

  return (
    <div className="bg-[#0a1428] border border-[#1e3a5f]/60 rounded-xl p-4 flex flex-col gap-4 glass-panel">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1e3a5f]/40">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-widest">
            BGP Dynamic Routing Path Tracer
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Live Packet Hopping Simulator</span>
      </div>

      <p className="text-[10.5px] font-mono text-slate-400 leading-relaxed">
        Select a source and destination ground station to trace active BGP routing. If a middle-hop node goes down, the pathfinder dynamically reroutes traffic to clear paths.
      </p>

      {/* Control Selectors */}
      <div className="grid grid-cols-2 gap-3 bg-[#030611] p-3 rounded border border-[#1e3a5f]/30">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Source Node</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-[#060a16] border border-[#1e3a5f]/60 rounded px-2 py-1 font-mono text-[11px] text-white focus:outline-none focus:border-cyan-500"
          >
            {stations.map(s => (
              <option key={s} value={s} disabled={s === destination}>
                {s} ({telemetryData[s]?.telemetry.router_name})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Destination Node</label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="bg-[#060a16] border border-[#1e3a5f]/60 rounded px-2 py-1 font-mono text-[11px] text-white focus:outline-none focus:border-cyan-500"
          >
            {stations.map(s => (
              <option key={s} value={s} disabled={s === source}>
                {s} ({telemetryData[s]?.telemetry.router_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Path Display */}
      <div className="bg-[#02050d] border border-[#1e3a5f]/40 rounded-lg p-4 flex flex-col gap-3 min-h-[100px] justify-center">
        {pathDetails.path ? (
          <div className="flex flex-col gap-3">
            {/* Visual Hop Chain */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] justify-center">
              {pathDetails.path.map((node, index) => {
                const isDown = telemetryData[node]?.telemetry.link_status === 0;
                const risk = telemetryData[node]?.analysis.failure_risk ?? 0;
                const nodeCol = isDown
                  ? "bg-red-500/20 border-red-500/50 text-red-400"
                  : risk >= 75
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "bg-green-500/10 border-green-500/40 text-green-400";

                return (
                  <React.Fragment key={node}>
                    {index > 0 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
                    )}
                    <div className={`px-2.5 py-1 rounded border flex flex-col items-center gap-0.5 ${nodeCol}`}>
                      <span className="font-bold">{node}</span>
                      <span className="text-[8px] opacity-70">
                        {isDown ? "DOWN" : `${telemetryData[node]?.telemetry.latency}ms`}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Path Stats */}
            <div className="grid grid-cols-3 gap-2 border-t border-[#1e3a5f]/20 pt-2.5 font-mono text-[10px] text-slate-400 text-center">
              <div>
                <span className="block text-[8px] text-slate-500 uppercase tracking-widest">Total Latency</span>
                <span className="font-bold text-white text-xs">{pathDetails.totalLatency} ms</span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 uppercase tracking-widest">Hops</span>
                <span className="font-bold text-white text-xs">{pathDetails.hops} Hops</span>
              </div>
              <div>
                <span className="block text-[8px] text-slate-500 uppercase tracking-widest">Path Status</span>
                <span className={`font-bold text-xs ${
                  pathDetails.status === "NOMINAL" ? "text-green-400" : "text-amber-400"
                }`}>{pathDetails.status}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-center text-red-400/80 select-none">
            <ShieldAlert className="w-6 h-6 text-red-500 animate-bounce" />
            <p className="font-bold text-[11px] uppercase tracking-wider">NO ROUTE AVAILABLE (MPLS BLACKOUT)</p>
            <p className="text-[9px] text-slate-500">All pathways between nodes are currently blocked or administrative down.</p>
          </div>
        )}
      </div>
    </div>
  );
};
