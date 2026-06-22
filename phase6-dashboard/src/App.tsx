import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Clock, Wifi, WifiOff,
  Server, Radio, Send, RefreshCw, ShieldCheck, Zap, Terminal,
  ChevronDown, ChevronUp,
  TrendingUp, BarChart2, BookOpen, Globe
} from 'lucide-react';

import './index.css';

const API = 'http://127.0.0.1:8001';
const WS_URL = 'ws://127.0.0.1:8001/ws/ph1/stream';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TopoNode {
  id: string; name: string; role: string; criticality: string;
  status: 'green' | 'yellow' | 'red'; failure_label: number;
  latency: number; packet_loss: number; bandwidth: number; cpu: number;
  link_status: number; downstream: string[]; services: string[];
}
interface TopoEdge { from: string; to: string; label: string; }
interface Topology { nodes: TopoNode[]; edges: TopoEdge[]; }

interface SelfHeal {
  router_id: string; router_name: string; role: string;
  status: string; priority: string; priority_color: string;
  risk_score: number; predicted_failure: string; time_to_failure: string | null;
  root_cause: string; confidence_score: number;
  latest_metrics: Record<string, number>;
  failure_type: string; impact_analysis: string[];
  mitigation_steps: string[]; cli_fix: string;
  automation_script: string; estimated_fix_minutes: number;
  auto_applicable: boolean; services: string[]; backup_path: string;
}

interface Incident {
  id: number; router_id: string; router_name: string;
  failure_type: string; severity: string; started_at: string;
  resolved_at: string | null; description: string;
}

// ─── Node Positions (SVG map) ─────────────────────────────────────────────────
const NODE_POS: Record<string, { x: number; y: number }> = {
  'ISTRAC-BGL': { x: 300, y: 220 },
  'SDSC-SHAR':  { x: 470, y: 120 },
  'MCF-HSN':    { x: 130, y: 120 },
  'NOC-DEL':    { x: 470, y: 340 },
  'NOC-MUM':    { x: 130, y: 340 },
  'TRACK-PBL':  { x: 600, y: 440 },
};

const STATUS_COLOR: Record<string, string> = {
  green: '#10b981', yellow: '#f59e0b', red: '#ef4444',
};

// ─── Utility ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}

function riskColor(score: number) {
  if (score >= 80) return '#ef4444';
  if (score >= 50) return '#f59e0b';
  if (score >= 30) return '#60a5fa';
  return '#10b981';
}

function priorityBadgeClass(p: string) {
  if (p.includes('P1')) return 'badge badge-red';
  if (p.includes('P2')) return 'badge badge-yellow';
  if (p.includes('P3')) return 'badge badge-blue';
  return 'badge badge-green';
}

