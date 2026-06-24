import React, { useState, useEffect, useCallback } from 'react';
import type { Incident } from '../types';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Cpu } from 'lucide-react';

interface Props {
  api: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  INFO: 'var(--c-primary)',
  WARNING: 'var(--c-warning)',
  CRITICAL: 'var(--c-danger)',
};

const FAILURE_COLOR: Record<string, string> = {
  congestion: 'var(--c-warning)',
  overload: 'var(--c-orange)',
  instability: 'var(--c-danger)',
  link_down: 'var(--c-danger)',
  normal: 'var(--c-success)',
};

export const IncidentTimeline: React.FC<Props> = ({ api }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterRouter, setFilterRouter] = useState('');
  const [showActive, setShowActive] = useState(false);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterRouter) params.set('router_id', filterRouter);
      const r = await fetch(`${api}/api/ph1/incidents?${params}`);
      const d: Incident[] = await r.json();
      setIncidents(d);
    } catch {}
    setLoading(false);
  }, [api, filterRouter]);

  useEffect(() => {
    fetchIncidents();
    const t = setInterval(fetchIncidents, 5000);
    return () => clearInterval(t);
  }, [fetchIncidents]);

  const displayed = showActive ? incidents.filter(i => !i.resolved_at) : incidents;
  const activeCount = incidents.filter(i => !i.resolved_at).length;

  const formatDuration = (start: string, end: string | null) => {
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const secs = Math.round((e.getTime() - s.getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  const ROUTER_IDS = ['ISTRAC-BGL', 'SDSC-SHAR', 'MCF-HSN', 'NOC-DEL', 'NOC-MUM', 'TRACK-PBL'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Header & filters ── */}
      <div className="glass-card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <AlertTriangle size={14} color="var(--c-warning)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-warning)', letterSpacing: '0.1em' }}>
          INCIDENT LOG
        </span>

        <select value={filterRouter} onChange={e => setFilterRouter(e.target.value)} style={selectStyle}>
          <option value="">All Routers</option>
          {ROUTER_IDS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <button
          className={`btn ${showActive ? 'btn-danger' : ''}`}
          style={{ padding: '4px 12px', fontSize: 10, border: '1px solid var(--c-border)' }}
          onClick={() => setShowActive(p => !p)}
        >
          ACTIVE ONLY ({activeCount})
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
          {displayed.length} incidents
        </span>

        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={fetchIncidents}>
          <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Incidents', value: incidents.length, color: 'var(--c-primary)' },
          { label: 'Active Now', value: activeCount, color: activeCount > 0 ? 'var(--c-danger)' : 'var(--c-success)' },
          { label: 'Resolved', value: incidents.filter(i => i.resolved_at).length, color: 'var(--c-success)' },
          { label: 'Critical', value: incidents.filter(i => i.severity === 'CRITICAL').length, color: 'var(--c-danger)' },
        ].map((s, i) => (
          <div key={i} className="glass-card" style={{ padding: '12px 16px' }}>
            <div className="section-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Timeline ── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {displayed.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {loading ? 'Loading incidents...' : 'No incidents recorded. Start the generator to begin monitoring.'}
          </div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '65vh' }}>
            {displayed.map((incident, i) => {
              const isActive = !incident.resolved_at;
              const fcolor = FAILURE_COLOR[incident.failure_type] || 'var(--c-muted)';
              const scolor = SEVERITY_COLOR[incident.severity] || 'var(--c-muted)';

              return (
                <div key={incident.id} style={{
                  display: 'flex',
                  gap: 16,
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--c-border)',
                  background: isActive ? 'var(--c-danger)04' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--c-danger)' : fcolor + '60'}`,
                  transition: 'background 0.2s'
                }}>
                  {/* Timeline dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 24 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: isActive ? 'var(--c-danger)' : 'var(--c-success)',
                      border: `2px solid ${isActive ? 'var(--c-danger)' : 'var(--c-success)'}40`,
                      animation: isActive ? 'pulse-dot 1.5s infinite' : 'none',
                      flexShrink: 0
                    }} />
                    {i < displayed.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: 'var(--c-border)', minHeight: 30, marginTop: 4 }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>
                        {incident.router_id}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--c-muted)' }}>·</span>
                      <span style={{ fontSize: 10, color: 'var(--c-muted)' }}>{incident.router_name}</span>
                      <span className={`pill ${incident.severity === 'CRITICAL' ? 'pill-danger' : 'pill-warning'}`} style={{ fontSize: 9 }}>
                        {incident.severity}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: fcolor + '20',
                        border: `1px solid ${fcolor}40`,
                        color: fcolor,
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}>
                        {incident.failure_type.toUpperCase()}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: 10, color: 'var(--c-danger)', fontFamily: 'var(--font-mono)', fontWeight: 700, animation: 'pulse-dot 1.5s infinite' }}>
                          ● ACTIVE
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={10} />
                        {new Date(incident.started_at).toLocaleString()}
                        {incident.resolved_at && (
                          <> → {new Date(incident.resolved_at).toLocaleTimeString()}</>
                        )}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--c-warning)' : 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Cpu size={10} />
                        Duration: {formatDuration(incident.started_at, incident.resolved_at)}
                      </span>
                    </div>

                    {/* Peak metrics */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {incident.peak_latency && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
                          Peak Latency: <span style={{ color: 'var(--c-danger)' }}>{incident.peak_latency.toFixed(0)}ms</span>
                        </span>
                      )}
                      {incident.peak_loss && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
                          Peak Loss: <span style={{ color: 'var(--c-warning)' }}>{incident.peak_loss.toFixed(2)}%</span>
                        </span>
                      )}
                      {incident.peak_cpu && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
                          Peak CPU: <span style={{ color: 'var(--c-orange)' }}>{incident.peak_cpu.toFixed(0)}%</span>
                        </span>
                      )}
                    </div>

                    {incident.notes && (
                      <div style={{ marginTop: 5, fontSize: 10, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>
                        {incident.notes}
                      </div>
                    )}
                  </div>

                  {/* Status icon */}
                  <div>
                    {isActive
                      ? <AlertTriangle size={16} color="var(--c-danger)" />
                      : <CheckCircle2 size={16} color="var(--c-success)" />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: 'var(--c-bg2)',
  border: '1px solid var(--c-border)',
  borderRadius: 6,
  color: 'var(--c-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  outline: 'none',
};
