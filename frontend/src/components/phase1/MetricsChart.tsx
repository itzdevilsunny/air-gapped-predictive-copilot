import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Brush
} from 'recharts';
import type { Router, Snapshot } from './types';
import { METRIC_COLORS } from './types';
import { RefreshCw, Activity, Database } from 'lucide-react';

interface Props {
  api: string;
  routers: Router[];
  selectedRouterId: string;
  onSelectRouter: (id: string) => void;
}

type TimeRange = '2m' | '5m' | '10m' | '30m' | '60m';
type MetricKey = 'latency' | 'packet_loss' | 'jitter' | 'bandwidth' | 'cpu' | 'memory';

const TIME_RANGES: { value: TimeRange; label: string; minutes: number }[] = [
  { value: '2m',  label: '2 MIN',  minutes: 2  },
  { value: '5m',  label: '5 MIN',  minutes: 5  },
  { value: '10m', label: '10 MIN', minutes: 10 },
  { value: '30m', label: '30 MIN', minutes: 30 },
  { value: '60m', label: '1 HR',   minutes: 60 },
];

const METRICS: { key: MetricKey; label: string; unit: string; threshold?: number }[] = [
  { key: 'latency',     label: 'Latency',     unit: 'ms',  threshold: 100 },
  { key: 'packet_loss', label: 'Packet Loss',  unit: '%',   threshold: 2   },
  { key: 'jitter',      label: 'Jitter',       unit: 'ms',  threshold: 5   },
  { key: 'bandwidth',   label: 'Bandwidth Util', unit: '%', threshold: 80  },
  { key: 'cpu',         label: 'CPU',          unit: '%',   threshold: 80  },
  { key: 'memory',      label: 'Memory',       unit: '%',   threshold: 85  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0a1628',
      border: '1px solid var(--c-border)',
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11
    }}>
      <p style={{ color: 'var(--c-muted)', marginBottom: 6, fontSize: 10 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
          {METRICS.find(m => m.key === p.dataKey)?.unit}
        </div>
      ))}
    </div>
  );
};