// ─── Network Topology SVG ─────────────────────────────────────────────────────
function NetworkTopology({ topology, selected, onSelect }: {
  topology: Topology | null; selected: string | null; onSelect: (id: string) => void;
}) {
  if (!topology) return (
    <div style={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5a7a' }}>
      <RefreshCw size={20} className="spin" style={{ marginRight: 8 }} /> Loading topology...
    </div>
  );

  const nodeMap = Object.fromEntries(topology.nodes.map(n => [n.id, n]));

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox="0 0 730 500" style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0d1828" strokeWidth="0.5" />
          </pattern>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="730" height="500" fill="url(#grid)" />

        {/* Edges */}
        {topology.edges.map((e, i) => {
          const from = NODE_POS[e.from]; const to = NODE_POS[e.to];
          if (!from || !to) return null;
          const fromNode = nodeMap[e.from]; const toNode = nodeMap[e.to];
          const isImpacted = fromNode?.status !== 'green' || toNode?.status !== 'green';
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isImpacted ? '#ef444440' : '#1e4a7a50'}
                strokeWidth={isImpacted ? 2 : 1.5}
                strokeDasharray={isImpacted ? '6 3' : undefined}
              />
              <text x={mid.x} y={mid.y - 5} fill="#1e3a5f" fontSize={8}
                textAnchor="middle" fontFamily="var(--mono)">{e.label}</text>
            </g>
          );
        })}

        {/* Nodes */}
        {topology.nodes.map(node => {
          const pos = NODE_POS[node.id];
          if (!pos) return null;
          const isSelected = selected === node.id;
          const color = STATUS_COLOR[node.status] || '#6b7280';
          const glowFilter = node.status === 'red' ? 'url(#glow-red)' : node.status === 'green' ? 'url(#glow-green)' : undefined;

          return (
            <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(node.id)}>
              {/* Selection ring */}
              {isSelected && (
                <circle cx={pos.x} cy={pos.y} r={30} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" opacity={0.7} />
              )}
              {/* Node circle */}
              <circle cx={pos.x} cy={pos.y} r={22} fill="#0a1124" stroke={color}
                strokeWidth={isSelected ? 3 : 2} filter={glowFilter} />
              {/* Status dot */}
              <circle cx={pos.x + 15} cy={pos.y - 15} r={5} fill={color} />
              {/* Icon letter */}
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill={color}
                fontSize={11} fontWeight={800} fontFamily="var(--mono)">
                {node.id.split('-')[0].slice(0, 3)}
              </text>
              {/* Label */}
              <text x={pos.x} y={pos.y + 38} textAnchor="middle" fill="#94a3b8"
                fontSize={9} fontFamily="var(--sans)" fontWeight={600}>
                {node.name.split(' ').slice(0, 2).join(' ')}
              </text>
              {/* Metric pill */}
              <rect x={pos.x - 22} y={pos.y + 44} width={44} height={13}
                rx={4} fill="#0d1828" stroke="#1a2744" strokeWidth={0.5} />
              <text x={pos.x} y={pos.y + 53} textAnchor="middle" fill="#64748b"
                fontSize={7.5} fontFamily="var(--mono)">
                {node.cpu}%CPU · {node.latency}ms
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 0', marginTop: 4 }}>
        {[['#10b981', 'Operational'], ['#f59e0b', 'Degraded'], ['#ef4444', 'Critical/Down']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#64748b' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c as string }} />
            {l}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#334155', fontFamily: 'var(--mono)' }}>
          Click node to inspect
        </div>
      </div>
    </div>
  );
}

// ─── Prediction Panel ─────────────────────────────────────────────────────────
function PredictionPanel({ data }: { data: Record<string, SelfHeal> | null }) {
  if (!data) return <div style={{ color: '#4a5a7a', padding: 20, textAlign: 'center' }}><RefreshCw size={16} className="spin" /></div>;
  const routers = Object.values(data).sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 60px', gap: 8, padding: '0 0 8px 0',
        fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
        borderBottom: '1px solid #0d1828' }}>
        <span>Router</span><span>Risk</span><span>ETA</span><span>Status</span>
      </div>
      {routers.map(r => {
        const rc = riskColor(r.risk_score);
        const eta = r.time_to_failure || (r.risk_score < 30 ? 'Safe' : '>60min');
        return (
          <div key={r.router_id} style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 70px 60px',
            gap: 8, padding: '9px 0', borderBottom: '1px solid #0a1020',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{r.router_name}</div>
              <div style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--mono)', marginTop: 1 }}>
                {r.role.split(' ').slice(0, 2).join(' ')} · CPU {r.latest_metrics.cpu}%
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: rc }}>
                  {r.risk_score.toFixed(0)}%
                </span>
              </div>
              <div className="risk-bar-track">
                <div className="risk-bar-fill" style={{ width: `${r.risk_score}%`, background: rc }} />
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: r.time_to_failure ? rc : '#10b981' }}>
              {eta}
            </div>
            <div>
              <span className={priorityBadgeClass(r.priority)}>
                {r.status === 'NORMAL' ? 'OK' : r.status.slice(0, 4)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Incident Timeline ────────────────────────────────────────────────────────
function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  const severityColor: Record<string, string> = {
    CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#3b82f6'
  };
  const typeIcon: Record<string, string> = {
    'Congestion': '🔴', 'Overload': '🟠', 'Flapping': '🟡', 'Link Down': '⛔',
    'Normal': '🟢', 'MPLS Congestion': '🔴', 'Device CPU/Memory Overload': '🟠',
  };

  if (!incidents.length) return (
    <div style={{ color: '#334155', textAlign: 'center', padding: 20, fontSize: 12 }}>
      ✅ No active incidents
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {incidents.slice(0, 12).map((inc, i) => (
        <div key={inc.id || i} style={{
          display: 'flex', gap: 10, padding: '8px 0',
          borderBottom: '1px solid #0a1020', position: 'relative'
        }}>
          {/* Timeline line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
              background: severityColor[inc.severity] || '#4a5a7a',
              boxShadow: `0 0 6px ${severityColor[inc.severity] || '#4a5a7a'}60`
            }} />
            {i < incidents.length - 1 && (
              <div style={{ width: 1, flex: 1, background: '#0d1828', marginTop: 3 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1', lineHeight: 1.3 }}>
                {typeIcon[inc.failure_type] || '⚪'} {inc.failure_type}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#334155', flexShrink: 0 }}>
                {fmtTime(inc.started_at)}
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
              {inc.router_name} · {inc.description?.slice(0, 60)}
            </div>
            {!inc.resolved_at && (
              <span className="badge badge-red" style={{ marginTop: 3 }}>ACTIVE</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Self-Healing Panel ────────────────────────────────────────────────────────
function SelfHealingPanel({ data, selectedId }: { data: Record<string, SelfHeal> | null; selectedId: string | null }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!data) return <div style={{ color: '#4a5a7a', padding: 20, textAlign: 'center' }}><RefreshCw size={16} className="spin" /></div>;

  const routers = Object.values(data)
    .sort((a, b) => {
      const pri: Record<string, number> = { 'P1-CRITICAL': 0, 'P2-HIGH': 1, 'P3-MEDIUM': 2, 'P4-NORMAL': 3 };
      return (pri[a.priority] ?? 4) - (pri[b.priority] ?? 4);
    })
    .filter(r => selectedId ? r.router_id === selectedId : true);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {routers.map(r => {
        const isExp = expanded[r.router_id];
        const isActive = r.priority !== 'P4-NORMAL';

        return (
          <div key={r.router_id} className="panel" style={{
            borderColor: r.priority === 'P1-CRITICAL' ? '#ef444430'
              : r.priority === 'P2-HIGH' ? '#f59e0b30' : '#1a2744'
          }}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: '#060c1a',
              cursor: 'pointer'
            }} onClick={() => setExpanded(p => ({ ...p, [r.router_id]: !isExp }))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: r.priority === 'P1-CRITICAL' ? '#ef4444'
                    : r.priority === 'P2-HIGH' ? '#f59e0b'
                    : r.priority === 'P3-MEDIUM' ? '#3b82f6' : '#10b981',
                  boxShadow: isActive ? `0 0 8px ${riskColor(r.risk_score)}` : undefined
                }} />
                <div>
                  <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 13 }}>{r.router_name}</span>
                  <span style={{ color: '#334155', fontSize: 10, marginLeft: 8, fontFamily: 'var(--mono)' }}>
                    {r.router_id}
                  </span>
                </div>
                <span className={priorityBadgeClass(r.priority)}>{r.priority}</span>
                {r.time_to_failure && (
                  <span className="badge badge-red">⏱ {r.time_to_failure}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800, color: riskColor(r.risk_score) }}>
                  {r.risk_score.toFixed(0)}% risk
                </span>
                {isExp ? <ChevronUp size={14} color="#4a5a7a" /> : <ChevronDown size={14} color="#4a5a7a" />}
              </div>
            </div>

            {/* Expanded detail */}
            {isExp && (
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }} className="slide-up">

                {/* Metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {[
                    ['Latency', r.latest_metrics.latency + 'ms'],
                    ['Loss', r.latest_metrics.packet_loss + '%'],
                    ['BW', r.latest_metrics.bandwidth + '%'],
                    ['CPU', r.latest_metrics.cpu + '%'],
                    ['Link', r.latest_metrics.link_status === 1 ? 'UP' : 'DOWN'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: '#060c1a', border: '1px solid #0d1828', borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Impact analysis */}
                {r.impact_analysis.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 6, textTransform: 'uppercase' }}>
                      ⚠ Impact Analysis
                    </div>
                    {r.impact_analysis.map((item, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
                        <span style={{ color: '#4a5a7a' }}>→</span>{item}
                      </div>
                    ))}
                  </div>
                )}

                {/* Mitigation steps */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 6, textTransform: 'uppercase' }}>
                    ⚡ Mitigation Plan ({r.estimated_fix_minutes > 0 ? `~${r.estimated_fix_minutes}min` : 'N/A'})
                    {r.auto_applicable && (
                      <span className="badge badge-green" style={{ marginLeft: 8 }}>AUTO-APPLICABLE</span>
                    )}
                  </div>
                  {r.mitigation_steps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 11, color: '#94a3b8' }}>
                      <span style={{ color: '#3b82f6', fontFamily: 'var(--mono)', flexShrink: 0, fontSize: 10, marginTop: 1 }}>
                        {i + 1}.
                      </span>
                      {s}
                    </div>
                  ))}
                </div>

                {/* CLI Fix */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                      <Terminal size={10} style={{ marginRight: 4 }} />
                      Cisco IOS Automation Script
                    </div>
                    <button onClick={() => handleCopy(r.cli_fix, r.router_id + '-cli')}
                      style={{ background: 'none', border: '1px solid #1a2744', borderRadius: 4,
                        padding: '2px 8px', cursor: 'pointer', fontSize: 9, color: '#4a5a7a',
                        fontFamily: 'var(--mono)' }}>
                      {copiedId === r.router_id + '-cli' ? '✓ Copied' : 'Copy CLI'}
                    </button>
                  </div>
                  <pre style={{
                    background: '#020817', border: '1px solid #0d1828', borderRadius: 6,
                    padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 10,
                    color: '#34d399', overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.6, maxHeight: 200
                  }}>
                    {r.cli_fix}
                  </pre>
                </div>

                {/* Python automation */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>
                      Python Automation Script
                    </div>
                    <button onClick={() => handleCopy(r.automation_script, r.router_id + '-py')}
                      style={{ background: 'none', border: '1px solid #1a2744', borderRadius: 4,
                        padding: '2px 8px', cursor: 'pointer', fontSize: 9, color: '#4a5a7a',
                        fontFamily: 'var(--mono)' }}>
                      {copiedId === r.router_id + '-py' ? '✓ Copied' : 'Copy Script'}
                    </button>
                  </div>
                  <pre style={{
                    background: '#020817', border: '1px solid #0d1828', borderRadius: 6,
                    padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 10,
                    color: '#a78bfa', overflowX: 'auto', whiteSpace: 'pre', lineHeight: 1.6, maxHeight: 200
                  }}>
                    {r.automation_script}
                  </pre>
                </div>

                {/* Backup path */}
                <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--mono)', padding: '4px 8px',
                  background: '#060c1a', border: '1px solid #0d1828', borderRadius: 4 }}>
                  🔄 Backup: {r.backup_path}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────
