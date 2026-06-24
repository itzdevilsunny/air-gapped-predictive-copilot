import React, { useState } from 'react';
import { Play, Square, RefreshCw, Activity, Clock, Database, Cpu, AlertTriangle, Zap, TrendingUp } from 'lucide-react';
import type { GeneratorStatus } from './types';

interface Props {
  status: GeneratorStatus | null;
  onRefresh: () => void;
  api: string;
}

const FAILURE_TYPES = ['congestion', 'overload', 'instability', 'link_down'];
const ROUTER_IDS = ['ISTRAC-BGL', 'SDSC-SHAR', 'MCF-HSN', 'NOC-DEL', 'NOC-MUM', 'TRACK-PBL'];

export const GeneratorControl: React.FC<Props> = ({ status, onRefresh, api }) => {
  const [loading, setLoading] = useState(false);
  const [injectRouter, setInjectRouter] = useState('NOC-DEL');
  const [injectType, setInjectType] = useState('congestion');
  const [injectDuration, setInjectDuration] = useState(30);
  const [injectStatus, setInjectStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [`[${ts}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const startGenerator = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${api}/api/ph1/generator/start`, { method: 'POST' });
      const d = await r.json();
      addLog(`Generator started (PID: ${d.pid})`);
      onRefresh();
    } catch (e) {
      addLog('ERROR: Failed to start generator');
    }
    setLoading(false);
  };

  const stopGenerator = async () => {
    setLoading(true);
    try {
      await fetch(`${api}/api/ph1/generator/stop`, { method: 'POST' });
      addLog('Generator stopped');
      onRefresh();
    } catch (e) {
      addLog('ERROR: Failed to stop generator');
    }
    setLoading(false);
  };

  const injectFailure = async () => {
    try {
      const r = await fetch(`${api}/api/ph1/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: injectRouter,
          failure_type: injectType,
          duration_steps: injectDuration
        })
      });
      if (r.ok) {
        addLog(`Injected '${injectType}' on ${injectRouter} for ${injectDuration} steps`);
        setInjectStatus('success');
        setTimeout(() => setInjectStatus(null), 3000);
      }
    } catch {
      addLog('ERROR: Failure injection failed');
    }
  };

  const formatUptime = (secs: number) => {
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}m ${s}s`;
  };

  const isRunning = status?.running ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Generator Status Card ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Activity size={14} color="var(--c-primary)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-primary)', letterSpacing: '0.1em' }}>
            GENERATOR CONTROL
          </span>
        </div>

        {/* Status indicator */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: isRunning ? 'var(--c-success)10' : 'var(--c-danger)10',
          border: `1px solid ${isRunning ? 'var(--c-success)40' : 'var(--c-danger)40'}`,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isRunning ? 'var(--c-success)' : 'var(--c-danger)',
              display: 'inline-block',
              animation: isRunning ? 'pulse-dot 1.5s infinite' : 'none'
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: isRunning ? 'var(--c-success)' : 'var(--c-danger)' }}>
              {isRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
          {isRunning && status && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)' }}>
              PID {status.pid} · {formatUptime(status.uptime_seconds)}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'DB Rows', value: status ? status.total_rows.toLocaleString() : '--', icon: <Database size={11} />, color: 'var(--c-primary)' },
            { label: 'Rows/Min', value: status ? `${status.rows_per_minute}` : '--', icon: <TrendingUp size={11} />, color: 'var(--c-success)' },
            { label: 'Incidents', value: status ? `${status.total_incidents}` : '--', icon: <AlertTriangle size={11} />, color: 'var(--c-warning)' },
            { label: 'Last Row', value: status?.latest_timestamp ? new Date(status.latest_timestamp).toLocaleTimeString() : '--', icon: <Clock size={11} />, color: 'var(--c-muted)' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '8px 10px',
              background: 'var(--c-bg2)',
              borderRadius: 6,
              border: '1px solid var(--c-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: s.color, marginBottom: 3 }}>
                {s.icon}
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Control buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${isRunning ? 'btn-danger' : 'btn-success'}`}
            onClick={isRunning ? stopGenerator : startGenerator}
            disabled={loading}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {loading ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> :
              isRunning ? <Square size={11} /> : <Play size={11} />}
            {isRunning ? 'STOP' : 'START'}
          </button>
          <button className="btn btn-primary" onClick={onRefresh} title="Refresh" style={{ padding: '7px 10px' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* ── Failure Injection ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Zap size={14} color="var(--c-warning)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-warning)', letterSpacing: '0.1em' }}>
            FAILURE INJECTION
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={injectRouter}
            onChange={e => setInjectRouter(e.target.value)}
            style={selectStyle}
          >
            {ROUTER_IDS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={injectType}
            onChange={e => setInjectType(e.target.value)}
            style={selectStyle}
          >
            {FAILURE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', minWidth: 60 }}>DURATION</span>
            <input
              type="range"
              min={5}
              max={60}
              value={injectDuration}
              onChange={e => setInjectDuration(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--c-warning)' }}
            />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-warning)', minWidth: 35 }}>
              {injectDuration}s
            </span>
          </div>

          <button
            className="btn btn-warning"
            onClick={injectFailure}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Zap size={11} />
            INJECT FAILURE
          </button>

          {injectStatus === 'success' && (
            <div style={{ padding: '6px 10px', borderRadius: 5, background: 'var(--c-success)15', border: '1px solid var(--c-success)40', color: 'var(--c-success)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              ✓ Failure injected successfully
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Log ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Cpu size={14} color="var(--c-purple)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-purple)', letterSpacing: '0.1em' }}>
            ACTIVITY LOG
          </span>
        </div>
        <div className="terminal" style={{ height: 120, overflow: 'auto', fontSize: 10 }}>
          {logs.length === 0 ? (
            <span style={{ color: 'var(--c-muted)' }}>// No activity yet. Start generator to begin.</span>
          ) : (
            logs.map((l, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <span className="line-ts">{l.split(']')[0]}]</span>
                <span className={l.includes('ERROR') ? 'line-err' : l.includes('Injected') ? 'line-warn' : 'line-info'}>
                  {l.split(']').slice(1).join(']')}
                </span>
              </div>
            ))
          )}
          <span className="animate-blink" style={{ color: 'var(--c-success)' }}>█</span>
        </div>
      </div>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--c-bg2)',
  border: '1px solid var(--c-border)',
  borderRadius: 6,
  color: 'var(--c-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  outline: 'none',
};