export const MetricsChart: React.FC<Props> = ({ api, routers, selectedRouterId, onSelectRouter }) => {
  const [data, setData] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('10m');
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(['cpu', 'memory', 'latency', 'packet_loss']);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dataSource, setDataSource] = useState<'sqlite' | 'influx'>('sqlite');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const minutes = TIME_RANGES.find(t => t.value === timeRange)?.minutes ?? 10;

  const fetchData = useCallback(async () => {
    if (!selectedRouterId) return;
    setLoading(true);
    try {
      const url = dataSource === 'sqlite'
        ? `${api}/api/ph1/metrics/${selectedRouterId}?minutes=${minutes}&limit=500`
        : `${api}/api/ph1/metrics/${selectedRouterId}/influx?minutes=${minutes}`;
      
      const r = await fetch(url);
      if (!r.ok) throw new Error('Fetch failed');
      
      if (dataSource === 'influx') {
        const j = await r.json();
        setData(j.records || []);
      } else {
        const j = await r.json();
        setData(j);
      }
      setLastFetch(new Date());
    } catch (e) {
      // Silently handle — InfluxDB may not be available
    }
    setLoading(false);
  }, [selectedRouterId, minutes, dataSource, api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchData, 4000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchData]);

  const toggleMetric = (key: MetricKey) => {
    setActiveMetrics(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  };

  const chartData = data.map(s => ({
    ...s,
    time: new Date(s.timestamp).toLocaleTimeString(),
  }));

  const router = routers.find(r => r.id === selectedRouterId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Controls ── */}
      <div className="glass-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Router select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>ROUTER:</span>
            <select
              value={selectedRouterId}
              onChange={e => onSelectRouter(e.target.value)}
              style={selectStyle}
            >
              {routers.map(r => <option key={r.id} value={r.id}>{r.id} — {r.name}</option>)}
            </select>
          </div>

          {/* Time range */}
          <div style={{ display: 'flex', gap: 4 }}>
            {TIME_RANGES.map(t => (
              <button
                key={t.value}
                className={`btn ${timeRange === t.value ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: 10, border: `1px solid ${timeRange === t.value ? 'var(--c-primary)50' : 'var(--c-border)'}` }}
                onClick={() => setTimeRange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Data source toggle */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {(['sqlite', 'influx'] as const).map(src => (
              <button
                key={src}
                className={`btn ${dataSource === src ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: 10, border: `1px solid ${dataSource === src ? 'var(--c-primary)50' : 'var(--c-border)'}` }}
                onClick={() => setDataSource(src)}
              >
                <Database size={10} />
                {src.toUpperCase()}
              </button>
            ))}
            <button
              className={`btn ${autoRefresh ? 'btn-success' : ''}`}
              style={{ padding: '4px 10px', fontSize: 10 }}
              onClick={() => setAutoRefresh(p => !p)}
            >
              <RefreshCw size={10} style={{ animation: autoRefresh && loading ? 'spin 1s linear infinite' : 'none' }} />
              AUTO
            </button>
          </div>
        </div>
      </div>

      {/* ── Metric toggle buttons ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: `1px solid ${activeMetrics.includes(m.key) ? METRIC_COLORS[m.key] + '80' : 'var(--c-border)'}`,
              background: activeMetrics.includes(m.key) ? METRIC_COLORS[m.key] + '15' : 'transparent',
              color: activeMetrics.includes(m.key) ? METRIC_COLORS[m.key] : 'var(--c-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.2s'
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: METRIC_COLORS[m.key], display: 'inline-block' }} />
            {m.label.toUpperCase()} ({m.unit})
          </button>
        ))}
      </div>

      {/* ── Chart ── */}
      <div className="glass-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} color="var(--c-primary)" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--c-primary)' }}>
                {router?.name || selectedRouterId}
              </span>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)', marginTop: 2 }}>
              {chartData.length} data points · Source: {dataSource.toUpperCase()} · {lastFetch?.toLocaleTimeString() || '--'}
            </div>
          </div>
          {loading && (
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-primary)' }} />
          )}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--c-muted)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--c-muted)' }}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)' }}
              />
              <Brush dataKey="time" height={20} stroke="var(--c-border)" fill="var(--c-bg2)"
                travellerWidth={6}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}
              />
              {activeMetrics.map(key => {
                const m = METRICS.find(x => x.key === key)!;
                return (
                  <React.Fragment key={key}>
                    <Line
                      type="monotone"
                      dataKey={key}
                      name={m.label}
                      stroke={METRIC_COLORS[key]}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                    {m.threshold && (
                      <ReferenceLine
                        y={m.threshold}
                        stroke={METRIC_COLORS[key]}
                        strokeDasharray="6 4"
                        strokeOpacity={0.4}
                        label={{ value: `${key} threshold`, position: 'insideTopLeft', fontSize: 9, fill: METRIC_COLORS[key] + '60', fontFamily: 'var(--font-mono)' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {loading ? 'Loading data...' : 'No data available. Start the generator to populate metrics.'}
          </div>
        )}
      </div>

      {/* ── Latest Values Summary ── */}
      {chartData.length > 0 && (() => {
        const latest = chartData[chartData.length - 1];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {METRICS.map(m => {
              const val = latest[m.key as keyof typeof latest] as number | undefined;
              const overThreshold = m.threshold && val && val > m.threshold;
              return (
                <div key={m.key} className="glass-card" style={{ padding: '10px 12px' }}>
                  <div className="section-label" style={{ marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: overThreshold ? 'var(--c-danger)' : METRIC_COLORS[m.key], lineHeight: 1 }}>
                    {val !== undefined ? val.toFixed(1) : '--'}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--c-muted)' }}>{m.unit}</div>
                  {m.threshold && val && (
                    <div className="progress-bar" style={{ marginTop: 6 }}>
                      <div className="progress-fill" style={{
                        width: `${Math.min((val / m.threshold) * 100, 100)}%`,
                        background: overThreshold ? 'var(--c-danger)' : METRIC_COLORS[m.key]
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
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
