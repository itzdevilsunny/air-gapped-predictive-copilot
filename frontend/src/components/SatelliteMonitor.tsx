import React, { useEffect, useRef, useState } from 'react';
import { Satellite, Radio, Zap, ZapOff, Thermometer, Signal, ArrowUpDown, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

export interface SatelliteData {
  name: string;
  type: string;
  altitude: number;
  velocity: number;
  snr: number;
  packet_loss: number;
  temp: number;
  los: boolean;
  lock_node: string;
  orbit_angle: number;
}

export interface SatelliteTelemetry {
  solar_flare: boolean;
  satellites: Record<string, SatelliteData>;
}

interface SatelliteMonitorProps {
  data: SatelliteTelemetry | null;
  onInjectSolarFlare: (active: boolean) => void;
}

const ORBIT_COLORS: Record<string, string> = {
  'Cartosat-3': '#22d3ee',   // cyan for LEO
  'GSAT-31':    '#a78bfa',   // purple for GEO
};

const RadarDisplay: React.FC<{ satellites: Record<string, SatelliteData>; solarFlare: boolean }> = ({ satellites, solarFlare }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const scanAngleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) / 2 - 6;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = '#030B1A';
      ctx.fillRect(0, 0, W, H);

      // Solar flare overlay
      if (solarFlare) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        grad.addColorStop(0, 'rgba(251,113,133,0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // Grid rings
      for (let r = 1; r <= 4; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR / 4) * r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34,211,238,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Cross hairs
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.strokeStyle = 'rgba(34,211,238,0.10)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Radar sweep
      scanAngleRef.current = (scanAngleRef.current + 1.5) % 360;
      const sweepRad = (scanAngleRef.current * Math.PI) / 180;


      // Manual sweep arc approximation
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sweepRad);
      const sweep = ctx.createLinearGradient(0, 0, maxR, 0);
      sweep.addColorStop(0, 'rgba(34,211,238,0.45)');
      sweep.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, -0.4, 0.1);
      ctx.closePath();
      ctx.fillStyle = sweep;
      ctx.fill();
      ctx.restore();

      // Earth center dot
      const earthGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
      earthGrad.addColorStop(0, '#1e40af');
      earthGrad.addColorStop(0.5, '#0ea5e9');
      earthGrad.addColorStop(1, '#0c4a6e');
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = earthGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,189,248,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw each satellite
      Object.values(satellites).forEach((sat) => {
        const color = ORBIT_COLORS[sat.name] || '#10b981';
        const isLEO = sat.type.includes('LEO');
        const orbitR = isLEO ? maxR * 0.65 : maxR * 0.9;

        // Orbit path
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}22`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Satellite position
        const rad = (sat.orbit_angle * Math.PI) / 180;
        const sx = cx + orbitR * Math.cos(rad);
        const sy = cy + orbitR * Math.sin(rad);

        // Glow ring when in LOS
        if (sat.los) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
          glow.addColorStop(0, `${color}55`);
          glow.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(sx, sy, 12, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Satellite dot
        ctx.beginPath();
        ctx.arc(sx, sy, sat.los ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = sat.los ? color : `${color}55`;
        ctx.fill();

        // Signal line to earth when in LOS
        if (sat.los && !solarFlare) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = `${color}33`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = sat.los ? color : `${color}66`;
        ctx.font = '9px monospace';
        ctx.fillText(sat.name, sx + 7, sy + 3);
      });

      // Solar flare warning ring
      if (solarFlare) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251,113,133,0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [satellites, solarFlare]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="rounded-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

const SatKpiCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  status?: 'ok' | 'warn' | 'dead';
}> = ({ label, value, unit, icon, status = 'ok' }) => {
  const colors = {
    ok:   'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    warn: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    dead: 'text-red-400 border-red-500/30 bg-red-500/5',
  };
  return (
    <div className={`rounded-lg border p-2 flex items-center gap-2 ${colors[status]}`}>
      <div className="opacity-70">{icon}</div>
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest opacity-60">{label}</div>
        <div className="font-mono font-bold text-xs leading-tight">
          {value}<span className="text-[9px] ml-0.5 opacity-60">{unit}</span>
        </div>
      </div>
    </div>
  );
};

export const SatelliteMonitor: React.FC<SatelliteMonitorProps> = ({ data, onInjectSolarFlare }) => {
  const [expanded, setExpanded] = useState(true);
  const [solarFlareLoading, setSolarFlareLoading] = useState(false);

  const handleSolarFlare = async () => {
    setSolarFlareLoading(true);
    try {
      await onInjectSolarFlare(!data?.solar_flare);
    } finally {
      setTimeout(() => setSolarFlareLoading(false), 500);
    }
  };

  const cartosat = data?.satellites?.['Cartosat-3'];
  const gsat = data?.satellites?.['GSAT-31'];
  const solarFlare = data?.solar_flare ?? false;

  const snrStatus = (snr: number, los: boolean): 'ok' | 'warn' | 'dead' => {
    if (!los || solarFlare) return 'dead';
    if (snr < 20) return 'warn';
    return 'ok';
  };

  // ── Handover and LOS Calculations ──────────────────────────────────────────
  let handoverText = '';
  let isHandoffActive = false;

  if (cartosat) {
    const angle = cartosat.orbit_angle;
    // Check if within 4 degrees of handover boundaries (AOS:60, H1:100, H2:140, LOS:180)
    isHandoffActive = cartosat.los && [60, 100, 140, 180].some(b => Math.abs(angle - b) <= 2);

    if (cartosat.los && !solarFlare) {
      if (angle >= 60 && angle < 100) {
        const remaining = Math.round(100 - angle);
        handoverText = `Handoff SDSC: ${remaining}s`;
      } else if (angle >= 100 && angle < 140) {
        const remaining = Math.round(140 - angle);
        handoverText = `Handoff PBL: ${remaining}s`;
      } else if (angle >= 140 && angle <= 180) {
        const remaining = Math.round(180 - angle);
        handoverText = `LOS: ${remaining}s`;
      }
    } else {
      const degTo60 = angle > 180 ? (360 - angle) + 60 : 60 - angle;
      const mins = Math.floor(degTo60 / 60);
      const secs = Math.round(degTo60 % 60);
      handoverText = mins > 0 ? `AOS: ${mins}m ${secs}s` : `AOS: ${secs}s`;
    }
  }

  return (
    <div className="glass-panel rounded-xl border border-slate-800/60 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/60 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Satellite className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-violet-300">
            Space Segment Monitor
          </span>
          {solarFlare && (
            <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded font-mono animate-pulse">
              ☀ SOLAR FLARE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {cartosat && (
              <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${cartosat.los && !solarFlare ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
            )}
            {gsat && (
              <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${!solarFlare ? 'bg-violet-400' : 'bg-slate-600'}`} />
            )}
          </div>
          <span className="text-noc-muted text-[10px] font-mono">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-3 flex gap-3">
          {/* Radar */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <RadarDisplay satellites={data?.satellites ?? {}} solarFlare={solarFlare} />
            <button
              onClick={handleSolarFlare}
              disabled={solarFlareLoading}
              className={`w-full text-[9px] font-mono font-bold uppercase px-2 py-1.5 rounded border transition-all duration-300 flex items-center justify-center gap-1 ${
                solarFlare
                  ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20'
              }`}
            >
              {solarFlare ? <ZapOff className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
              {solarFlare ? 'Cease Flare' : 'Inject Flare'}
            </button>
          </div>

          {/* KPI Panels */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {/* Cartosat-3 LEO */}
            {cartosat && (
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">Cartosat-3 (LEO)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {handoverText && (
                      <span className={`text-[8px] font-mono border px-1 rounded uppercase tracking-wider ${
                        isHandoffActive 
                          ? 'text-noc-warning border-noc-warning/40 bg-noc-warning/10 animate-pulse'
                          : !cartosat.los
                            ? 'text-noc-muted border-noc-border/40 bg-noc-card/40'
                            : 'text-noc-primary border-noc-primary/30 bg-noc-primary/5'
                      }`}>
                        {handoverText}
                      </span>
                    )}
                    {cartosat.los && !solarFlare
                      ? <span className="text-[8px] text-emerald-400 font-mono border border-emerald-500/30 px-1 rounded bg-emerald-500/10">LOS ✓</span>
                      : <span className="text-[8px] text-slate-500 font-mono border border-slate-700/50 px-1 rounded">NO SIGNAL</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <SatKpiCard
                    label={isHandoffActive ? "SNR (FADING)" : "SNR"}
                    value={cartosat.snr.toFixed(1)}
                    unit="dB"
                    icon={<Signal className="w-3 h-3" />}
                    status={isHandoffActive ? 'warn' : snrStatus(cartosat.snr, cartosat.los)}
                  />
                  <SatKpiCard
                    label="Altitude"
                    value={cartosat.altitude.toFixed(0)}
                    unit="km"
                    icon={<ArrowUpDown className="w-3 h-3" />}
                    status="ok"
                  />
                  <SatKpiCard
                    label="Lock Node"
                    value={isHandoffActive ? "HANDOVER..." : cartosat.lock_node}
                    icon={cartosat.los ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    status={isHandoffActive ? 'warn' : (cartosat.los && !solarFlare ? 'ok' : 'dead')}
                  />
                  <SatKpiCard
                    label="Transponder"
                    value={cartosat.temp.toFixed(1)}
                    unit="°C"
                    icon={<Thermometer className="w-3 h-3" />}
                    status={cartosat.temp > 35 ? 'warn' : 'ok'}
                  />
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-slate-800/60" />

            {/* GSAT-31 GEO */}
            {gsat && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="text-[10px] font-mono font-bold text-violet-400 uppercase tracking-wider">GSAT-31 (GEO)</span>
                  {!solarFlare
                    ? <span className="text-[8px] text-emerald-400 font-mono border border-emerald-500/30 px-1 rounded bg-emerald-500/10">STABLE ✓</span>
                    : <span className="text-[8px] text-red-400 font-mono border border-red-500/30 px-1 rounded bg-red-500/10 animate-pulse">DISRUPTED</span>}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <SatKpiCard
                    label="SNR"
                    value={gsat.snr.toFixed(1)}
                    unit="dB"
                    icon={<Signal className="w-3 h-3" />}
                    status={solarFlare ? 'dead' : gsat.snr < 14 ? 'warn' : 'ok'}
                  />
                  <SatKpiCard
                    label="Altitude"
                    value={(gsat.altitude / 1000).toFixed(1)}
                    unit="Mm"
                    icon={<ArrowUpDown className="w-3 h-3" />}
                    status="ok"
                  />
                  <SatKpiCard
                    label="Lock Node"
                    value={gsat.lock_node}
                    icon={<Radio className="w-3 h-3" />}
                    status={solarFlare ? 'dead' : 'ok'}
                  />
                  <SatKpiCard
                    label="Transponder"
                    value={gsat.temp.toFixed(1)}
                    unit="°C"
                    icon={<Thermometer className="w-3 h-3" />}
                    status={gsat.temp > 70 ? 'warn' : 'ok'}
                  />
                </div>
              </div>
            )}

            {!data && (
              <div className="flex flex-col items-center justify-center py-4 text-slate-600">
                <AlertTriangle className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-mono">Awaiting satellite telemetry stream...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
