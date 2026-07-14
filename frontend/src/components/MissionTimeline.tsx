import React, { useRef, useEffect } from 'react';
import { Terminal, AlertTriangle, CheckCircle, Zap, Sun, Shield, Radio } from 'lucide-react';

export type MissionEventSeverity = 'info' | 'warning' | 'critical' | 'success' | 'solar' | 'heal';

export interface MissionEvent {
  id: string;
  timestamp: string;
  severity: MissionEventSeverity;
  title: string;
  detail: string;
  node?: string;
}

interface MissionTimelineProps {
  events: MissionEvent[];
}

const SEVERITY_CONFIG: Record<MissionEventSeverity, {
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  label: string;
}> = {
  info:     { icon: Radio,         colorClass: 'text-noc-primary',  bgClass: 'bg-noc-primary/10',  borderClass: 'border-noc-primary/25',  label: 'INFO' },
  warning:  { icon: AlertTriangle, colorClass: 'text-noc-warning',  bgClass: 'bg-noc-warning/10',  borderClass: 'border-noc-warning/25',  label: 'WARN' },
  critical: { icon: Zap,           colorClass: 'text-noc-danger',   bgClass: 'bg-noc-danger/10',   borderClass: 'border-noc-danger/25',   label: 'CRIT' },
  success:  { icon: CheckCircle,   colorClass: 'text-noc-success',  bgClass: 'bg-noc-success/10',  borderClass: 'border-noc-success/25',  label: 'OK' },
  solar:    { icon: Sun,           colorClass: 'text-noc-purple',   bgClass: 'bg-noc-purple/10',   borderClass: 'border-noc-purple/25',   label: 'FLARE' },
  heal:     { icon: Shield,        colorClass: 'text-[#06b6d4]',    bgClass: 'bg-[#06b6d4]/10',    borderClass: 'border-[#06b6d4]/25',    label: 'HEAL' },
};

const MissionTimelineEntry: React.FC<{ event: MissionEvent; isNew?: boolean }> = ({ event, isNew }) => {
  const cfg = SEVERITY_CONFIG[event.severity];
  const Icon = cfg.icon;

  return (
    <div
      className={`flex gap-2 p-2 rounded border ${cfg.bgClass} ${cfg.borderClass} transition-all duration-500 ${isNew ? 'animate-mission-entry' : ''}`}
    >
      <div className={`flex-shrink-0 mt-0.5 ${cfg.colorClass}`}>
        <Icon className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className={`text-[9px] font-mono font-bold uppercase tracking-widest px-1 rounded ${cfg.bgClass} ${cfg.colorClass}`}>
            {cfg.label}
          </span>
          <span className="text-[9px] text-noc-muted font-mono flex-shrink-0">{event.timestamp}</span>
        </div>
        <p className={`text-[10px] font-bold font-mono ${cfg.colorClass} truncate`}>{event.title}</p>
        {event.detail && (
          <p className="text-[9px] text-noc-muted leading-relaxed truncate">{event.detail}</p>
        )}
      </div>
    </div>
  );
};

export const MissionTimeline: React.FC<MissionTimelineProps> = ({ events }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(events.length);

  useEffect(() => {
    if (events.length !== prevLenRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  return (
    <div className="glass-panel rounded-xl flex flex-col h-full border border-noc-border/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-noc-border/40 bg-[#030611]/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-noc-primary" />
          <span className="text-[10px] font-mono font-bold text-noc-primary uppercase tracking-widest">
            Mission Event Log
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-noc-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-noc-primary" />
          </span>
          <span className="text-[9px] font-mono text-noc-muted">{events.length} EVENTS</span>
        </div>
      </div>

      {/* Scrollable feed — newest first */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0"
        style={{ scrollBehavior: 'smooth' }}
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-40">
            <Radio className="w-8 h-8 text-noc-primary/30" />
            <p className="text-[9px] font-mono text-noc-muted">AWAITING TELEMETRY EVENTS...</p>
          </div>
        ) : (
          events.map((evt, idx) => (
            <MissionTimelineEntry key={evt.id} event={evt} isNew={idx === 0} />
          ))
        )}
      </div>
    </div>
  );
};