interface Msg { role: 'user' | 'ai'; text: string; ts: string; }

function AIChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: 'ai',
    text: '**ISRO NOC AI Assistant**\n\nAsk me about network status, failure predictions, or request Cisco CLI remediation commands.\n\n**Try:** "Show devices likely to fail today" or "Why is Port Blair unstable?"',
    ts: new Date().toISOString()
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const QUICK = [
    'Show devices likely to fail today',
    'What is the network status?',
    'Fix MPLS congestion on ISTRAC',
    'How to stop link flapping?',
  ];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (q: string) => {
    if (!q.trim() || loading) return;
    setMsgs(p => [...p, { role: 'user', text: q, ts: new Date().toISOString() }]);
    setInput(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/ph5/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const d = await res.json();
      setMsgs(p => [...p, { role: 'ai', text: d.answer, ts: d.timestamp }]);
    } catch {
      setMsgs(p => [...p, { role: 'ai', text: '**Error:** Could not reach AI engine. Ensure the backend is running on port 8001.', ts: new Date().toISOString() }]);
    } finally { setLoading(false); }
  };

  // Minimal inline markdown render
  const renderText = (t: string) => t.split('\n').map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**'))
      return <div key={i} style={{ fontWeight: 800, color: '#f1f5f9', marginTop: i > 0 ? 8 : 0 }}>{line.slice(2, -2)}</div>;
    if (line.startsWith('• ') || line.startsWith('- ') || /^\d+\./.test(line))
      return <div key={i} style={{ color: '#94a3b8', paddingLeft: 10, paddingTop: 2 }}>
        <span style={{ color: '#3b82f6' }}>{line.match(/^\d+\./) ? line.match(/^\d+\./)?.[0] : '•'}</span> {line.replace(/^[•-]\s|^\d+\.\s/, '')}
      </div>;
    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
    return <div key={i} style={{ color: '#94a3b8', lineHeight: 1.7 }}>{line}</div>;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: 9, color: '#1e3a5f', marginBottom: 3, fontFamily: 'var(--mono)' }}>
              {m.role === 'user' ? 'YOU' : '◆ COPILOT'} · {fmtTime(m.ts)}
            </div>
            <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'} style={{ fontSize: 11 }}>
              {renderText(m.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble-ai" style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <RefreshCw size={12} className="spin" /> Analyzing telemetry and knowledge base...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 0' }}>
        {QUICK.map((q, i) => (
          <button key={i} onClick={() => send(q)} disabled={loading}
            style={{ background: '#060c1a', border: '1px solid #1a2744', borderRadius: 4,
              padding: '3px 8px', fontSize: 9, color: '#4a5a7a', cursor: 'pointer',
              fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
          placeholder='Ask AI: "Show devices likely to fail today"...'
          disabled={loading}
          style={{
            flex: 1, background: '#060c1a', border: '1px solid #1a2744',
            borderRadius: 6, padding: '8px 12px', color: '#e2e8f0',
            fontSize: 11, fontFamily: 'var(--sans)', outline: 'none'
          }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: loading || !input.trim() ? '#0d1828' : '#2563eb', border: 'none', cursor: 'pointer', color: '#fff' }}>
          {loading ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}

// ─── Node Inspector Sidebar ───────────────────────────────────────────────────
function NodeInspector({ node, selfheal }: { node: TopoNode | null; selfheal: SelfHeal | null }) {
  if (!node) return (
    <div style={{ padding: 16, color: '#1e3a5f', fontSize: 11, textAlign: 'center', marginTop: 40 }}>
      Click a node on the topology map to inspect it
    </div>
  );
  const sh = selfheal;

  return (
    <div className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Node header */}
      <div style={{
        background: '#060c1a', border: `1px solid ${STATUS_COLOR[node.status]}30`,
        borderRadius: 8, padding: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[node.status],
            boxShadow: `0 0 8px ${STATUS_COLOR[node.status]}`
          }} />
          <span style={{ fontWeight: 800, fontSize: 14, color: '#f1f5f9' }}>{node.name}</span>
        </div>
        <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--mono)' }}>{node.id} · {node.role}</div>
        <div style={{ fontSize: 9, color: '#1e3a5f', marginTop: 4 }}>
          Criticality: <span style={{ color: node.criticality === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>{node.criticality}</span>
        </div>
      </div>

      {/* Live metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          { label: 'Latency', value: `${node.latency} ms`, color: node.latency > 100 ? '#ef4444' : '#10b981' },
          { label: 'Packet Loss', value: `${node.packet_loss}%`, color: node.packet_loss > 1 ? '#ef4444' : '#10b981' },
          { label: 'Bandwidth', value: `${node.bandwidth}%`, color: node.bandwidth > 85 ? '#f59e0b' : '#10b981' },
          { label: 'CPU', value: `${node.cpu}%`, color: node.cpu > 80 ? '#ef4444' : '#10b981' },
        ].map(m => (
          <div key={m.label} style={{ background: '#060c1a', border: '1px solid #0d1828', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Services */}
      <div>
        <div style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>Active Services</div>
        {node.services.map((s, i) => (
          <div key={i} style={{ fontSize: 10, color: '#475569', padding: '2px 0', display: 'flex', gap: 5 }}>
            <span style={{ color: '#10b981' }}>◆</span>{s}
          </div>
        ))}
      </div>

      {/* AI risk */}
      {sh && sh.risk_score > 0 && (
        <div style={{ background: '#060c1a', border: '1px solid #1a2744', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>AI Risk Assessment</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: riskColor(sh.risk_score) }}>
              {sh.risk_score.toFixed(0)}%
            </span>
            {sh.time_to_failure && (
              <span style={{ fontSize: 10, color: '#ef4444', fontFamily: 'var(--mono)' }}>⏱ {sh.time_to_failure}</span>
            )}
          </div>
          <div className="risk-bar-track">
            <div className="risk-bar-fill" style={{ width: `${sh.risk_score}%`, background: riskColor(sh.risk_score) }} />
          </div>
          {sh.predicted_failure !== 'Normal' && sh.predicted_failure && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
              Predicted: <strong style={{ color: riskColor(sh.risk_score) }}>{sh.predicted_failure}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [selfheal, setSelfheal] = useState<Record<string, SelfHeal> | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [wsConnected, setWsConnected] = useState(false);
  const [activeSection, setActiveSection] = useState<'selfheal' | 'chat'>('selfheal');
  const [criticalCount, setCriticalCount] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [topoRes, shRes, incRes] = await Promise.all([
        fetch(`${API}/api/ph6/topology`),
        fetch(`${API}/api/ph6/selfheal`),
        fetch(`${API}/api/ph1/incidents?limit=15`),
      ]);
      if (topoRes.ok) setTopology(await topoRes.json());
      if (shRes.ok) {
        const shData = await shRes.json();
        setSelfheal(shData);
        const crit = Object.values(shData as Record<string, SelfHeal>).filter(
          (r: SelfHeal) => r.status === 'CRITICAL' || r.priority === 'P1-CRITICAL'
        ).length;
        setCriticalCount(crit);
      }
      if (incRes.ok) setIncidents(await incRes.json());
      setLastUpdate(new Date().toLocaleTimeString('en-IN'));
    } catch (e) { console.error('Fetch error:', e); }
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      fetchAll();
    }, 0);
    const t = setInterval(fetchAll, 8000);

    // WebSocket for real-time updates
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = () => { /* triggers on any telemetry push — refetch */ fetchAll(); };
    };
    connect();
    return () => {
      clearTimeout(initTimer);
      clearInterval(t);
      ws?.close();
    };
  }, [fetchAll]);

  const selectedNodeData = topology?.nodes.find(n => n.id === selectedNode) ?? null;
  const selectedSelfheal = selfheal && selectedNode ? selfheal[selectedNode] ?? null : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ─── Top Bar ─── */}
      <header style={{
        background: '#060c1a', borderBottom: '1px solid #1a2744',
        padding: '0 20px', height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0, gap: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, background: '#1e3a5f', border: '1px solid #3b82f640',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Globe size={16} color="#60a5fa" />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
              ISRO NOC · Phase 6
            </div>
            <div style={{ fontSize: 9, color: '#334155', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
              UNIFIED COMMAND CENTER · PREDICTIVE AI OPERATIONS
            </div>
          </div>
        </div>

        {/* Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {criticalCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ef444415',
              border: '1px solid #ef444430', borderRadius: 6, padding: '4px 10px' }}>
              <AlertTriangle size={11} color="#ef4444" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>{criticalCount} Critical</span>
            </div>
          )}

          {[
            { label: 'Network', icon: <Radio size={10} />, ok: true },
            { label: 'ML Engine', icon: <BarChart2 size={10} />, ok: true },
            { label: 'AI Copilot', icon: <BookOpen size={10} />, ok: true },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#334155' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.ok ? '#10b981' : '#ef4444' }} className="pulse" />
              {s.icon}{s.label}
            </div>
          ))}

          <div className="flex items-center gap-1 border border-noc-border rounded p-1 bg-[#060a16]">
            <a href="http://localhost:5175/?tab=overview" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 1: SIM</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=predictions" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 2: ML</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=anomalies" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 3: ANOMALY</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=rootcause" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 4: RCA</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=copilot" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 5: COPILOT</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5173/" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 6: HEAL</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
            color: wsConnected ? '#10b981' : '#ef4444', fontFamily: 'var(--mono)' }}>
            {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsConnected ? 'Live' : 'Disconnected'}
          </div>

          <div style={{ fontSize: 9, color: '#1e3a5f', fontFamily: 'var(--mono)' }}>
            Updated {lastUpdate}
          </div>

          {/* Dashboard Navigation Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #1a2744', borderRadius: 4, padding: 3, background: '#04091a' }}>
            <a
              href="http://localhost:5175"
              style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                color: '#4a5a7a',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#38bdf8'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#4a5a7a'; }}
            >
              ◀ BACK
            </a>
            <span style={{ color: '#1a2744', fontSize: 9 }}>|</span>
            <a
              href="http://localhost:5173"
              style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                color: '#4a5a7a',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#38bdf8'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#4a5a7a'; }}
            >
              NEXT ▶
            </a>
          </div>
        </div>
      </header>

      {/* ─── Summary Bar ─── */}
      {selfheal && (
        <div style={{
          background: '#04091a', borderBottom: '1px solid #0d1828',
          padding: '6px 20px', display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0
        }}>
          {['P1-CRITICAL', 'P2-HIGH', 'P3-MEDIUM', 'P4-NORMAL'].map((p, i) => {
            const count = Object.values(selfheal).filter(r => r.priority === p).length;
            const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
            const labels = ['Critical', 'High', 'Medium', 'Normal'];
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[i] }} />
                <span style={{ fontSize: 10, color: '#334155' }}>{labels[i]}: </span>
                <span style={{ fontWeight: 800, fontSize: 11, fontFamily: 'var(--mono)', color: colors[i] }}>{count}</span>
              </div>
            );
          })}
          <div style={{ marginLeft: 'auto', fontSize: 9, color: '#1e3a5f', fontFamily: 'var(--mono)' }}>
            AUTONOMOUS SELF-HEALING ENGINE · ACTIVE
          </div>
        </div>
      )}

      {/* ─── Main Grid ─── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '440px 1fr 320px', gap: 0, overflow: 'hidden' }}>

        {/* ─── LEFT: Topology + Inspector ─── */}
        <div style={{ borderRight: '1px solid #0d1828', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Topology */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #0d1828', flex: '0 0 auto' }}>
            <div className="panel-title" style={{ marginBottom: 12 }}>
              <Globe size={11} /> Network Topology — Live
            </div>
            <NetworkTopology topology={topology} selected={selectedNode} onSelect={setSelectedNode} />
          </div>
          {/* Node Inspector */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            <div className="panel-title" style={{ marginBottom: 10 }}>
              <Server size={11} />
              {selectedNode ? `Inspecting: ${selectedNode}` : 'Node Inspector'}
            </div>
            <NodeInspector node={selectedNodeData} selfheal={selectedSelfheal} />
          </div>
        </div>

        {/* ─── CENTRE: Prediction + Self-Healing or Chat ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Prediction Table */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #0d1828', flexShrink: 0
          }}>
            <div className="panel-title" style={{ marginBottom: 10 }}>
              <TrendingUp size={11} /> AI Failure Prediction Panel
            </div>
            <PredictionPanel data={selfheal} />
          </div>

          {/* Section tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #0d1828', background: '#04091a', flexShrink: 0
          }}>
            {[
              ['selfheal', 'Autonomous Self-Healing Engine', <Zap size={10} />],
              ['chat', 'AI Copilot Chat', <BookOpen size={10} />],
            ].map(([k, label, icon]) => (
              <button key={k as string}
                onClick={() => setActiveSection(k as 'selfheal' | 'chat')}
                style={{
                  flex: 1, padding: '8px 14px', background: 'none', cursor: 'pointer',
                  border: 'none', borderBottom: `2px solid ${activeSection === k ? '#3b82f6' : 'transparent'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 10, fontWeight: activeSection === k ? 700 : 400,
                  color: activeSection === k ? '#60a5fa' : '#334155',
                  transition: 'all 0.15s'
                }}>
                {icon as React.ReactNode} {label as string}
              </button>
            ))}
          </div>

          {/* Section body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
            {activeSection === 'selfheal' ? (
              <SelfHealingPanel data={selfheal} selectedId={null} />
            ) : (
              <AIChatPanel />
            )}
          </div>
        </div>

        {/* ─── RIGHT: Incident Timeline ─── */}
        <div style={{ borderLeft: '1px solid #0d1828', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #0d1828', flexShrink: 0 }}>
            <div className="panel-title">
              <Clock size={11} /> Incident Timeline
              {incidents.filter(i => !i.resolved_at).length > 0 && (
                <span className="badge badge-red" style={{ marginLeft: 8 }}>
                  {incidents.filter(i => !i.resolved_at).length} Active
                </span>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            <IncidentTimeline incidents={incidents} />
          </div>

          {/* AI Warning event feed */}
          <div style={{ borderTop: '1px solid #0d1828', padding: '10px 16px', flexShrink: 0, background: '#04091a' }}>
            <div className="panel-title" style={{ marginBottom: 8 }}>
              <ShieldCheck size={11} /> AI Early Warnings
            </div>
            {selfheal ? Object.values(selfheal)
              .filter(r => r.risk_score > 50)
              .sort((a, b) => b.risk_score - a.risk_score)
              .slice(0, 4)
              .map(r => (
                <div key={r.router_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0', borderBottom: '1px solid #060c1a', fontSize: 10
                }}>
                  <span style={{ color: '#94a3b8' }}>{r.router_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', color: riskColor(r.risk_score), fontWeight: 800 }}>
                      {r.risk_score.toFixed(0)}%
                    </span>
                    {r.time_to_failure && (
                      <span style={{ fontSize: 9, color: '#ef4444', fontFamily: 'var(--mono)' }}>
                        {r.time_to_failure}
                      </span>
                    )}
                  </div>
                </div>
              )) : <div style={{ color: '#1e3a5f', fontSize: 10 }}>No high-risk routers detected</div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
