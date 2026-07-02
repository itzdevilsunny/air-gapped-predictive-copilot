import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  Shield, Cpu, Radio, BookOpen, Lock,
  Menu, X, ChevronRight, Satellite, Activity,
  AlertTriangle, Zap, GitBranch, Brain, Globe,
  ArrowRight, Terminal, Wifi, WifiOff, BarChart3,
  RefreshCw, Clock, Radar, Database, CheckCircle2, TrendingUp, Layers,
} from 'lucide-react';

/* ═══════════════════════ types ═══════════════════════ */
interface LandingPageProps { onLogin: (success: boolean) => void; }
interface TooltipData { label: string; lat: string; cpu: string; loss: string; risk: string; color: string }

/* ═══════════════════════ constants ════════════════════ */

const STATIONS = [
  { id: 'ISTRAC-BGL', label: 'ISTRAC BGL', cx: 50,  cy: 50,  color: '#0284c7', lat: '14ms', cpu: '28%', loss: '0.0%', risk: '5%'  },
  { id: 'SDSC-SHAR',  label: 'SDSC SHAR',  cx: 80,  cy: 68,  color: '#10b981', lat: '19ms', cpu: '35%', loss: '0.1%', risk: '12%' },
  { id: 'MCF-HSN',    label: 'MCF HSN',    cx: 35,  cy: 72,  color: '#7c3aed', lat: '21ms', cpu: '41%', loss: '0.2%', risk: '8%'  },
  { id: 'NOC-DEL',    label: 'NOC DEL',    cx: 50,  cy: 22,  color: '#d97706', lat: '16ms', cpu: '52%', loss: '0.0%', risk: '18%' },
  { id: 'NOC-MUM',    label: 'NOC MUM',    cx: 24,  cy: 52,  color: '#0284c7', lat: '13ms', cpu: '29%', loss: '0.1%', risk: '7%'  },
  { id: 'TRACK-PBL',  label: 'TRACK PBL',  cx: 88,  cy: 42,  color: '#e11d48', lat: '24ms', cpu: '44%', loss: '0.3%', risk: '22%' },
];

const LINKS = [[0,1],[0,2],[0,3],[0,4],[1,5],[2,4],[3,4],[3,5],[1,2]];

const TICKER_ITEMS = [
  '◆ ISTRAC-BGL  LINK: UP  LAT 14ms  LOSS 0.0%  CPU 28%',
  '◆ NOC-DEL  CPU 52%  BW 36%  JITTER 1.8ms  RISK 18%',
  '◆ SDSC-SHAR  RISK 12%  ANOMALY: NONE  STATUS: NOMINAL',
  '◆ Cartosat-3  LEO 505km  SNR 24.7dB  LOS: YES  TEMP 24.5°C',
  '◆ GSAT-31  GEO 35786km  SNR 16.2dB  LINK: STABLE  TEMP 61.2°C',
  '◆ MCF-HSN  SELF-HEAL READY  MEMORY 44%  OSPF ADJ: 3',
  '◆ TRACK-PBL  BW 41%  PACKET LOSS 0.3%  RISK 22%',
  '◆ MODEL: XGBOOST v3.2 ACTIVE  ISO-FOREST ONLINE  COPILOT: READY',
  '◆ SOLAR FLARE: NONE  IONOSPHERIC: CALM  ORBITAL: STABLE',
];

const STATS = [
  { label: 'Stations Monitored', value: '6',    suffix: '',    icon: Globe,     color: '#0284c7' },
  { label: 'Avg Prediction Lead', value: '45',  suffix: ' min',icon: Brain,     color: '#7c3aed' },
  { label: 'Anomaly Precision',   value: '97.3',suffix: '%',   icon: BarChart3, color: '#10b981' },
  { label: 'Self-Heal Scripts',   value: '12',  suffix: '',    icon: RefreshCw, color: '#d97706' },
];

const FEATURES = [
  { icon: Activity,      phase: 1, title: 'Real-Time Telemetry',        color: '#0284c7', bar: 95, desc: 'WebSocket-driven live metrics — latency, jitter, packet loss, CPU & memory — streamed every 2 seconds across all 6 ISRO ground stations.' },
  { icon: Brain,         phase: 2, title: 'XGBoost Failure Prediction',  color: '#7c3aed', bar: 97, desc: 'ML classifier trained on 2,400 synthetic samples predicts node failure up to 45 minutes in advance with rolling-window feature engineering.' },
  { icon: AlertTriangle, phase: 3, title: 'Isolation Forest Anomaly',    color: '#d97706', bar: 93, desc: 'Unsupervised anomaly detection scores each telemetry snapshot against baseline distribution to surface SUSPICIOUS and CRITICAL drift in real time.' },
  { icon: Terminal,      phase: 4, title: 'Cisco CLI Auto-Remediation',  color: '#10b981', bar: 89, desc: 'Root-cause engine maps failure signatures to precise Cisco IOS CLI playbooks — QoS shaping, route failover, and CPU threshold alerts.' },
  { icon: BookOpen,      phase: 5, title: 'Air-Gapped RAG Copilot',      color: '#0284c7', bar: 91, desc: 'TF-IDF vector store over local ISRO SOPs. Query operational manuals, get AI diagnostics, upload custom docs — zero internet required.' },
  { icon: Satellite,     phase: 6, title: 'Satellite Orbit Tracker',     color: '#e11d48', bar: 88, desc: 'Live orbital telemetry for Cartosat-3 (LEO) and GSAT-31 (GEO) — SNR, packet loss, temperature, LOS window, and solar-flare simulation.' },
];

