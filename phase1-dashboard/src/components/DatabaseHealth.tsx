import React, { useState, useEffect, useCallback } from 'react';
import type { GeneratorStatus } from '../types';
import { Database, Zap, Server, RefreshCw, CheckCircle2, XCircle, Activity } from 'lucide-react';

interface Props {
  api: string;
  genStatus: GeneratorStatus | null;
}

interface Health {
  sqlite: { status: string; path: string };
  influxdb: { status: string; url: string; client_installed: boolean };
  api: string;
}

interface SchemaRow {
  name: string;
  type: string;
}

export const DatabaseHealth: React.FC<Props> = ({ api, genStatus }) => {
  const [health, setHealth] = useState<Health | null>(null);
  const [dbStats, setDbStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${api}/api/ph1/health`);
      const d: Health = await r.json();
      setHealth(d);
    } catch {}
    setLoading(false);
  }, [api]);

  const fetchStats = useCallback(async () => {
    try {
      const [snapRes, incRes, routerRes] = await Promise.all([
        fetch(`${api}/api/ph1/snapshots?limit=1`).then(r => r.json()),
        fetch(`${api}/api/ph1/incidents?limit=1`).then(r => r.json()),
        fetch(`${api}/api/ph1/routers`).then(r => r.json()),
      ]);
      setDbStats({
        network_snapshots: snapRes.total ?? 0,
        incident_log: Array.isArray(incRes) ? incRes.length : 0,
        router_registry: Array.isArray(routerRes) ? routerRes.length : 0,
      });
    } catch {}
  }, [api]);

  useEffect(() => {
    fetchHealth();
    fetchStats();
    const t = setInterval(() => { fetchHealth(); fetchStats(); }, 10000);
    return () => clearInterval(t);
  }, [fetchHealth, fetchStats]);

  const StatusIcon: React.FC<{ ok: boolean }> = ({ ok }) => (
    ok ? <CheckCircle2 size={16} color="var(--c-success)" /> : <XCircle size={16} color="var(--c-danger)" />
  );

  const TABLE_SCHEMA = [
    { table: 'router_registry', columns: ['id', 'name', 'location', 'ip_address', 'site_type', 'created_at'] },
    { table: 'network_snapshots', columns: ['id', 'router_id', 'timestamp', 'latency', 'packet_loss', 'jitter', 'bandwidth', 'cpu', 'memory', 'link_status', 'failure_label'] },
    { table: 'incident_log', columns: ['id', 'router_id', 'started_at', 'resolved_at', 'failure_type', 'severity', 'peak_latency', 'peak_loss', 'peak_cpu', 'notes'] },
    { table: 'ingestion_stats', columns: ['id', 'recorded_at', 'rows_inserted', 'errors', 'generator_pid', 'influx_writes'] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Connection Status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* SQLite */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Database size={16} color="var(--c-primary)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--c-primary)' }}>SQLite</span>
            <div style={{ marginLeft: 'auto' }}>
              <StatusIcon ok={health?.sqlite?.status === 'ok'} />
            </div>
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginBottom: 4 }}>TYPE</div>
          <div style={{ fontSize: 12, color: 'var(--c-text)', marginBottom: 12 }}>SQLite 3 (WAL mode)</div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginBottom: 4 }}>PATH</div>
          <div style={{ fontSize: 10, color: 'var(--c-text)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', lineHeight: 1.4, marginBottom: 12 }}>
            {health?.sqlite?.path || 'phase1.db'}
          </div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: health?.sqlite?.status === 'ok' ? 'var(--c-success)10' : 'var(--c-danger)10', border: `1px solid ${health?.sqlite?.status === 'ok' ? 'var(--c-success)40' : 'var(--c-danger)40'}` }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: health?.sqlite?.status === 'ok' ? 'var(--c-success)' : 'var(--c-danger)' }}>
              {health?.sqlite?.status?.toUpperCase() || 'CHECKING...'}
            </span>
          </div>
        </div>

        {/* InfluxDB */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Zap size={16} color="var(--c-purple)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--c-purple)' }}>InfluxDB 2.x</span>
            <div style={{ marginLeft: 'auto' }}>
              <StatusIcon ok={health?.influxdb?.status === 'ok'} />
            </div>
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginBottom: 4 }}>TYPE</div>
          <div style={{ fontSize: 12, color: 'var(--c-text)', marginBottom: 12 }}>InfluxDB 2.7 (Time-Series)</div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginBottom: 4 }}>ENDPOINT</div>
          <div style={{ fontSize: 10, color: 'var(--c-text)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
            {health?.influxdb?.url || 'http://localhost:8086'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
            Bucket: isro_telemetry · Org: isro-noc
          </div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: health?.influxdb?.status === 'ok' ? 'var(--c-success)10' : 'var(--c-warning)10', border: `1px solid ${health?.influxdb?.status === 'ok' ? 'var(--c-success)40' : 'var(--c-warning)40'}` }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: health?.influxdb?.status === 'ok' ? 'var(--c-success)' : 'var(--c-warning)' }}>
              {health?.influxdb?.status === 'ok' ? 'CONNECTED' : health?.influxdb?.client_installed ? 'NOT RUNNING' : 'CLIENT NOT INSTALLED'}
            </span>
          </div>
        </div>

        {/* Generator */}
        <div className="glass-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Activity size={16} color="var(--c-success)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--c-success)' }}>Generator</span>
            <div style={{ marginLeft: 'auto' }}>
              <StatusIcon ok={genStatus?.running ?? false} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { l: 'Status', v: genStatus?.running ? 'RUNNING' : 'STOPPED', c: genStatus?.running ? 'var(--c-success)' : 'var(--c-danger)' },
              { l: 'Total Rows', v: genStatus?.total_rows.toLocaleString() ?? '--', c: 'var(--c-primary)' },
              { l: 'Rows/Min', v: genStatus?.rows_per_minute ?? '--', c: 'var(--c-success)' },
              { l: 'Incidents', v: genStatus?.total_incidents ?? '--', c: 'var(--c-warning)' },
              { l: 'InfluxDB Writes', v: genStatus?.influx_available ? 'Enabled' : 'SQLite only', c: genStatus?.influx_available ? 'var(--c-success)' : 'var(--c-muted)' },
            ].map(s => (
              <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>{s.l}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.c }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table Row Counts ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Database size={14} color="var(--c-primary)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-primary)', letterSpacing: '0.1em' }}>
            DATABASE TABLES
          </span>
          <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 10, marginLeft: 'auto' }} onClick={() => { fetchHealth(); fetchStats(); }}>
            <RefreshCw size={9} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { table: 'router_registry', label: 'Router Registry', icon: <Server size={12} />, color: 'var(--c-primary)' },
            { table: 'network_snapshots', label: 'Network Snapshots', icon: <Activity size={12} />, color: 'var(--c-success)' },
            { table: 'incident_log', label: 'Incident Log', icon: <Zap size={12} />, color: 'var(--c-warning)' },
          ].map(t => (
            <div key={t.table} style={{ padding: '12px 14px', background: 'var(--c-bg2)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.color, marginBottom: 8 }}>
                {t.icon}
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.06em' }}>{t.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: t.color, lineHeight: 1, marginBottom: 4 }}>
                {(dbStats[t.table] ?? 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>ROWS IN TABLE</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Schema Reference ── */}
      <div className="glass-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Server size={14} color="var(--c-purple)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-purple)', letterSpacing: '0.1em' }}>
            SCHEMA REFERENCE
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {TABLE_SCHEMA.map(t => (
            <div key={t.table} style={{ padding: 12, background: 'var(--c-bg2)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-primary)', marginBottom: 8 }}>
                {t.table}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {t.columns.map(col => (
                  <span key={col} style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: 'var(--c-border)80',
                    border: '1px solid var(--c-border)',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--c-muted)'
                  }}>
                    {col}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── InfluxDB Setup Guide ── */}
      {health?.influxdb?.status !== 'ok' && (
        <div className="glass-card" style={{ padding: 16, border: '1px solid var(--c-warning)40', background: 'var(--c-warning)05' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Zap size={14} color="var(--c-warning)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-warning)' }}>
              INFLUXDB SETUP
            </span>
          </div>
          <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', lineHeight: 1.6, marginBottom: 10 }}>
            InfluxDB is not connected. The system is running in SQLite-only mode — all data is being stored. To enable time-series writes:
          </p>
          <div className="terminal" style={{ fontSize: 10, padding: '10px 14px' }}>
            <div className="line-info"># InfluxDB is already extracted to phase1-backend/influxdb/</div>
            <div className="line-info"># Start it with:</div>
            <div>cd phase1-backend\influxdb</div>
            <div>.\influxd.exe --http-bind-address 127.0.0.1:8086</div>
            <div className="line-info"># Then access UI at: http://localhost:8086</div>
            <div className="line-info"># Org: isro-noc | Bucket: isro_telemetry | Token: isro-noc-admin-token</div>
          </div>
        </div>
      )}
    </div>
  );
};
