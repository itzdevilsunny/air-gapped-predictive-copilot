import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  TrendingUp, 
  Activity, 
  Clock, 
  X
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';

interface HealthGaugeProps {
  score: number;          // 0–100, higher = healthier
  alertCount: number;
  solarFlare: boolean;
  healActive: boolean;
}

interface HealthHistoryPoint {
  id?: string;
  health_score: number;
  active_alerts: number;
  solar_flare: boolean;
  created_at: string;
}

function getGaugeColor(score: number, solarFlare: boolean, healActive: boolean): string {
  if (solarFlare)   return '#8b5cf6'; // purple
  if (healActive)   return '#06b6d4'; // cyan
  if (score >= 75)  return '#10b981'; // green
  if (score >= 50)  return '#f59e0b'; // amber
  return '#f43f5e';                   // red
}

function getStatusLabel(score: number, solarFlare: boolean, healActive: boolean): string {
  if (solarFlare) return 'SOLAR STORM';
  if (healActive) return 'HEALING';
  if (score >= 75) return 'NOMINAL';
  if (score >= 50) return 'DEGRADED';
  if (score >= 25) return 'CRITICAL';
  return 'FAILURE';
}

export const HealthGauge: React.FC<HealthGaugeProps> = ({ score, alertCount, solarFlare, healActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const currentRef = useRef(score);

  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState<HealthHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const color = getGaugeColor(score, solarFlare, healActive);
  const label = getStatusLabel(score, solarFlare, healActive);

  // Load health trend history from API
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health-history?limit=60');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch health history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Open modal and fetch history
  const handleOpenModal = () => {
    setShowModal(true);
    loadHistory();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2 + 4;
    const r  = 36;
    const startAngle = Math.PI * 0.75;
    const totalArc   = Math.PI * 1.5;

    let frameId: number;

    const draw = () => {
      // Animate toward target
      const diff = score - currentRef.current;
      if (Math.abs(diff) > 0.3) {
        currentRef.current += diff * 0.08;
      } else {
        currentRef.current = score;
      }

      const disp = Math.max(0, Math.min(100, currentRef.current));
      const endAngle = startAngle + totalArc * (disp / 100);

      ctx.clearRect(0, 0, W, H);

      // Background track
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + totalArc);
      ctx.strokeStyle = '#0a1628';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Tick marks
      for (let i = 0; i <= 10; i++) {
        const ang = startAngle + (totalArc * i) / 10;
        const inner = r - 12;
        const outer = r - 8;
        ctx.beginPath();
        ctx.moveTo(cx + inner * Math.cos(ang), cy + inner * Math.sin(ang));
        ctx.lineTo(cx + outer * Math.cos(ang), cy + outer * Math.sin(ang));
        ctx.strokeStyle = '#1b2547';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Glow arc (larger, blurred)
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // Score text
      ctx.font = 'bold 16px Orbitron, Inter, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(disp).toString(), cx, cy - 4);

      // Label
      ctx.font = '7px JetBrains Mono, monospace';
      ctx.fillStyle = '#64748b';
      ctx.fillText('NOC HEALTH', cx, cy + 12);

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    animRef.current = frameId;

    return () => cancelAnimationFrame(frameId);
  }, [score, color]);

  // Compute history summary stats
  const stats = React.useMemo(() => {
    if (history.length === 0) return { avg: 100, min: 100, maxAlerts: 0, solarFlaresCount: 0 };
    const scores = history.map(h => h.health_score);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / history.length);
    const min = Math.min(...scores);
    const maxAlerts = Math.max(...history.map(h => h.active_alerts));
    const solarFlaresCount = history.filter(h => h.solar_flare).length;
    return { avg, min, maxAlerts, solarFlaresCount };
  }, [history]);

  return (
    <>
      <div 
        onClick={handleOpenModal}
        className="flex flex-col items-center gap-0.5 select-none cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200" 
        title={`NOC Health Index: ${Math.round(score)}/100 (Click to view historical trend)`}
      >
        <canvas
          ref={canvasRef}
          width={100}
          height={95}
          className="block animate-pulse-slow"
        />
        <div
          className="text-[9px] font-mono font-bold tracking-widest px-2 py-0.5 rounded uppercase transition-all duration-500"
          style={{ color, background: `${color}18`, border: `1px solid ${color}44` }}
        >
          {label}
        </div>
        {alertCount > 0 && (
          <div className="text-[8px] font-mono text-noc-danger mt-0.5 animate-pulse">
            ⚠ {alertCount} ALARM{alertCount > 1 ? 'S' : ''}
          </div>
        )}
      </div>

      {/* ── Historical Trend Glassmorphic Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-sans select-none animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#080d1a] to-[#040813] border border-[#22d3ee]/20 rounded-2xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col gap-5">
            
            {/* Top Close Button */}
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest font-mono">ISRO NOC Health & SLA Analytics</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Continuous 30s-interval telemetry history synced with Supabase</p>
              </div>
            </div>

            {/* Stats Dashboard Grid */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#030712] border border-slate-800/60 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Current Score</span>
                <span className="text-lg font-bold font-mono mt-1 text-cyan-400">{Math.round(score)}/100</span>
              </div>
              <div className="bg-[#030712] border border-slate-800/60 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Avg Health (60pt)</span>
                <span className="text-lg font-bold font-mono mt-1 text-emerald-400">{stats.avg}%</span>
              </div>
              <div className="bg-[#030712] border border-slate-800/60 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Lowest Health</span>
                <span className="text-lg font-bold font-mono mt-1 text-rose-500">{stats.min}%</span>
              </div>
              <div className="bg-[#030712] border border-slate-800/60 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Solar Storm Pts</span>
                <span className="text-lg font-bold font-mono mt-1 text-purple-400">{stats.solarFlaresCount}</span>
              </div>
            </div>

            {/* Time-Series Area Chart */}
            <div className="flex-1 min-h-[220px] bg-[#02040a] rounded-xl border border-slate-900 p-4 relative flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  Health Index Time-Series Trend
                </span>
                <div className="flex items-center gap-3 text-[9px] font-mono">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Nominal (&gt;75)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Degraded (50-75)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Critical (&lt;50)</span>
                </div>
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono gap-2">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  Syncing with Supabase metrics...
                </div>
              ) : history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-xs font-mono">
                  No telemetry metrics logged yet. Generating data stream...
                </div>
              ) : (
                <div className="w-full h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                      <XAxis 
                        dataKey="created_at" 
                        tickFormatter={(t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        tick={{ fill: "#475569", fontSize: 8, fontFamily: "monospace" }} 
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        tick={{ fill: "#475569", fontSize: 8, fontFamily: "monospace" }} 
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0b0f19", borderColor: "#334155", borderRadius: "8px" }}
                        itemStyle={{ fontSize: 9, color: "#fff", fontFamily: "monospace" }}
                        labelStyle={{ fontSize: 9, color: "#22d3ee", fontFamily: "monospace" }}
                        labelFormatter={(t) => `Time: ${new Date(t).toLocaleString('en-IN')}`}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="health_score" 
                        stroke="#22d3ee" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#healthGrad)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Footer Summary */}
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 border-t border-slate-900 pt-4">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                Auto-updates every 30 seconds
              </span>
              <span className="text-cyan-500/80 font-bold uppercase tracking-wider">
                PRED-NOC SLA Monitoring
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
