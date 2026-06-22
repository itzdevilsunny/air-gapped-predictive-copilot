import React, { useState, useEffect, useCallback } from 'react';
import type { Router, Snapshot, SnapshotsResponse } from '../types';
import { FAILURE_LABEL_MAP, FAILURE_LABEL_CLASS } from '../types';
import { RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface Props {
  api: string;
  routers: Router[];
}

const PAGE_SIZE = 50;

export const DataTable: React.FC<Props> = ({ api, routers }) => {
  const [data, setData] = useState<Snapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterRouter, setFilterRouter] = useState<string>('');
  const [filterLabel, setFilterLabel] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (filterRouter) params.set('router_id', filterRouter);
      if (filterLabel !== '') params.set('failure_label', filterLabel);

      const r = await fetch(`${api}/api/ph1/snapshots?${params}`);
      const d: SnapshotsResponse = await r.json();
      setData(d.data);
      setTotal(d.total);
    } catch {}
    setLoading(false);
  }, [api, page, filterRouter, filterLabel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const labelColor = (label: number) => {
    if (label === 0) return 'var(--c-success)';
    if (label === 1) return 'var(--c-warning)';
    if (label === 2) return 'var(--c-orange)';
    return 'var(--c-danger)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Filters ── */}
      <div className="glass-card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Filter size={13} color="var(--c-muted)" />
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>FILTERS:</span>

        <select value={filterRouter} onChange={e => { setFilterRouter(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="">All Routers</option>
          {routers.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>

        <select value={filterLabel} onChange={e => { setFilterLabel(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="">All Labels</option>
          <option value="0">Normal</option>
          <option value="1">Congestion</option>
          <option value="2">Overload</option>
          <option value="3">Instability</option>
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
          {total.toLocaleString()} records
        </span>

        <button
          className={`btn ${autoRefresh ? 'btn-success' : ''}`}
          style={{ padding: '4px 10px', fontSize: 10 }}
          onClick={() => setAutoRefresh(p => !p)}
        >
          <RefreshCw size={10} style={{ animation: autoRefresh && loading ? 'spin 1s linear infinite' : 'none' }} />
          AUTO
        </button>
        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={fetchData}>
          <RefreshCw size={10} />
        </button>
      </div>

      {/* ── Table ── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Router</th>
                <th>Timestamp</th>
                <th>Latency (ms)</th>
                <th>Pkt Loss (%)</th>
                <th>Jitter (ms)</th>
                <th>BW (%)</th>
                <th>CPU (%)</th>
                <th>Memory (%)</th>
                <th>Link</th>
                <th>Failure Label</th>
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 30, color: 'var(--c-muted)' }}>
                    Loading data...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 30, color: 'var(--c-muted)' }}>
                    No data found. Start the generator to populate the database.
                  </td>
                </tr>
              ) : (
                data.map(row => (
                  <tr key={row.id}>
                    <td style={{ color: 'var(--c-muted)' }}>{row.id}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--c-primary)' }}>{row.router_id}</span>
                    </td>
                    <td style={{ color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td style={{ color: row.latency > 200 ? 'var(--c-danger)' : row.latency > 100 ? 'var(--c-warning)' : 'var(--c-text)' }}>
                      {row.latency.toFixed(1)}
                    </td>
                    <td style={{ color: row.packet_loss > 3 ? 'var(--c-danger)' : row.packet_loss > 1 ? 'var(--c-warning)' : 'var(--c-success)' }}>
                      {row.packet_loss.toFixed(3)}
                    </td>
                    <td style={{ color: row.jitter > 10 ? 'var(--c-warning)' : 'var(--c-text)' }}>
                      {row.jitter.toFixed(2)}
                    </td>
                    <td style={{ color: row.bandwidth > 80 ? 'var(--c-danger)' : 'var(--c-text)' }}>
                      {row.bandwidth.toFixed(1)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 30, height: 4, borderRadius: 2, background: 'var(--c-border)' }}>
                          <div style={{
                            width: `${Math.min(row.cpu, 100)}%`,
                            height: '100%',
                            borderRadius: 2,
                            background: row.cpu > 80 ? 'var(--c-danger)' : 'var(--c-success)'
                          }} />
                        </div>
                        <span style={{ color: row.cpu > 80 ? 'var(--c-danger)' : 'var(--c-text)' }}>
                          {row.cpu.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: row.memory > 85 ? 'var(--c-danger)' : row.memory > 70 ? 'var(--c-warning)' : 'var(--c-text)' }}>
                        {row.memory.toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color: row.link_status === 1 ? 'var(--c-success)' : 'var(--c-danger)',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.link_status === 1 ? 'var(--c-success)' : 'var(--c-danger)', display: 'inline-block' }} />
                        {row.link_status === 1 ? 'UP' : 'DOWN'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: labelColor(row.failure_label) + '20',
                        border: `1px solid ${labelColor(row.failure_label)}40`,
                        color: labelColor(row.failure_label),
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                        {FAILURE_LABEL_MAP[row.failure_label] || 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>
            Page {page + 1} of {Math.max(1, totalPages)} · Showing {data.length} of {total.toLocaleString()} rows
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: 10 }}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft size={10} /> PREV
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: 10 }}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              NEXT <ChevronRight size={10} />
            </button>
          </div>
        </div>
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
