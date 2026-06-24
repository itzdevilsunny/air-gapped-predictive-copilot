import React, { useState, useEffect, useCallback } from 'react';
import { 
  Brain, Cpu, AlertTriangle, RefreshCw, CheckCircle2, 
  TrendingUp, TrendingDown, Clock, ShieldAlert, ShieldCheck, Zap
} from 'lucide-react';

interface Prediction {
  router_id: string;
  router_name: string;
  risk_score: number;
  prediction: string;
  eta_minutes: number | null;
  failure_type: string;
}

interface ModelStatus {
  trained: boolean;
  status: string;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  trained_at: string | null;
  num_samples: number;
}

interface PredictionPanelProps {
  api: string;
}

export function PredictionPanel({ api }: PredictionPanelProps) {
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPredictions = useCallback(() => {
    fetch(`${api}/api/ph2/predictions`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch predictions");
        return res.json();
      })
      .then(setPredictions)
      .catch(err => {
        console.error("Error fetching predictions:", err);
      });
  }, [api]);

  const fetchModelStatus = useCallback(() => {
    setLoading(true);
    fetch(`${api}/api/ph2/model/status`)
      .then(res => res.json())
      .then(data => {
        setModelStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching model status:", err);
        setLoading(false);
      });
  }, [api]);

  // Poll predictions every 10s, fetch model status on load
  useEffect(() => {
    fetchModelStatus();
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 10000);
    return () => clearInterval(interval);
  }, [fetchModelStatus, fetchPredictions]);

  const handleRetrain = () => {
    setRetraining(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    fetch(`${api}/api/ph2/train`, { method: 'POST' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Retraining failed");
        }
        return data;
      })
      .then(data => {
        setSuccessMessage(`Retrained successfully! Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
        fetchModelStatus();
        fetchPredictions();
      })
      .catch(err => {
        setErrorMessage(err.message || "Model retraining failed. Accumulate more telemetry first.");
      })
      .finally(() => {
        setRetraining(false);
      });
  };

  const getRiskColor = (score: number) => {
    if (score < 30) return 'var(--c-success)';
    if (score < 60) return 'var(--c-warning)';
    if (score < 80) return 'var(--c-orange)';
    return 'var(--c-danger)';
  };

  const getRiskBadgeClass = (score: number) => {
    if (score < 30) return 'pill-success';
    if (score < 60) return 'pill-warning';
    return 'pill-danger';
  };

  // Radial Gauge SVG Generator
  const renderGauge = (score: number) => {
    const radius = 50;
    const stroke = 8;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const color = getRiskColor(score);

    return (
      <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifySelf: 'center' }}>
        <svg height={120} width={120}>
          {/* Background circle */}
          <circle
            stroke="var(--c-border)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={60}
            cy={60}
          />
          {/* Progress circle */}
          <circle
            stroke={color}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            r={normalizedRadius}
            cx={60}
            cy={60}
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 900,
            color: color,
            lineHeight: 1
          }}>{score}%</span>
          <span style={{ fontSize: 8, color: 'var(--c-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Risk</span>
        </div>
      </div>
    );
  };

  const predictionsList = Object.values(predictions);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fade-in 0.4s ease' }}>
      
      {/* ── Model Control Card ──────────────────────────────────────────────── */}
      <div className="glass-card animate-fade-in" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            padding: 12,
            background: 'var(--c-purple)15',
            borderRadius: 10,
            border: '1px solid var(--c-purple)40',
            color: 'var(--c-purple)',
            boxShadow: '0 0 15px var(--c-purple)15'
          }}>
            <Brain size={24} className={retraining ? "animate-spin" : ""} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8 }}>
              XGBoost Failure Prediction Engine
              {modelStatus?.trained ? (
                <span className="pill pill-success" style={{ fontSize: 8, padding: '1px 6px' }}>
                  <ShieldCheck size={8} /> MODEL ACTIVE
                </span>
              ) : (
                <span className="pill pill-muted" style={{ fontSize: 8, padding: '1px 6px' }}>
                  <ShieldAlert size={8} /> MODEL PENDING
                </span>
              )}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
              Analyzes multi-dimensional sliding metrics to detect hardware & congestion precursors 30–45 minutes in advance.
            </p>
          </div>
        </div>

        {/* Model Status Metrics */}
        <div style={{ display: 'flex', gap: 30 }}>
          <div style={{ borderLeft: '2px solid var(--c-border)', paddingLeft: 12 }}>
            <div className="section-label" style={{ fontSize: 8 }}>Accuracy</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: 'var(--c-primary)' }}>
              {modelStatus?.accuracy ? `${(modelStatus.accuracy * 100).toFixed(1)}%` : '--'}
            </div>
          </div>
          <div style={{ borderLeft: '2px solid var(--c-border)', paddingLeft: 12 }}>
            <div className="section-label" style={{ fontSize: 8 }}>Training Samples</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: 'var(--c-primary)' }}>
              {modelStatus?.num_samples || 0}
            </div>
          </div>
          <div style={{ borderLeft: '2px solid var(--c-border)', paddingLeft: 12 }}>
            <div className="section-label" style={{ fontSize: 8 }}>Last Retrained</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-text)', marginTop: 4 }}>
              <Clock size={12} style={{ color: 'var(--c-muted)' }} />
              {modelStatus?.trained_at ? new Date(modelStatus.trained_at).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>

        {/* Retrain Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button 
            className="btn btn-primary" 
            onClick={handleRetrain} 
            disabled={retraining}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
          >
            <RefreshCw size={13} className={retraining ? "animate-spin" : ""} />
            {retraining ? "Training Model..." : "Retrain XGBoost"}
          </button>
          
          {successMessage && (
            <span style={{ fontSize: 9, color: 'var(--c-success)', fontFamily: 'var(--font-mono)' }}>
              {successMessage}
            </span>
          )}
          {errorMessage && (
            <span style={{ fontSize: 9, color: 'var(--c-danger)', fontFamily: 'var(--font-mono)' }}>
              {errorMessage}
            </span>
          )}
        </div>
      </div>

      {/* ── Predictions Router Grid ─────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: 20
      }}>
        {predictionsList.length === 0 ? (
          <div className="glass-card animate-fade-in" style={{ gridColumn: '1/-1', padding: '40px 24px', textAlign: 'center', color: 'var(--c-muted)' }}>
            <Brain size={32} style={{ color: 'var(--c-border)', marginBottom: 8 }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>No predictions telemetry available. Start the network generator to stream metrics.</p>
          </div>
        ) : (
          predictionsList.map(pred => {
            const isHighRisk = pred.risk_score >= 80;
            const cardBorder = isHighRisk 
              ? '1px solid var(--c-danger)' 
              : '1px solid var(--c-border)';
            const cardShadow = isHighRisk 
              ? '0 0 20px var(--c-danger)15' 
              : 'none';
              
            return (
              <div 
                key={pred.router_id} 
                className="glass-card animate-fade-in" 
                style={{ 
                  padding: 20, 
                  border: cardBorder, 
                  boxShadow: cardShadow, 
                  transition: 'all 0.3s ease',
                  animation: isHighRisk ? 'pulse-border 2s infinite' : 'none'
                }}
              >
                {/* Router Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15, color: 'var(--c-text)' }}>
                      {pred.router_name}
                    </h3>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)' }}>
                      {pred.router_id}
                    </span>
                  </div>
                  <span className={`pill ${getRiskBadgeClass(pred.risk_score)}`}>
                    {pred.risk_score >= 50 ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                    {pred.risk_score >= 80 ? 'CRITICAL ALERT' : pred.risk_score >= 30 ? 'ELEVATED RISK' : 'STABLE'}
                  </span>
                </div>

                {/* SVG Gauge & Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                  {renderGauge(pred.risk_score)}
                  
                  {/* Warning Details Panel */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="section-label" style={{ fontSize: 8 }}>NOC Predictor Status</div>
                    
                    {pred.risk_score >= 30 ? (
                      <div style={{ 
                        background: pred.risk_score >= 80 ? 'var(--c-danger)10' : 'var(--c-warning)10',
                        borderLeft: `3px solid ${getRiskColor(pred.risk_score)}`,
                        padding: '8px 10px',
                        borderRadius: '0 6px 6px 0'
                      }}>
                        <p style={{ 
                          fontSize: 11, 
                          color: 'var(--c-text)', 
                          fontWeight: 700, 
                          lineHeight: 1.4,
                          margin: 0
                        }}>
                          {pred.prediction}
                        </p>
                      </div>
                    ) : (
                      <div style={{ 
                        background: 'var(--c-success)08',
                        borderLeft: '3px solid var(--c-success)',
                        padding: '8px 10px',
                        borderRadius: '0 6px 6px 0'
                      }}>
                        <p style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 500, margin: 0 }}>
                          Device operational. Telemetry indicators are stable.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulated ETA & Status Indicator */}
                {pred.risk_score >= 30 && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    borderTop: '1px dashed var(--c-border)', 
                    paddingTop: 12, 
                    fontSize: 11, 
                    fontFamily: 'var(--font-mono)' 
                  }}>
                    <Zap size={12} style={{ color: getRiskColor(pred.risk_score) }} />
                    <span style={{ color: 'var(--c-muted)' }}>Estimated Impact window:</span>
                    <span style={{ color: getRiskColor(pred.risk_score), fontWeight: 700 }}>
                      {pred.eta_minutes} mins (Simulated scale)
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Styled animation for high risk pulse */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: var(--c-danger); box-shadow: 0 0 10px rgba(244, 63, 94, 0.2); }
          50% { border-color: rgba(244, 63, 94, 0.4); box-shadow: 0 0 4px rgba(244, 63, 94, 0.05); }
        }
      `}</style>
    </div>
  );
}