const TERMINAL_LINES = [
  { prefix: '$',  text: 'noc-copilot analyze SDSC-SHAR --full',  color: '#38bdf8' },
  { prefix: '→',  text: 'Pulling 60-step telemetry buffer...',   color: '#94a3b8' },
  { prefix: '→',  text: 'Running XGBoost inference...',          color: '#94a3b8' },
  { prefix: '⚡', text: 'Failure risk score: 78.4% [CRITICAL]',  color: '#f43f5e' },
  { prefix: '◆',  text: 'IsolationForest: ANOMALY DETECTED',     color: '#f59e0b' },
  { prefix: '→',  text: 'Root Cause: MPLS Underlay Congestion',  color: '#94a3b8' },
  { prefix: '→',  text: 'Generating Cisco IOS CLI script...',    color: '#94a3b8' },
  { prefix: '>',  text: 'policy-map ISRO-QOS-SHAPING',           color: '#10b981' },
  { prefix: '>',  text: '  class ISRO-CRITICAL-DATA',            color: '#10b981' },
  { prefix: '>',  text: '    priority percent 50',               color: '#10b981' },
  { prefix: '>',  text: '  class class-default',                 color: '#10b981' },
  { prefix: '>',  text: '    shape average 10000000',            color: '#10b981' },
  { prefix: '>',  text: 'interface Tunnel10',                    color: '#10b981' },
  { prefix: '>',  text: '  service-policy output ISRO-QOS',      color: '#10b981' },
  { prefix: '✓',  text: 'Script queued. ETA: 3s. Mitigating...', color: '#10b981' },
];

const HERO_WORDS = ['Predict', '&', 'Prevent', 'Ground', 'Station', 'Failures'];

/* ═══════════════════════ helpers ═══════════════════════ */

function useMissionClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setTime(
        `UTC ${pad(utc.getHours())}:${pad(utc.getMinutes())}:${pad(utc.getSeconds())} · DOY ${Math.ceil((+utc - +new Date(utc.getFullYear(), 0, 0)) / 86400000)}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useScrollReveal() {
  const refs = useRef<Set<HTMLElement>>(new Set());
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = '1';
          (e.target as HTMLElement).style.transform = 'translateY(0)';
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.12 }
    );
    refs.current.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  const register = useCallback((el: HTMLElement | null) => {
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
      el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
      refs.current.add(el);
    }
  }, []);
  return register;
}

/* ═══════════════════════ sub-components ══════════════════ */

/** Particle star-field canvas optimized for white background */
const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 100;
    const stars = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.10,
      vy: (Math.random() - 0.5) * 0.10,
      alpha: Math.random() * 0.35 + 0.15,
      pulse: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        s.x += s.vx; s.y += s.vy; s.pulse += 0.008;
        if (s.x < 0) s.x = canvas.width; if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height; if (s.y > canvas.height) s.y = 0;
        const a = s.alpha * (0.6 + 0.4 * Math.sin(s.pulse));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14,165,233,${a})`;
        ctx.fill();
      });
      // draw connections
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 95) {
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.strokeStyle = `rgba(203,213,225,${0.22 * (1 - d / 95)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none opacity-80" />;
};

/** Mouse-following spotlight gradient for light theme */
const MouseSpotlight: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.background =
          `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px, rgba(14,165,233,0.035) 0%, transparent 70%)`;
      }
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);
  return <div ref={ref} className="fixed inset-0 z-[1] pointer-events-none transition-[background] duration-300" />;
};

/** Typewriter effect for hero headline (light theme styling) */
const TypewriterText: React.FC<{ words: string[] }> = ({ words }) => {
  const [rendered, setRendered] = useState<string[]>([]);
  const [cursor, setCursor] = useState(true);
  useEffect(() => {
    let wi = 0, ci = 0;
    const advance = () => {
      if (wi >= words.length) { setCursor(false); return; }
      const word = words[wi];
      if (ci <= word.length) {
        setRendered(prev => {
          const next = [...prev];
          next[wi] = word.slice(0, ci);
          return next;
        });
        ci++;
        setTimeout(advance, ci === 1 ? 120 : 55);
      } else {
        wi++; ci = 0;
        setTimeout(advance, 180);
      }
    };
    setTimeout(advance, 400);
  }, []);

  const colorMap: Record<string, string> = {
    'Predict': '#0f172a',  // slate-900
    '&': '#0284c7',        // sky-600
    'Prevent': '#0f172a',  // slate-900
    'Ground': '#0f172a',   // slate-900
    'Station': '#0284c7',  // sky-600
    'Failures': '#e11d48', // rose-600
  };

  return (
    <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight uppercase leading-[1.0] mb-0">
      {words.map((w, i) => (
        <span key={w} style={{ color: colorMap[w] ?? '#0f172a' }} className="inline-block mr-3 sm:mr-4 lg:mr-5">
          {rendered[i] ?? ''}
        </span>
      ))}
      {cursor && <span className="inline-block w-[3px] h-[0.85em] bg-sky-500 align-middle animate-[blink_0.8s_step-end_infinite] ml-1" />}
    </h2>
  );
};

/** 3-D tilt card (light-theme optimized shadows) */
const TiltCard: React.FC<{ children: React.ReactNode; className?: string; intensity?: number; style?: React.CSSProperties }> = ({
  children, className = '', intensity = 10, style: outer,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({});
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ transform: `perspective(900px) rotateX(${(-py * intensity).toFixed(2)}deg) rotateY(${(px * intensity).toFixed(2)}deg) translateZ(6px)` });
  };
  const onLeave = () => setTilt({ transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)' });
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ transition: 'transform 200ms ease-out', willChange: 'transform', ...outer, ...tilt }}
      className={className}>
      {children}
    </div>
  );
};

/** Animated counter */
const Counter: React.FC<{ target: string; suffix?: string }> = ({ target, suffix = '' }) => {
  const [val, setVal] = useState('0');
  const float = target.includes('.');
  useEffect(() => {
    const end = parseFloat(target); const step = end / 80; let cur = 0;
    const id = setInterval(() => {
      cur += step;
      if (cur >= end) { setVal(float ? end.toFixed(1) : String(Math.round(end))); clearInterval(id); }
      else setVal(float ? cur.toFixed(1) : String(Math.floor(cur)));
    }, 18);
    return () => clearInterval(id);
  }, [target, float]);
  return <><span>{val}</span>{suffix}</>;
};

/** Animated bar */
const AnimatedBar: React.FC<{ pct: number; color: string; delay?: number }> = ({ pct, color, delay = 0 }) => {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => setWidth(pct), delay); obs.disconnect(); }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [pct, delay]);
  return (
    <div ref={ref} className="h-1 bg-slate-100 rounded-full mt-3 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${width}%`, background: `linear-gradient(to right, ${color}80, ${color})` }} />
    </div>
  );
};

