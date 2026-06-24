import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Database, Server, Zap, AlertTriangle, CheckCircle2,
  Play, Square, RefreshCw, TrendingUp, Clock, Hash, Radio,
  GitBranch, Cpu, Wifi, WifiOff, BarChart3, Brain, ShieldCheck, Sliders, MessageCircle
} from 'lucide-react';
import type { GeneratorStatus, Router, Snapshot, Incident, SnapshotsResponse } from './types';
import { GeneratorControl } from './components/GeneratorControl';
import { MetricsChart } from './components/MetricsChart';
import { DataTable } from './components/DataTable';
import { IncidentTimeline } from './components/IncidentTimeline';
import { DatabaseHealth } from './components/DatabaseHealth';
import { TopologySimulator } from './components/TopologySimulator';
import { PredictionPanel } from './components/PredictionPanel';
import { AnomalyPanel } from './components/AnomalyPanel';
import { RootCausePanel } from './components/RootCausePanel';
import { CopilotPanel } from './components/CopilotPanel';

const API = 'http://127.0.0.1:8001';
const WS_URL = 'ws://127.0.0.1:8001/ws/ph1/stream';

type Tab = 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'timeseries' | 'rawdata' | 'incidents' | 'dbhealth' | 'selfheal';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab') as Tab;
    return ['overview', 'predictions', 'anomalies', 'rootcause', 'copilot', 'timeseries', 'rawdata', 'incidents', 'dbhealth', 'selfheal'].includes(urlTab) ? urlTab : 'overview';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  }, [tab]);
  const [genStatus, setGenStatus] = useState<GeneratorStatus | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [liveData, setLiveData] = useState<Record<string, Snapshot>>({});
  const [selectedRouter, setSelectedRouter] = useState<string>('NOC-DEL');
  const [wsConnected, setWsConnected] = useState(false);
  const [utcTime, setUtcTime] = useState('');
  const [totalRows, setTotalRows] = useState(0);

  // Clock
  useEffect(() => {
    const t = setInterval(() => {
      setUtcTime(new Date().toUTCString().replace('GMT', 'UTC'));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch routers
  useEffect(() => {
    fetch(`${API}/api/ph1/routers`)
      .then(r => r.json())
      .then(setRouters)
      .catch(() => {});
  }, []);

  // Poll generator status every 3s
  const fetchStatus = useCallback(() => {
    fetch(`${API}/api/ph1/generator/status`)
      .then(r => r.json())
      .then((s: GeneratorStatus) => {
        setGenStatus(s);
        setTotalRows(s.total_rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 3000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // WebSocket live stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnect: any = null;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'live_update') {
            setLiveData(msg.data);
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnect = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        if (ws) {
          ws.close();
        }
      };
    };
    connect();
    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      clearTimeout(reconnect);
    };
  }, []);

  const liveSnapshots = Object.values(liveData) as Snapshot[];
  const activeAlerts = liveSnapshots.filter(s => s.failure_label > 0);
  const downLinks = liveSnapshots.filter(s => s.link_status === 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        background: '#030813',
        borderBottom: '1px solid var(--c-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            padding: '8px',
            background: 'var(--c-primary)15',
            borderRadius: 8,
            border: '1px solid var(--c-primary)30'
          }}>
            <GitBranch style={{ width: 20, height: 20, color: 'var(--c-primary)' }} />
          </div>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: 'var(--c-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              ISRO PRED-NOC
              <span style={{
                fontSize: 9,
                background: 'var(--c-warning)20',
                color: 'var(--c-warning)',
                border: '1px solid var(--c-warning)40',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.1em'
              }}>PHASE 1 — DATA ENGINE</span>
            </h1>
            <p style={{ fontSize: 10, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              SYNTHETIC NETWORK SIMULATOR · INFLUXDB TIME-SERIES · SQLITE STORAGE
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Phase Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--c-border)', borderRadius: 4, padding: 3, background: 'var(--c-bg2)' }}>
            <button
              onClick={() => setTab('overview')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'overview' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'overview' ? 'var(--c-primary)15' : 'none',
                border: tab === 'overview' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'overview') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'overview') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 1: SIM
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('predictions')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'predictions' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'predictions' ? 'var(--c-primary)15' : 'none',
                border: tab === 'predictions' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'predictions') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'predictions') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 2: ML
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('anomalies')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'anomalies' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'anomalies' ? 'var(--c-primary)15' : 'none',
                border: tab === 'anomalies' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'anomalies') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'anomalies') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 3: ANOMALY
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('rootcause')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'rootcause' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'rootcause' ? 'var(--c-primary)15' : 'none',
                border: tab === 'rootcause' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'rootcause') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'rootcause') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 4: RCA
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <button
              onClick={() => setTab('copilot')}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: tab === 'copilot' ? 'var(--c-primary)' : 'var(--c-muted)',
                background: tab === 'copilot' ? 'var(--c-primary)15' : 'none',
                border: tab === 'copilot' ? '1px solid var(--c-primary)30' : '1px solid transparent',
                borderRadius: 3,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { if (tab !== 'copilot') { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; } }}
              onMouseOut={(e) => { if (tab !== 'copilot') { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; } }}
            >
              PH 5: COPILOT
            </button>
            <span style={{ color: 'var(--c-border)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>|</span>
            <a
              href="http://localhost:5176/"
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-muted)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; e.currentTarget.style.background = 'var(--c-primary)08'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-muted)'; e.currentTarget.style.background = 'none'; }}
            >
              PH 6: HEAL
            </a>
          </div>

          {/* Dashboard Navigation Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--c-border)', borderRadius: 4, padding: 3, background: 'var(--c-bg2)' }}>
            <a
              href="http://localhost:5173/"
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-text)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-text)'; }}
            >
              ◀ BACK
            </a>
            <span style={{ color: 'var(--c-border)', fontSize: 10 }}>|</span>
            <a
              href="http://localhost:5176/"
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--c-text)',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 3,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--c-primary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--c-text)'; }}
            >
              NEXT ▶
            </a>
          </div>

          {/* UTC Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
            <Clock style={{ width: 13, height: 13, color: 'var(--c-primary)' }} />
            <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{utcTime || '...'}</span>
          </div>

          {/* WS Status */}
          <span className={`pill ${wsConnected ? 'pill-success' : 'pill-danger'}`}>
            {wsConnected ? <Wifi style={{ width: 10, height: 10 }} /> : <WifiOff style={{ width: 10, height: 10 }} />}
            {wsConnected ? 'STREAM LIVE' : 'DISCONNECTED'}
          </span>

          {/* Generator Status */}
          <span className={`pill ${genStatus?.running ? 'pill-primary' : 'pill-muted'}`}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: genStatus?.running ? 'var(--c-primary)' : 'var(--c-muted)',
              display: 'inline-block',
              animation: genStatus?.running ? 'pulse-dot 1.5s infinite' : 'none'
            }} />
            {genStatus?.running ? 'GENERATOR ACTIVE' : 'GENERATOR STOPPED'}
          </span>
        </div>
      </header>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 1,
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-border)'
      }}>
        {[
          { label: 'Total DB Rows', value: totalRows.toLocaleString(), icon: <Database size={14} />, color: 'var(--c-primary)' },
          { label: 'Rows / Min', value: genStatus ? `${genStatus.rows_per_minute}` : '--', icon: <TrendingUp size={14} />, color: 'var(--c-success)' },
          { label: 'Active Routers', value: `${liveSnapshots.length} / 6`, icon: <Server size={14} />, color: 'var(--c-primary)' },
          { label: 'Failure Events', value: `${activeAlerts.length}`, icon: <AlertTriangle size={14} />, color: activeAlerts.length > 0 ? 'var(--c-danger)' : 'var(--c-muted)' },
          { label: 'Total Incidents', value: genStatus ? `${genStatus.total_incidents}` : '--', icon: <Hash size={14} />, color: 'var(--c-orange)' },
          { label: 'Generator PID', value: genStatus?.pid ? `${genStatus.pid}` : 'OFFLINE', icon: <Cpu size={14} />, color: genStatus?.running ? 'var(--c-success)' : 'var(--c-muted)' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--c-card)', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--c-muted)', marginBottom: 4 }}>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
              <span className="section-label" style={{ fontSize: 9 }}>{kpi.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: kpi.color, lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--c-bg2)', borderBottom: '1px solid var(--c-border)', padding: '0 24px' }}>
        <div className="tab-bar" style={{ borderBottom: 'none' }}>
          {([
            ['overview', 'Phase 1: Simulator', <Activity size={12} />],
            ['predictions', 'Phase 2: ML Predictions', <Brain size={12} />],
            ['anomalies', 'Phase 3: Anomaly Detection', <ShieldCheck size={12} />],
            ['rootcause', 'Phase 4: Root Cause Engine', <Sliders size={12} />],
            ['copilot', 'Phase 5: AI Copilot', <MessageCircle size={12} />],
            ['selfheal', 'Phase 6: Autonomous Heal', <Zap size={12} />],
            ['timeseries', 'Time-Series Explorer', <BarChart3 size={12} />],
            ['rawdata', 'Raw Data Table', <Database size={12} />],
            ['incidents', 'Incident Log', <AlertTriangle size={12} />],
            ['dbhealth', 'DB Health', <CheckCircle2 size={12} />],
          ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
            key === 'selfheal' ? (
              <a
                key={key}
                href="http://localhost:5176/"
                className="tab-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
              >
                {icon} {label}
              </a>
            ) : (
              <button
                key={key}
                className={`tab-btn ${tab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {icon} {label}
              </button>
            )
          ))}
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>
              <GeneratorControl status={genStatus} onRefresh={fetchStatus} api={API} />
              <TopologySimulator liveData={liveData} routers={routers} selectedId={selectedRouter} onSelect={setSelectedRouter} />
            </div>
          </div>
        )}

        {tab === 'predictions' && (
          <PredictionPanel api={API} />
        )}

        {tab === 'anomalies' && (
          <AnomalyPanel api={API} />
        )}

        {tab === 'rootcause' && (
          <RootCausePanel api={API} />
        )}

        {tab === 'copilot' && (
          <CopilotPanel api={API} />
        )}

        {tab === 'timeseries' && (
          <MetricsChart
            api={API}
            routers={routers}
            selectedRouterId={selectedRouter}
            onSelectRouter={setSelectedRouter}
          />
        )}

        {tab === 'rawdata' && (
          <DataTable api={API} routers={routers} />
        )}

        {tab === 'incidents' && (
          <IncidentTimeline api={API} />
        )}

        {tab === 'dbhealth' && (
          <DatabaseHealth api={API} genStatus={genStatus} />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        padding: '8px 24px',
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--c-muted)',
        background: '#030813'
      }}>
        <span>ISRO PRED-NOC Phase 1 · Synthetic MPLS Telemetry Engine · v1.0</span>
        <span>
          SQLite: <span style={{ color: 'var(--c-success)' }}>LOCAL</span> &nbsp;|&nbsp;
          InfluxDB: <span style={{ color: genStatus?.influx_available ? 'var(--c-success)' : 'var(--c-warning)' }}>
            {genStatus?.influx_available ? 'CONNECTED' : 'FALLBACK MODE'}
          </span>
          &nbsp;|&nbsp; {totalRows.toLocaleString()} ROWS
        </span>
      </footer>
    </div>
  );
}
