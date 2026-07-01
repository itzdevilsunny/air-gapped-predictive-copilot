import React from 'react';
import type { RouterState } from '../types';
import { Activity, AlertTriangle, Radio, ShieldAlert } from 'lucide-react';

interface TopologyMapProps {
  telemetryData: Record<string, RouterState>;
  selectedRouterId: string | null;
  onSelectRouter: (id: string) => void;
}

interface NodePosition {
  id: string;
  name: string;
  x: number; // percentage
  y: number; // percentage
  labelPosition?: 'left' | 'right' | 'top' | 'bottom';
}

// Relative node locations matching Indian geography layout
const NODES: NodePosition[] = [
  { id: 'NOC-DEL', name: 'NOC Delhi', x: 48, y: 18, labelPosition: 'right' },
  { id: 'NOC-MUM', name: 'NOC Mumbai', x: 28, y: 52, labelPosition: 'left' },
  { id: 'MCF-HSN', name: 'MCF Hassan', x: 32, y: 80, labelPosition: 'left' },
  { id: 'ISTRAC-BGL', name: 'ISTRAC Bangalore', x: 45, y: 82, labelPosition: 'bottom' },
  { id: 'SDSC-SHAR', name: 'SDSC Sriharikota', x: 55, y: 74, labelPosition: 'top' },
  { id: 'TRACK-PBL', name: 'TRACK Port Blair', x: 80, y: 80, labelPosition: 'right' },
];

// Defined connections between nodes
const LINKS = [
  { source: 'NOC-DEL', target: 'NOC-MUM' },
  { source: 'NOC-DEL', target: 'ISTRAC-BGL' },
  { source: 'NOC-MUM', target: 'ISTRAC-BGL' },
  { source: 'MCF-HSN', target: 'ISTRAC-BGL' },
  { source: 'ISTRAC-BGL', target: 'SDSC-SHAR' },
  { source: 'ISTRAC-BGL', target: 'TRACK-PBL' },
  { source: 'SDSC-SHAR', target: 'TRACK-PBL' },
];

// Helper to get label placement classes based on position
const getLabelPlacementClass = (pos?: 'left' | 'right' | 'top' | 'bottom') => {
  switch (pos) {
    case 'left':
      return 'right-9 top-1/2 -translate-y-1/2 text-left';
    case 'top':
      return 'bottom-9 left-1/2 -translate-x-1/2 text-center';
    case 'bottom':
      return 'top-9 left-1/2 -translate-x-1/2 text-center';
    case 'right':
    default:
      return 'left-9 top-1/2 -translate-y-1/2 text-left';
  }
};

