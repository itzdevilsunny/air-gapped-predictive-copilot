import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Spike {
  metric: string;
  type: string;
  current: number;
  baseline: number;
  severity: string;
  message: string;
}

interface RouterAnomalyInfo {
  router_id: string;
  router_name: string;
  is_anomaly: boolean;
  anomaly_score: number;
  explanation: string;
  spikes: Spike[];
  latest_metrics: Record<string, number>;
}

interface ModelStatus {
  trained: boolean;
  status: string;
  trained_at: string | null;
  num_samples: number;
}

interface AnomalyPanelProps {
  api: string;
}

export function AnomalyPanel({ api }: AnomalyPanelProps) {
  const [anomalies, setAnomalies] = useState<Record<string, RouterAnomalyInfo>>({});
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch model status
  const fetchModelStatus = useCallback(() => {
    fetch(`${api}/api/ph3/model/status`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch model status');
        return res.json();
      })
      .then((data: ModelStatus) => {
        setModelStatus(data);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [api]);

  // Fetch live anomalies
  const fetchAnomalies = useCallback(() => {
    fetch(`${api}/api/ph3/anomalies`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch anomaly data');
        return res.json();
      })
      .then((data: Record<string, RouterAnomalyInfo>) => {
        setAnomalies(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Error fetching anomalies');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api]);

  useEffect(() => {
    fetchModelStatus();
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 3000);
    return () => clearInterval(interval);
  }, [fetchAnomalies, fetchModelStatus]);

  // Retrain model
  const handleRetrain = () => {
    setRetraining(true);
    fetch(`${api}/api/ph3/train`, { method: 'POST' })
      .then(res => {
        if (!res.ok) throw new Error('Retraining failed');
        return res.json();
      })
      .then(() => {
        fetchModelStatus();
        fetchAnomalies();
      })
      .catch((err) => {
        alert(err.message || 'Error retraining Isolation Forest');
      })
      .finally(() => {
        setRetraining(false);
      });
  };

  const routerList = Object.values(anomalies);
  const totalAnomalies = routerList.filter(r => r.is_anomaly).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Model Control Panel ─── */}
      <div style={{
        background: '#0a0f1d',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: '#0284c715',
            border: '1px solid #0284c730',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 750, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Isolation Forest Anomaly Engine
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                background: '#10b98120',
                color: '#10b981',
                border: '1px solid #10b98140',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)'
              }}>UNSUPERVISED LEARNING</span>
            </h2>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0 0' }}>
              Establishes a normal multidimensional traffic profile to isolate unexpected latency spikes, packet loss anomalies, and link surges.
            </p>
          </div>
        </div>

        {/* Model Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Contamination Rate</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>4.0%</div>
          </div>
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Training Size</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
              {modelStatus?.trained ? `${modelStatus.num_samples} snapshots` : '--'}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Last Tuned</div>
            <div style={{ fontSize: 11, fontWeight: 650, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              {modelStatus?.trained_at ? new Date(modelStatus.trained_at).toLocaleTimeString() : 'Never'}
            </div>
          </div>
          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={14} className={retraining ? 'spin' : ''} />
            {retraining ? 'Fitting Baselines...' : 'Re-fit Baselines'}
          </button>
        </div>
      </div>

      {/* ─── Summary Strip ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16
      }}>
        <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px' }}>
          <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Engine Health</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            Operational
          </div>
        </div>
        <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px' }}>
          <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Anomalies</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: totalAnomalies > 0 ? '#f43f5e' : '#f8fafc', marginTop: 4 }}>
            {totalAnomalies} of 6 Routers
          </div>
        </div>
        <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, padding: '12px 16px' }}>
          <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anomaly Threshold</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            score &gt; 0.500
          </div>
        </div>
      </div>

      {/* ─── Anomalies Grid ─── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw className="spin" style={{ marginBottom: 12 }} />
          <div>Analyzing network telemetry patterns...</div>
        </div>
      ) : error ? (
        <div style={{ background: '#f43f5e15', border: '1px solid #f43f5e30', color: '#fda4af', padding: 16, borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {routerList.map((router) => {
            const cardBorderColor = router.is_anomaly ? '#f43f5e40' : '#1e293b';
            const cardBgColor = router.is_anomaly ? '#0f050b' : '#0a0f1d';
            
            return (
              <div
                key={router.router_id}
                style={{
                  background: cardBgColor,
                  border: `1px solid ${cardBorderColor}`,
                  borderRadius: 8,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  transition: 'all 0.2s'
                }}
              >
                {/* Router Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                      {router.router_name}
                    </h3>
                    <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                      {router.router_id}
                    </span>
                  </div>

                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: router.is_anomaly ? '#f43f5e20' : '#10b98120',
                    color: router.is_anomaly ? '#f43f5e' : '#10b981',
                    border: `1px solid ${router.is_anomaly ? '#f43f5e40' : '#10b98140'}`
                  }}>
                    {router.is_anomaly ? 'ANOMALOUS' : 'NORMAL TRAFFIC'}
                  </span>
                </div>

                {/* Explanatory Description */}
                <div style={{
                  background: '#02061760',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 11,
                  color: '#e2e8f0',
                  lineHeight: 1.4,
                  borderLeft: `3px solid ${router.is_anomaly ? '#f43f5e' : '#10b981'}`
                }}>
                  {router.explanation}
                </div>

                {/* Metrics Breakdown */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    <span>Telemetry Feature Baseline Checks</span>
                    <span>Anomaly Score: <strong style={{ color: router.is_anomaly ? '#f43f5e' : '#94a3b8', fontFamily: 'var(--font-mono)' }}>{router.anomaly_score.toFixed(4)}</strong></span>
                  </div>
                  
                  {/* Progress bar of anomaly score */}
                  <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (router.anomaly_score / 0.8) * 100)}%`,
                      background: router.is_anomaly ? '#f43f5e' : '#10b981',
                      transition: 'width 0.4s'
                    }} />
                  </div>

                  {/* Metrics grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    fontSize: 11
                  }}>
                    {[
                      { label: 'Latency', value: `${router.latest_metrics.latency}ms` },
                      { label: 'Packet Loss', value: `${router.latest_metrics.packet_loss}%` },
                      { label: 'Jitter', value: `${router.latest_metrics.jitter}ms` },
                      { label: 'Bandwidth', value: `${router.latest_metrics.bandwidth}%` },
                      { label: 'CPU Usage', value: `${router.latest_metrics.cpu}%` },
                      { label: 'Memory', value: `${router.latest_metrics.memory}%` },
                    ].map((metric, i) => (
                      <div key={i} style={{ background: '#02061730', border: '1px solid #1e293b40', borderRadius: 4, padding: '6px 10px' }}>
                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{metric.label}</div>
                        <div style={{ fontWeight: 650, color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                          {metric.value !== undefined ? metric.value : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Spikes / Surges detected */}
                {router.spikes.length > 0 && (
                  <div style={{ borderTop: '1px solid #1e293b50', paddingTop: 12 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={12} color="#f59e0b" />
                      Detected Telemetry Spikes ({router.spikes.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {router.spikes.map((spike, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: spike.severity === 'CRITICAL' ? '#f43f5e10' : '#f59e0b10',
                            border: `1px solid ${spike.severity === 'CRITICAL' ? '#f43f5e20' : '#f59e0b20'}`,
                            borderRadius: 4,
                            padding: '6px 10px',
                            fontSize: 10,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            color: spike.severity === 'CRITICAL' ? '#fda4af' : '#fde047'
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {spike.type} ({spike.metric})
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            Current: <strong>{spike.current}</strong> (Base: {spike.baseline})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