/** Status badge pill (light theme) */
const StatusBadge: React.FC<{ color: string; label: string; ping?: boolean }> = ({ color, label, ping = true }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono tracking-wider"
    style={{ borderColor: `${color}30`, color, background: `${color}08` }}>
    {ping && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
    {label}
  </span>
);

/** Horizontal ticker (light theme) */
const Ticker: React.FC = () => {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="w-full overflow-hidden border-y border-slate-200/70 bg-white/80 backdrop-blur-sm py-2 relative z-20 shadow-sm">
      <div className="flex gap-14 whitespace-nowrap animate-[ticker_50s_linear_infinite]" style={{ width: 'max-content' }}>
        {items.map((item, i) => (
          <span key={i} className="text-[10px] font-mono text-slate-500 tracking-wider shrink-0">
            <span className="text-sky-600 font-bold">SYS</span> {item}
          </span>
        ))}
      </div>
    </div>
  );
};

/** SVG orbit + topology map (optimized for light theme cards) */
const TopologyMap: React.FC = () => {
  const [hover, setHover] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<(TooltipData & { x: number; y: number }) | null>(null);
  const [pulse, setPulse] = useState(0);
  const [orbitAngle, setOrbitAngle] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const ti = setInterval(() => setPulse(n => (n + 1) % STATIONS.length), 1800);
    const to = setInterval(() => setOrbitAngle(a => (a + 0.8) % 360), 30);
    return () => { clearInterval(ti); clearInterval(to); };
  }, []);

  const rad = (deg: number) => deg * Math.PI / 180;
  // LEO orbit ellipse
  const satX = 56 + 38 * Math.cos(rad(orbitAngle));
  const satY = 46 + 22 * Math.sin(rad(orbitAngle));

  const handleNodeEnter = (e: React.MouseEvent, st: typeof STATIONS[0]) => {
    setHover(st.id);
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    setTooltip({
      label: st.label, lat: st.lat, cpu: st.cpu, loss: st.loss, risk: st.risk, color: st.color,
      x: e.clientX - svgRect.left,
      y: e.clientY - svgRect.top,
    });
  };
  const handleNodeLeave = () => { setHover(null); setTooltip(null); };

  return (
    <div className="relative w-full">
      <svg ref={svgRef} viewBox="0 0 112 90" className="w-full h-full">
        {/* Orbit ellipse */}
        <ellipse cx="56" cy="46" rx="38" ry="22" fill="none" stroke="#cbd5e1" strokeWidth="0.4" strokeDasharray="2 1.5" />
        {/* Data packet animations on select links */}
        {LINKS.slice(0, 3).map(([a, b], i) => {
          const s = STATIONS[a], e2 = STATIONS[b];
          return (
            <circle key={`pkt-${i}`} r="0.8" fill="#0284c7" opacity="0.9">
              <animateMotion dur={`${2 + i * 0.7}s`} repeatCount="indefinite"
                path={`M ${s.cx} ${s.cy} L ${e2.cx} ${e2.cy}`} />
            </circle>
          );
        })}
        {/* Links */}
        {LINKS.map(([a, b], i) => {
          const s = STATIONS[a], e2 = STATIONS[b];
          const active = hover === s.id || hover === e2.id || (!hover && i === pulse % LINKS.length);
          return (
            <line key={i} x1={s.cx} y1={s.cy} x2={e2.cx} y2={e2.cy}
              stroke={active ? '#0284c7' : '#e2e8f0'}
              strokeWidth={active ? '0.6' : '0.35'}
              strokeDasharray={active ? '2 1.2' : undefined}
              style={{ transition: 'stroke 400ms, stroke-width 300ms' }} />
          );
        })}
        {/* Satellite */}
        <g>
          <circle cx={satX} cy={satY} r="1.8" fill="#e11d48" opacity="0.95">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.4s" repeatCount="indefinite" />
          </circle>
          {/* LOS line */}
          {satY < 46 && (
            <line x1={satX} y1={satY} x2={STATIONS[0].cx} y2={STATIONS[0].cy}
              stroke="#e11d48" strokeWidth="0.3" strokeDasharray="1.5 1" opacity="0.4" />
          )}
        </g>
        {/* Nodes */}
        {STATIONS.map((st, i) => {
          const active = hover === st.id || i === pulse;
          return (
            <g key={st.id} className="cursor-pointer"
              onMouseEnter={e => handleNodeEnter(e, st)}
              onMouseLeave={handleNodeLeave}>
              {active && (
                <circle cx={st.cx} cy={st.cy} r="6" fill={st.color} opacity="0.10">
                  <animate attributeName="r" values="4;8;4" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.10;0.02;0.10" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={st.cx} cy={st.cy} r={active ? 3.3 : 2.8}
                fill={active ? st.color : '#ffffff'} stroke={st.color}
                strokeWidth={active ? '1.1' : '0.9'}
                style={{ transition: 'all 300ms' }} />
              <text x={st.cx} y={st.cy + 7} textAnchor="middle" fontSize="3.2"
                fill={active ? st.color : '#64748b'} fontFamily="monospace"
                style={{ transition: 'fill 300ms' }}>
                {st.label.split(' ')[0]}
              </text>
            </g>
          );
        })}
        {/* SVG tooltip */}
        {tooltip && (() => {
          const tx = tooltip.x > 70 ? tooltip.x - 48 : tooltip.x + 4;
          const ty = tooltip.y > 60 ? tooltip.y - 36 : tooltip.y + 4;
          return (
            <g transform={`translate(${tx},${ty})`}>
              <rect width="44" height="28" rx="2" fill="#ffffff" stroke={tooltip.color} strokeWidth="0.5" opacity="0.98" />
              <text x="3" y="7" fontSize="3.0" fill={tooltip.color} fontFamily="monospace" fontWeight="bold">{tooltip.label}</text>
              <text x="3" y="13" fontSize="2.8" fill="#475569" fontFamily="monospace">LAT {tooltip.lat}  CPU {tooltip.cpu}</text>
              <text x="3" y="19" fontSize="2.8" fill="#475569" fontFamily="monospace">LOSS {tooltip.loss}  RISK {tooltip.risk}</text>
              <text x="3" y="25" fontSize="2.6" fill="#16a34a" fontFamily="monospace">● NOMINAL</text>
            </g>
          );
        })()}
      </svg>
      <div className="absolute bottom-1 left-1 text-[9px] font-mono text-slate-500 bg-white/90 px-2 py-1 rounded border border-slate-200/60 shadow-sm">
        MPLS MESH · 6 NODES · LEO ORBIT ACTIVE
      </div>
      <div className="absolute top-1 right-1 text-[9px] font-mono text-rose-600 bg-white/90 px-2 py-1 rounded border border-slate-200/60 shadow-sm flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-rose-500 animate-ping" />
        Cartosat-3 LEO
      </div>
    </div>
  );
};

/** Simulated dark terminal block for gorgeous sci-fi tech contrast on the white page */
const LiveTerminal: React.FC = () => {
  const [visibleLines, setVisibleLines] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let i = 0;
        const id = setInterval(() => {
          setVisibleLines(n => n + 1);
          i++;
          if (i >= TERMINAL_LINES.length) clearInterval(id);
        }, 160);
        obs.disconnect();
      }
    }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="bg-[#030712] border border-slate-800 rounded-xl overflow-hidden shadow-lg min-h-[300px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-900 bg-[#090d16]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[10px] font-mono text-slate-400">NOC-COPILOT — bash v5.2</span>
        <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> CONNECTED
        </span>
      </div>
      <div className="p-4 font-mono text-[11px] space-y-1 leading-relaxed">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} className="flex gap-2 animate-[fadeSlideIn_200ms_ease_both]">
            <span style={{ color: line.color }} className="shrink-0 w-4">{line.prefix}</span>
            <span className="text-slate-300">{line.text}</span>
          </div>
        ))}
        {visibleLines < TERMINAL_LINES.length && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sky-400">$</span>
            <span className="w-2 h-4 bg-sky-400/80 animate-[blink_0.8s_step-end_infinite]" />
          </div>
        )}
        {visibleLines >= TERMINAL_LINES.length && (
          <div className="mt-3 p-2 rounded border border-emerald-500/30 bg-emerald-950/20 text-[10px] text-emerald-400 font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Mitigation applied. SDSC-SHAR restored. Risk: 12% ↓
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════ main page ══════════════════════ */
export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('isro-admin');
  const [password, setPassword] = useState('predictive-noc');
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginProgress, setLoginProgress] = useState(0);
  const missionTime = useMissionClock();
  const reveal = useScrollReveal();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    let p = 0;
    const id = setInterval(() => {
      p += Math.random() * 22 + 8;
      if (p >= 100) {
        clearInterval(id);
        setLoginProgress(100);
        setTimeout(() => { localStorage.setItem('noc_is_logged_in', 'true'); onLogin(true); }, 400);
      } else setLoginProgress(Math.min(p, 95));
    }, 120);
  }, [onLogin]);

  return (
    <div className="landing-page-wrapper min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans select-none relative overflow-x-hidden">
      {/* ── backgrounds ── */}
      <ParticleCanvas />
      <MouseSpotlight />
      <div className="fixed inset-0 grid-bg opacity-[30%] z-0 pointer-events-none" />
      <div className="fixed inset-0 scanline opacity-[0.8%] pointer-events-none z-0" />
      <div className="fixed -top-80 -right-80 w-[70rem] h-[70rem] rounded-full pointer-events-none z-0 opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.05) 0%, transparent 65%)' }} />
      <div className="fixed bottom-0 left-0 w-[40rem] h-[40rem] rounded-full pointer-events-none z-0 opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.04) 0%, transparent 65%)' }} />

      {/* ── Header ── */}
      <header className={`fixed top-3 left-0 right-0 z-50 mx-4 max-w-7xl lg:mx-auto border rounded-full px-6 py-2.5 flex justify-between items-center backdrop-blur-xl transition-all duration-300 ${
        scrolled ? 'bg-white/92 border-slate-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.06),0_1.5px_3px_rgba(0,0,0,0.02)]'
                 : 'bg-white/60 border-slate-100/50 shadow-sm'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative p-2 bg-sky-500/10 rounded-full border border-sky-500/30 shrink-0 hover:bg-sky-500/20 transition-colors group">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600 animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white">
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="font-display font-black text-xs sm:text-sm tracking-widest text-slate-800 truncate leading-tight">
              ISRO PRED-NOC
            </div>
            <div className="text-[8px] text-slate-500 font-mono tracking-wider hidden sm:block leading-none mt-0.5">{missionTime}</div>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-3">
          {[
            { label: 'INTERFACE', href: '#interface' },
            { label: 'BENEFITS',  href: '#benefits'  },
            { label: 'FEATURES',  href: '#features'  },
            { label: 'ROADMAP',   href: '#roadmap'   },
          ].map(link => (
            <a key={link.label} href={link.href}
              className="px-3.5 py-1.5 bg-white border border-slate-200 text-[10px] font-mono text-slate-600 font-bold tracking-widest rounded-full transition-all duration-150 shadow-[0_2px_0_#cbd5e1,0_3px_5px_rgba(0,0,0,0.04)] hover:shadow-[0_1px_0_#cbd5e1,0_2px_3px_rgba(0,0,0,0.03)] hover:translate-y-[1px] active:translate-y-[2.5px] active:shadow-none font-bold">
              {link.label}
            </a>
          ))}
          <a href="#login-section"
            className="ml-1 px-4.5 py-1.5 bg-sky-50 border border-sky-200 text-[10px] font-mono text-sky-600 tracking-wider transition-all duration-150 shadow-[0_2px_0_#bae6fd,0_3px_5px_rgba(14,165,233,0.08)] hover:shadow-[0_1px_0_#bae6fd,0_2px_3px_rgba(14,165,233,0.06)] hover:translate-y-[1px] active:translate-y-[2.5px] active:shadow-none flex items-center gap-1.5 font-bold rounded-full">
            LAUNCH CONSOLE <ArrowRight className="w-3 h-3" />
          </a>
        </nav>

        <button onClick={() => setNavOpen(v => !v)}
          className="lg:hidden p-2 text-slate-500 hover:text-sky-600 transition-colors rounded" aria-label="Toggle nav">
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {navOpen && (
        <div className="lg:hidden sticky top-[53px] z-30 bg-white/98 backdrop-blur-xl border-b border-slate-200/60 px-4 py-3 flex flex-col animate-in">
          {[
            { label: 'INTERFACE', href: '#interface' },
            { label: 'BENEFITS',  href: '#benefits'  },
            { label: 'FEATURES',  href: '#features'  },
            { label: 'ROADMAP',   href: '#roadmap'   },
          ].map(link => (
            <a key={link.label} href={link.href} onClick={() => setNavOpen(false)}
              className="text-xs text-slate-600 hover:text-sky-600 font-mono transition-colors flex items-center justify-between py-2.5 border-b border-slate-100 font-bold">
              {link.label} <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </a>
          ))}
          <a href="#login-section" onClick={() => setNavOpen(false)}
            className="mt-3 text-center py-2 bg-sky-500/10 border border-sky-500/30 rounded text-xs font-mono text-sky-600 tracking-wider font-bold">
            LAUNCH CONSOLE
          </a>
        </div>
      )}

      {/* ── Ticker ── */}
      <Ticker />

      {/* ════════════════ HERO ════════════════ */}
      <section className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left copy */}
          <div ref={reveal} className="flex flex-col items-start">
            <div className="mb-5 flex flex-wrap gap-2">
              <StatusBadge color="#059669" label="ALL SYSTEMS NOMINAL" />
              <StatusBadge color="#0284c7" label="6 ROUTERS ONLINE" />
              <StatusBadge color="#7c3aed" label="AI COPILOT READY" />
            </div>

            <TypewriterText words={HERO_WORDS} />

            <p className="mt-6 text-sm sm:text-base text-slate-600 font-mono leading-relaxed max-w-lg">
              Predictive NOC Ground Control Suite. ML-powered, air-gapped NOC copilot for ISRO's mission-critical MPLS tracking
              network — detecting anomalies, predicting failures, and auto-generating Cisco
              IOS remediation scripts before downlink windows close.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#login-section"
                className="group inline-flex items-center justify-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 border border-sky-500/35 px-7 py-3 rounded font-mono font-bold text-xs tracking-wider uppercase no-underline transition-all hover:-translate-y-0.5 active:translate-y-0">
                Access Command Console
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#features"
                className="inline-flex items-center justify-center gap-2 border border-slate-300 hover:border-sky-500/35 hover:bg-slate-100/50 text-slate-500 hover:text-slate-800 px-7 py-3 rounded font-mono text-xs tracking-wider uppercase no-underline transition-all hover:-translate-y-0.5 active:translate-y-0">
                Explore Capabilities
              </a>
            </div>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-5 w-full max-w-lg">
              {STATS.map(({ label, value, suffix, icon: Icon, color }, i) => (
                <div ref={reveal} key={label} className="flex flex-col gap-0.5" style={{ transitionDelay: `${i * 80}ms` }}>
                  <Icon className="w-4 h-4 mb-1.5" style={{ color }} />
                  <div className="font-display font-black text-xl sm:text-2xl" style={{ color }}>
                    <Counter target={value} suffix={suffix} />
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono uppercase tracking-wider leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: topology + alerts */}
          <div className="flex flex-col gap-4">
            <TiltCard intensity={4}
              className="bg-white/80 border border-slate-200/80 rounded-xl p-4 shadow-[0_15px_45px_-15px_rgba(0,0,0,0.06)] backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-sky-600 font-mono uppercase tracking-widest flex items-center gap-2">
                  <Radar className="w-3.5 h-3.5" /> Live ISRO Ground Station Mesh
                </span>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                </div>
              </div>
              <TopologyMap />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'AVG LATENCY', val: '16ms', color: '#0284c7' },
                  { label: 'PACKET LOSS', val: '0.08%', color: '#10b981' },
                  { label: 'RISK SCORE',  val: '8%',   color: '#d97706' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-slate-50/80 rounded-lg p-2 text-center border border-slate-200/40">
                    <div className="text-[9px] text-slate-500 font-mono leading-tight">{label}</div>
                    <div className="font-display text-sm font-bold mt-0.5" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
            </TiltCard>

            <TiltCard intensity={3}
              className="bg-white/80 border border-slate-200/80 rounded-xl p-4 shadow-[0_12px_35px_-12px_rgba(0,0,0,0.05)] backdrop-blur-md">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] text-sky-600 font-mono uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> AI Alert Feed
                </span>
                <span className="text-[9px] font-mono text-slate-500">REAL-TIME</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { type: 'ok',   msg: 'ISTRAC-BGL · All metrics nominal',            time: 'now' },
                  { type: 'warn', msg: 'NOC-MUM · Bandwidth drift +18% detected',     time: '2s'  },
                  { type: 'info', msg: 'Cartosat-3 · Entering LEO window @ ISTRAC',   time: '4s'  },
                  { type: 'ok',   msg: 'SDSC-SHAR · Self-heal cleared congestion',    time: '6s'  },
                  { type: 'warn', msg: 'TRACK-PBL · Jitter spike 8.4ms detected',     time: '9s'  },
                ].map((alert, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono py-1.5 border-b border-slate-100 last:border-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: alert.type === 'ok' ? '#10b981' : alert.type === 'warn' ? '#f59e0b' : '#38bdf8' }} />
                    <span className="text-slate-600 flex-1 truncate">{alert.msg}</span>
                    <span className="text-slate-400 shrink-0">{alert.time}</span>
                  </div>
                ))}
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ INTERACTIVE DASHBOARD GALLERY ════════════════ */}
      <section id="interface" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div ref={reveal} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-2.5 text-[10px] font-mono text-sky-600 tracking-wider">
            <Layers className="w-3.5 h-3.5" /> INTERACTIVE SYSTEM SHOWCASE
          </div>
          <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-800">
            NOC Copilot Operational Interface
          </h3>
          <p className="mt-2 text-sm text-slate-600 font-mono max-w-xl mx-auto leading-relaxed">
            Take a visual tour through our live ML forecasting, unsupervised anomaly tracks, and autonomous self-healing engines.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Main Mockup Image */}
          <div ref={reveal} className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-sky-600 font-mono uppercase tracking-wider block mb-2 font-bold">NOC Predictive command Center Mockup</span>
              <img 
                src="/noc_dashboard_mockup.png" 
                alt="ISRO NOC Telemetry Dashboard Interface" 
                className="w-full h-auto max-h-[360px] object-cover rounded-xl border border-slate-100 shadow-inner"
              />
            </div>
            <p className="mt-3 text-[11px] text-slate-500 font-mono leading-normal">
              High-fidelity predictive view displaying real-time ground tracking telemetry metrics, predictive anomaly models, and automated Cisco IOS CLI configuration pushes.
            </p>
          </div>

          {/* Sub Gallery mockups */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div ref={reveal} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-sky-600 font-mono uppercase tracking-wider block mb-1.5 font-bold">OSPF Ground Station Grid</span>
                <img 
                  src="/noc_network_topology.png" 
                  alt="OSPF Ground Station Grid Map" 
                  className="w-full h-32 object-cover rounded-lg border border-slate-150"
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-500 font-mono leading-relaxed">
                Full-mesh underlay routing status mapping interconnect links between ISTRAC, MCF Hassan, and downrange tracking sites.
              </p>
            </div>

            <div ref={reveal} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-sky-600 font-mono uppercase tracking-wider block mb-1.5 font-bold">Live Telemetry Anomaly Streams</span>
                <img 
                  src="/noc_telemetry_example.png" 
                  alt="Live Telemetry Graph Spikes" 
                  className="w-full h-32 object-cover rounded-lg border border-slate-150"
                />
              </div>
              <p className="mt-2 text-[10px] text-slate-500 font-mono leading-relaxed">
                XGBoost ML modeling charts tracking latency drift and packet losses across primary MPLS interfaces.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ WHAT WE ARE SOLVING & BENEFITS ════════════════ */}
      <section id="benefits" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* What We Solve */}
          <div ref={reveal}>
            <div className="inline-flex items-center gap-2 mb-3 text-[10px] font-mono text-rose-600 tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" /> NETWORK VULNERABILITIES RESOLVED
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-800 mb-6">
              Engineering Out Network Degradations
            </h3>
            
            <div className="space-y-5">
              {[
                { title: 'Telemetry Buffer Fragmentation', problem: 'Burst telemetry streams overload traditional FIFO databases, dropping vital downlink indicators.', fix: 'PRAGMA WAL-mode SQLite offloads writing from reading threads, permitting concurrent telemetry storage and 1000x faster count checks.' },
                { title: 'OSPF Link Flapping Cascades', problem: 'Physical fiber micro-flaps force OSPF peers to drop and reconverge, locking router CPU at 99%.', fix: 'Predictive XGBoost foresees flap failures 45 minutes in advance, enabling carrier-delay policies to suppress flap cycles.' },
                { title: 'Manual Troubleshooting Lag', problem: 'DOWN link events trigger manual command lookups, exceeding narrow orbital flight paths.', fix: 'Autonomous root-cause engine maps metrics to instant Cisco IOS CLI scripts, healing connections within 3 seconds.' },
              ].map(({ title, problem, fix }, idx) => (
                <div key={idx} className="bg-white border border-slate-200/50 rounded-xl p-4 shadow-sm hover:border-slate-350 transition-all">
                  <h4 className="text-xs font-bold font-mono text-slate-800 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> {title}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2.5 pt-2 border-t border-slate-100 text-[11px] font-mono leading-relaxed">
                    <div>
                      <span className="text-slate-400 font-bold block uppercase text-[9px] mb-0.5">Vulnerability:</span>
                      <span className="text-slate-500">{problem}</span>
                    </div>
                    <div className="bg-sky-500/5 border border-sky-500/10 p-2 rounded">
                      <span className="text-sky-600 font-bold block uppercase text-[9px] mb-0.5">Predict-NOC Solution:</span>
                      <span className="text-slate-700">{fix}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Benefits */}
          <div ref={reveal} className="flex flex-col h-full justify-between">
            <div>
              <div className="inline-flex items-center gap-2 mb-3 text-[10px] font-mono text-emerald-600 tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" /> QUANTITATIVE OPERATIONAL IMPACTS
              </div>
              <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-800 mb-6">
                System SLA and Reliability Benefits
              </h3>
              <p className="text-sm text-slate-600 font-mono leading-relaxed">
                By combining statistical machine learning with local air-gapped expert guidelines, ISRO's NOC transitions from reactive recovery to proactive network resiliency.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {[
                { title: 'SLA Outages Prevented', val: '92%', detail: 'ML-driven queue re-allocations deflect congestion blocks prior to link degradation.' },
                { title: 'Mean Time to Repair (MTTR)', val: '< 10s', detail: 'Remediation playbooks generate and push CLI scripts in sub-second intervals.' },
                { title: 'Offline SOP Search Lead', val: '97%', detail: 'TF-IDF RAG fetches diagnostic procedures matching metrics instantly.' },
                { title: 'Data Ingestion Rate', val: '120r/m', detail: 'WAL SQLite handles heavy concurrent logging of telemetry stats.' },
              ].map(({ title, val, detail }, idx) => (
                <div key={idx} className="bg-white border border-slate-200/50 rounded-xl p-4 shadow-sm hover:border-slate-350 transition-all flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">{title}</span>
                    <span className="font-display text-2xl font-black text-slate-800 mt-1 block">{val}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-2.5 border-t border-slate-100 pt-2">{detail}</p>
                </div>
              ))}
            </div>
            
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mt-6 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-emerald-600 font-mono uppercase tracking-wider block font-bold">Air-Gapped Compliance</span>
                <p className="text-[10px] text-slate-600 font-mono leading-normal mt-0.5">
                  Predictive NOC Copilot requires **zero external cloud endpoints** for modeling or RAG lookups, operating fully within closed command segments.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ CHALLENGE & TERMINAL ════════════════ */}
      <section id="problem-section" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          <div ref={reveal}>
            <div className="inline-flex items-center gap-2 mb-3 text-[10px] font-mono text-amber-600 tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" /> THE OPERATIONAL CHALLENGE
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-855">
              Why Traditional NOCs{' '}
              <span className="text-rose-600">Fail</span>
              {' '}During{' '}
              <span className="text-sky-600">Launch Windows</span>
            </h3>
            <p className="mt-4 text-sm text-slate-600 font-mono leading-relaxed">
              During critical spacecraft launches and orbital maneuvers, ground tracking
              networks experience ultra-high-frequency packet bursts. Reactive monitoring
              cannot respond fast enough — failures cascade silently before any alert fires.
            </p>
            <div className="mt-6 space-y-4">
              {[
                { icon: WifiOff, color: '#e11d48', title: 'OSPF Link Flapping',
                  desc: 'Millisecond-duration physical link micro-cuts trigger false OSPF failovers, cascading recalculation storms.' },
                { icon: Cpu,     color: '#d97706', title: 'Device CPU/Memory Overload',
                  desc: 'Router control-plane CPU spikes to 99% under burst telemetry, causing routing-daemon timeouts.' },
                { icon: Wifi,    color: '#7c3aed', title: 'Packet Loss Outages',
                  desc: 'Loss exceeding 5% disrupts real-time downlink streams — unrecoverable within a limited orbital window.' },
              ].map(({ icon: Icon, color, title, desc }, i) => (
                <div ref={reveal} key={title} className="flex gap-4 p-4 bg-white/70 border border-slate-200/60 rounded-xl shadow-sm hover:border-slate-350 transition-all duration-300 group"
                  style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="p-2.5 rounded-lg shrink-0 mt-0.5 group-hover:scale-105 transition-transform duration-300"
                    style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wide">{title}</div>
                    <div className="text-[11px] text-slate-500 font-mono leading-relaxed mt-1">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div ref={reveal}><LiveTerminal /></div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ FEATURES ════════════════ */}
      <section id="features" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div ref={reveal} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-3 text-[10px] font-mono text-sky-600 tracking-wider">
            <Zap className="w-3.5 h-3.5" /> PLATFORM CAPABILITIES
          </div>
          <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-800">
            Six-Phase Intelligence Engine
          </h3>
          <p className="mt-3 text-sm text-slate-600 font-mono max-w-xl mx-auto leading-relaxed">
            Every phase adds a layer of intelligence — from raw telemetry to fully autonomous self-healing.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, phase, title, color, bar, desc }, i) => (
            <TiltCard key={title} intensity={6}
              className="group bg-white/70 border border-slate-200/60 rounded-xl p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-300 cursor-default"
              style={{ ['--c' as string]: color }}>
              <div ref={reveal} style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2.5 rounded-lg group-hover:scale-105 transition-transform duration-300"
                    style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border"
                    style={{ color, borderColor: `${color}30`, background: `${color}08` }}>
                    PHASE {phase}
                  </span>
                </div>
                <h4 className="font-display font-bold text-sm uppercase text-slate-800 mb-2">{title}</h4>
                <p className="text-[11px] text-slate-500 font-mono leading-relaxed">{desc}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[9px] font-mono text-slate-400">ACCURACY</span>
                  <span className="text-[9px] font-mono font-bold" style={{ color }}>{bar}%</span>
                </div>
                <AnimatedBar pct={bar} color={color} delay={i * 80} />
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ SYSTEM HEALTH STRIP ════════════════ */}
      <section className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div ref={reveal} className="bg-white/70 border border-slate-200/60 rounded-xl p-6 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-sky-600">System Health Dashboard</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />LIVE
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'ISTRAC Bangalore',    cpu: 28, mem: 44, lat: 14, risk: 5,  color: '#0284c7' },
              { label: 'SDSC Sriharikota',    cpu: 35, mem: 51, lat: 19, risk: 12, color: '#10b981' },
              { label: 'MCF Hassan',          cpu: 41, mem: 48, lat: 21, risk: 8,  color: '#7c3aed' },
              { label: 'NOC Delhi',           cpu: 52, mem: 63, lat: 16, risk: 18, color: '#d97706' },
              { label: 'NOC Mumbai',          cpu: 29, mem: 42, lat: 13, risk: 7,  color: '#0284c7' },
              { label: 'TRACK Port Blair',    cpu: 44, mem: 56, lat: 24, risk: 22, color: '#e11d48' },
            ].map(({ label, cpu, mem, lat, risk, color }, i) => (
              <div key={label} className="bg-slate-50 border border-slate-200/50 rounded-lg p-3 hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-slate-800 font-bold truncate">{label}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}10` }}>
                    RISK {risk}%
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { key: 'CPU', val: cpu, max: 100, unit: '%' },
                    { key: 'MEM', val: mem, max: 100, unit: '%' },
                    { key: 'LAT', val: lat, max: 60,  unit: 'ms' },
                  ].map(({ key, val, max, unit }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-slate-400 w-6 shrink-0">{key}</span>
                      <div className="flex-1 h-1 bg-slate-200/70 rounded-full overflow-hidden">
                        <AnimatedBar pct={(val / max) * 100} color={color} delay={i * 60} />
                      </div>
                      <span className="text-[8px] font-mono w-8 text-right shrink-0" style={{ color }}>{val}{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ FUTURE AI INTEGRATION & ROADMAP ════════════════ */}
      <section id="roadmap" className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div ref={reveal}>
            <div className="inline-flex items-center gap-2 mb-3 text-[10px] font-mono text-purple-600 tracking-wider">
              <GitBranch className="w-3.5 h-3.5" /> FUTURE AI & SPACE SYSTEMS INTEGRATION
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-wide uppercase text-slate-800">
              Autonomous AI Roadmaps
            </h3>
            <p className="mt-4 text-sm text-slate-600 font-mono leading-relaxed">
              Predictive NOC Copilot is architected to scale from pure simulation modeling into live hardware routing arrays, incorporating low-Earth-orbit telemetry calculations.
            </p>
            
            <div className="space-y-4 mt-6">
              {[
                { title: 'Local Groq LLaMA3 Agent loops', detail: 'Deploying high-speed local llama3 execution layers within ground stations to bypass cloud network dependencies during downlink slots.' },
                { title: 'Doppler LEO Link Attenuation Forecasts', detail: 'Analyzing per-pass satellite Doppler offsets and weather attenuation metrics to dynamically raise tunnel bandwidths.' },
                { title: 'Proactive SNMP Config Push', detail: 'Automating direct SNMP/SSH updates using netmiko directly from Phase 6 self-healing recommendations.' }
              ].map(({ title, detail }, idx) => (
                <div key={idx} className="bg-white border border-slate-200/50 p-3 rounded-lg shadow-sm">
                  <span className="text-xs font-bold text-slate-850 block font-mono">⚡ {title}</span>
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block leading-normal">{detail}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 rounded-xl border border-sky-500/20 bg-sky-500/5">
              <div className="text-[10px] font-mono text-sky-600 uppercase tracking-wider mb-2">Stack</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'XGBoost v3.2',    color: '#7c3aed' },
                  { label: 'FastAPI 0.111',    color: '#0284c7' },
                  { label: 'React 18',         color: '#10b981' },
                  { label: 'Isolation Forest', color: '#d97706' },
                  { label: 'TF-IDF RAG',       color: '#0284c7' },
                  { label: 'Groq LLaMA3',      color: '#7c3aed' },
                  { label: 'Gemini 2.5',       color: '#10b981' },
                  { label: 'Vite + TS',        color: '#d97706' },
                ].map(({ label, color }) => (
                  <span key={label} className="px-2 py-0.5 rounded text-[10px] font-mono border"
                    style={{ color, borderColor: `${color}25`, background: `${color}08` }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            {[
              { phase: 'Q3 2026', title: 'Netmiko Live Push',       desc: 'Direct SSH config-push to production Cisco IOS routers via Netmiko automation.', done: false, color: '#0284c7' },
              { phase: 'Q4 2026', title: 'SNMP v3 Integration',     desc: 'Native polling of real hardware MIBs alongside simulation data streams.', done: false, color: '#7c3aed' },
              { phase: 'Q1 2027', title: 'LEO Doppler Analytics',   desc: 'Per-pass SNR degradation prediction for Cartosat and RISAT series missions.', done: false, color: '#10b981' },
              { phase: 'Q2 2027', title: 'Multi-Mission Dashboard', desc: 'Unified NOC view spanning Gaganyaan, NISAR, Aditya-L1, and future launches.', done: false, color: '#d97706' },
            ].map(({ phase, title, desc, done, color }, i) => (
              <div ref={reveal} key={title}
                className="flex gap-4 p-4 bg-white/70 border border-slate-200/60 rounded-xl shadow-sm hover:border-slate-350 transition-all group"
                style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                  <div className={`w-3 h-3 rounded-full border-2 transition-all duration-300 group-hover:scale-110 ${
                    done ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent'}`}
                    style={{ borderColor: color }} />
                  {i < 3 && <div className="w-px flex-1 min-h-[14px]" style={{ background: `${color}20` }} />}
                </div>
                <div>
                  <div className="text-[9px] font-mono tracking-wider mb-0.5" style={{ color }}>{phase}</div>
                  <div className="text-xs font-bold text-slate-800 font-mono">{title}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-6 my-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* ════════════════ LOGIN ════════════════ */}
      <section id="login-section" className="relative z-20 w-full max-w-md mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div ref={reveal} className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2 text-[10px] font-mono text-sky-600 tracking-wider">
            <Lock className="w-3.5 h-3.5" /> SECURE ACCESS PORTAL
          </div>
          <h3 className="font-display font-black text-xl tracking-wide uppercase text-slate-800">Command Console</h3>
          <p className="mt-1 text-[11px] text-slate-500 font-mono">Ground Control Authentication Gateway</p>
        </div>

        <TiltCard intensity={4}
          className="bg-white border border-slate-200/80 rounded-xl shadow-lg overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20">
                <Shield className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <div className="text-xs font-bold font-display uppercase tracking-wider text-slate-800">Secure Operations Enclave</div>
                <div className="text-[9px] font-mono text-slate-500 tracking-wider">CLEARANCE LEVEL 4 · {missionTime || '––'}</div>
              </div>
              <div className="ml-auto flex items-center gap-1 text-emerald-600 text-[9px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute" />
                </span>
                ONLINE
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {[
                { label: 'Operator ID', type: 'text', value: username, set: setUsername, placeholder: 'e.g. isro-admin' },
                { label: 'Passkey Deck', type: 'password', value: password, set: setPassword, placeholder: '••••••••••••' },
              ].map(({ label, type, value, set, placeholder }) => (
                <div key={label}>
                  <label className="block text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1.5">{label}</label>
                  <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder} required
                    className="w-full bg-slate-50/80 border border-slate-200 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-800 outline-none focus:border-sky-500/70 focus:bg-white transition-all placeholder:text-slate-300" />
                </div>
              ))}

              {/* Progress bar (shows during login) */}
              {loginLoading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-mono text-slate-500">
                    <span>AUTHENTICATING…</span><span>{Math.round(loginProgress)}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${loginProgress}%`, background: 'linear-gradient(to right, rgba(14,165,233,0.6), #0284c7)' }} />
                  </div>
                </div>
              )}

              <button type="submit" disabled={loginLoading}
                className="relative overflow-hidden bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-75 text-sky-600 border border-sky-500/30 py-3 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed group">
                <span className={`flex items-center justify-center gap-2 transition-opacity ${loginLoading ? 'opacity-0' : 'opacity-100'}`}>
                  AUTHENTICATE ACCESS
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </span>
                {loginLoading && (
                  <span className="absolute inset-0 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> VERIFYING CREDENTIALS…
                  </span>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-150 flex items-center justify-between text-[9px] font-mono flex-wrap gap-2">
              <span className="text-slate-500">SECURITY LEVEL 4 · AES-256 ENCRYPTED</span>
              <div className="flex items-center gap-1.5 text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />ADC KEYCHAIN ACTIVE
              </div>
            </div>
          </div>
        </TiltCard>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-slate-200/80 px-4 sm:px-6 py-6 bg-white relative z-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Radio className="w-4 h-4 text-sky-600 opacity-60" />
            <span className="text-[10px] text-slate-500 font-mono">
              © 2026 INDIAN SPACE RESEARCH ORGANISATION · PREDICTIVE NOC COMMAND GATEWAY
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-slate-500">{missionTime}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};