export const TopologyMap: React.FC<TopologyMapProps> = ({
  telemetryData,
  selectedRouterId,
  onSelectRouter,
}) => {
  return (
    <div className="glass-panel rounded-xl p-5 relative overflow-hidden h-[540px] flex flex-col grid-bg scanline">
      {/* Title Header */}
      <div className="flex justify-between items-center mb-4 z-10">
        <div>
          <h3 className="font-display text-lg tracking-wider text-noc-primary flex items-center gap-2">
            <Radio className="w-5 h-5 text-noc-primary animate-pulse" />
            ISRO TELEMETRY TOPOLOGY GRID
          </h3>
          <p className="text-xs text-noc-muted">Click nodes to inspect metrics, failure risk (XGBoost) and anomalies (Isolation Forest).</p>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-noc-success animate-pulse"></span> Normal</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-noc-warning animate-pulse"></span> Warning</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-noc-danger animate-pulse"></span> Critical / Down</span>
        </div>
      </div>

      {/* SVG Canvas for Map Topology */}
      <div className="relative flex-1 w-full bg-[#030611]/80 rounded-lg border border-noc-border/40 overflow-hidden">
        {/* Background Map Contours (Simple Grid/Aesthetics) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
          <div className="w-[80%] h-[80%] rounded-full border border-noc-primary/20 animate-pulse-slow"></div>
          <div className="w-[60%] h-[60%] rounded-full border border-noc-primary/10 absolute"></div>
          <div className="w-[40%] h-[40%] rounded-full border border-noc-primary/5 absolute"></div>
        </div>

        <svg className="w-full h-full absolute inset-0 z-0">
          <defs>
            {/* Gradients for node glows */}
            <radialGradient id="glow-healthy" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glow-alert" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glow-danger" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
            </radialGradient>
            
            {/* Filter for glowing lines */}
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Draw Connection Links */}
          {LINKS.map((link, idx) => {
            const sourceNode = NODES.find(n => n.id === link.source);
            const targetNode = NODES.find(n => n.id === link.target);
            if (!sourceNode || !targetNode) return null;

            // Fetch status of endpoints to style the link
            const sourceState = telemetryData[sourceNode.id];
            const targetState = telemetryData[targetNode.id];

            const sourceHealth = sourceState?.telemetry.link_status === 0 || sourceState?.analysis.failure_risk > 80 ? 'danger' : sourceState?.analysis.failure_risk > 40 || sourceState?.analysis.is_anomaly ? 'warning' : 'healthy';
            const targetHealth = targetState?.telemetry.link_status === 0 || targetState?.analysis.failure_risk > 80 ? 'danger' : targetState?.analysis.failure_risk > 40 || targetState?.analysis.is_anomaly ? 'warning' : 'healthy';

            let linkColor = 'stroke-noc-primary/20';
            let flowColor = '#38bdf8';
            let isDown = false;

            if (sourceHealth === 'danger' || targetHealth === 'danger') {
              linkColor = 'stroke-noc-danger/40';
              flowColor = '#f43f5e';
              if (sourceState?.telemetry.link_status === 0 || targetState?.telemetry.link_status === 0) {
                isDown = true;
              }
            } else if (sourceHealth === 'warning' || targetHealth === 'warning') {
              linkColor = 'stroke-noc-warning/40';
              flowColor = '#f59e0b';
            }

            const x1 = `${sourceNode.x}%`;
            const y1 = `${sourceNode.y}%`;
            const x2 = `${targetNode.x}%`;
            const y2 = `${targetNode.y}%`;

            return (
              <g key={`link-${idx}`}>
                {/* Main link line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={`transition-all duration-500 ${linkColor}`}
                  strokeWidth={isDown ? "1.5" : "2"}
                  strokeDasharray={isDown ? "4,4" : undefined}
                />
                
                {/* Animated active traffic flows */}
                {!isDown && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={flowColor}
                    strokeWidth="1.5"
                    strokeDasharray="8, 25"
                    className="animate-flow"
                    style={{
                      strokeDashoffset: 100,
                      animation: 'flow-animation 4s linear infinite',
                    }}
                    filter="url(#neon-glow)"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* CSS animation inline for link flows */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes flow-animation {
            to {
              stroke-dashoffset: -100;
            }
          }
        `}} />

        {/* Draw Nodes */}
        {NODES.map((node) => {
          const state = telemetryData[node.id];
          const isSelected = selectedRouterId === node.id;
          
          const telemetry = state?.telemetry || { link_status: 1, cpu: 0, latency: 0, packet_loss: 0 };
          const analysis = state?.analysis || { failure_risk: 0, is_anomaly: false, anomaly_score: 0 };

          // Determine health status
          const isLinkDown = telemetry.link_status === 0;
          const isCritical = state && (analysis.failure_risk > 70.0 || isLinkDown);
          const isWarning = state && (analysis.failure_risk > 35.0 || analysis.is_anomaly);

          let glowGradient = 'url(#glow-healthy)';
          let pingColor = 'bg-noc-success';
          let borderStyleClass: string;

          if (!state) {
            glowGradient = 'none';
            pingColor = 'bg-noc-muted';
            borderStyleClass = 'border-noc-border/40 opacity-60';
          } else if (isCritical) {
            glowGradient = 'url(#glow-danger)';
            pingColor = 'bg-noc-danger';
            borderStyleClass = 'border-noc-danger/80 ring-1 ring-noc-danger/20 hover:scale-105 shadow-glow-danger';
          } else if (isWarning) {
            glowGradient = 'url(#glow-alert)';
            pingColor = 'bg-noc-warning';
            borderStyleClass = 'border-noc-warning/80 ring-1 ring-noc-warning/20 hover:scale-105 shadow-glow-warning';
          } else {
            borderStyleClass = 'border-noc-border hover:border-noc-primary/80 hover:scale-105';
          }

          return (
            <div
              key={node.id}
              id={`node-${node.id}`}
              className="absolute group cursor-pointer -translate-x-1/2 -translate-y-1/2 select-none z-10 transition-all duration-300"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onClick={() => onSelectRouter(node.id)}
            >
              {/* Outer Glow Halo */}
              {glowGradient !== 'none' && (
                <div
                  className={`absolute w-16 h-16 -left-8 -top-8 rounded-full pointer-events-none transition-transform duration-500 scale-75 group-hover:scale-100 ${
                    isSelected ? 'scale-110 opacity-100' : 'opacity-40'
                  }`}
                  style={{ background: glowGradient }}
                />
              )}

              {/* Status Ring & Core */}
              <div
                className={`relative w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 bg-noc-bg/90 shadow-md ${
                  isSelected 
                    ? 'border-noc-primary ring-2 ring-noc-primary/40 scale-110 shadow-glow-cyan' 
                    : borderStyleClass
                }`}
              >
                {/* Ping animation */}
                {state && (isCritical || isWarning) && (
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${pingColor}`} style={{ animationDuration: isCritical ? '1s' : '2s' }} />
                )}

                {/* Node icon based on failure */}
                {!state ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-noc-muted/60" />
                ) : isLinkDown ? (
                  <ShieldAlert className="w-4 h-4 text-noc-danger animate-bounce" />
                ) : isCritical ? (
                  <AlertTriangle className="w-4 h-4 text-noc-danger" />
                ) : isWarning ? (
                  <Activity className="w-4 h-4 text-noc-warning animate-pulse" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-noc-success" />
                )}
              </div>

              {/* Label */}
              <div
                className={`absolute ${getLabelPlacementClass(node.labelPosition)} whitespace-nowrap px-2 py-1 rounded text-[10px] font-mono border glass-panel transition-all duration-300 z-20 ${
                  isSelected
                    ? 'text-noc-primary border-noc-primary bg-noc-card/95 shadow-glow-cyan scale-105'
                    : !state
                      ? 'text-noc-muted border-noc-border/30 bg-noc-card/40 opacity-60'
                      : isCritical
                        ? 'text-noc-danger border-noc-danger bg-noc-card/95 shadow-glow-danger'
                        : isWarning
                          ? 'text-noc-warning border-noc-warning bg-noc-card/95 shadow-glow-warning'
                          : 'text-noc-text/80 border-noc-border bg-noc-card/85 group-hover:text-noc-primary group-hover:border-noc-primary group-hover:scale-105 group-hover:shadow-glow-cyan'
                }`}
              >
                <div className={`font-semibold ${node.labelPosition === 'top' || node.labelPosition === 'bottom' ? 'text-center' : ''}`}>{node.name}</div>
                <div className={`flex gap-1.5 items-center mt-0.5 opacity-80 text-[8px] ${
                  node.labelPosition === 'top' || node.labelPosition === 'bottom' ? 'justify-center' : ''
                }`}>
                  {!state ? (
                    <span>OFFLINE</span>
                  ) : (
                    <>
                      <span>R: {analysis.failure_risk}%</span>
                      <span>•</span>
                      <span>CPU: {telemetry.cpu}%</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
