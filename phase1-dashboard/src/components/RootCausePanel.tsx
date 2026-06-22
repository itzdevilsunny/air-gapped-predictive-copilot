import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, ShieldAlert, CheckCircle, Terminal, Clipboard, Copy } from 'lucide-react';

interface RootCauseReport {
  router_id: string;
  router_name: string;
  status: 'NORMAL' | 'PREDICTIVE' | 'CRITICAL';
  root_cause: string;
  confidence_score: number;
  rule_triggered: string;
  ai_attribution: string;
  evidences: string[];
  cli_fix: string;
  latest_metrics: Record<string, number>;
}

interface RootCausePanelProps {
  api: string;
}

export function RootCausePanel({ api }: RootCausePanelProps) {
  const [reports, setReports] = useState<Record<string, RootCauseReport>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchReports = useCallback(() => {
    fetch(`${api}/api/ph4/root_cause`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch root cause analysis reports');
        return res.json();
      })
      .then((data: Record<string, RootCauseReport>) => {
        setReports(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Error fetching diagnostics');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api]);

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 3000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  const handleCopyCli = (routerId: string, cliText: string) => {
    navigator.clipboard.writeText(cliText)
      .then(() => {
        setCopiedId(routerId);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy CLI commands', err);
      });
  };

  const reportList = Object.values(reports);
  const activeAlerts = reportList.filter(r => r.status !== 'NORMAL');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Engine Control Header ─── */}
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
            background: '#a855f715',
            border: '1px solid #a855f730',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#c084fc'
          }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 750, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Root Cause Correlation Engine
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                background: '#a855f720',
                color: '#c084fc',
                border: '1px solid #a855f740',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)'
              }}>RULE + AI HYBRID FUSION</span>
            </h2>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0 0' }}>
              Correlates multi-dimensional metric anomalies (using hard thresholds) and XGBoost predictions (AI attributions) to output immediate root causes and proactive IOS mitigation commands.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Hybrid Engine Status</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              ONLINE
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Active Incidents</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: activeAlerts.length > 0 ? '#f43f5e' : '#cbd5e1' }}>
              {activeAlerts.length} Faults / Warnings
            </div>
          </div>
        </div>
      </div>

      {/* ─── Diagnostics Grid / List ─── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw className="spin" style={{ marginBottom: 12 }} />
          <div>Correlating telemetry signals and failure attributions...</div>
        </div>
      ) : error ? (
        <div style={{ background: '#f43f5e15', border: '1px solid #f43f5e30', color: '#fda4af', padding: 16, borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {reportList.map((router) => {
            const isNormal = router.status === 'NORMAL';
            const isPredictive = router.status === 'PREDICTIVE';
            const isCritical = router.status === 'CRITICAL';
            
            let statusLabel = 'OPERATIONAL';
            let badgeBg = '#10b98120';
            let badgeColor = '#10b981';
            let cardBorder = '#1e293b';
            
            if (isPredictive) {
              statusLabel = 'PREDICTIVE WARNING';
              badgeBg = '#f59e0b20';
              badgeColor = '#f59e0b';
              cardBorder = '#f59e0b35';
            } else if (isCritical) {
              statusLabel = 'CRITICAL FAULT';
              badgeBg = '#f43f5e20';
              badgeColor = '#f43f5e';
              cardBorder = '#f43f5e35';
            }

            return (
              <div
                key={router.router_id}
                style={{
                  background: '#0a0f1d',
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 8,
                  padding: 20,
                  display: 'grid',
                  gridTemplateColumns: '1fr 380px',
                  gap: 24,
                  transition: 'all 0.2s'
                }}
              >
                {/* Left Side: Diagnostics and Evidences */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Card Title */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                        {router.router_name} ({router.router_id})
                      </h3>
                      <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                        IP Address: {router.latest_metrics.link_status === 0 ? 'CONNECTION DOWN' : `10.100.${router.router_id === 'ISTRAC-BGL' ? '10' : router.router_id === 'SDSC-SHAR' ? '20' : router.router_id === 'MCF-HSN' ? '30' : router.router_id === 'NOC-DEL' ? '40' : router.router_id === 'NOC-MUM' ? '50' : '60'}.1`}
                      </span>
                    </div>

                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${badgeColor}35`,
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Diagnosis Details */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                    background: '#02061760',
                    padding: 12,
                    borderRadius: 6,
                    borderLeft: `3px solid ${badgeColor}`
                  }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Diagnosed Root Cause</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isNormal ? '#cbd5e1' : badgeColor }}>
                        {router.root_cause}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Analysis Confidence</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                        {router.confidence_score}%
                      </div>
                    </div>
                  </div>

                  {/* Logic Attributions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 11 }}>
                    <div>
                      <div style={{ fontWeight: 650, color: '#64748b', marginBottom: 4 }}>Rule Correlation Match:</div>
                      <div style={{
                        background: '#02061730',
                        border: '1px solid #1e293b50',
                        borderRadius: 4,
                        padding: '6px 10px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: router.rule_triggered !== 'None' ? '#f59e0b' : '#cbd5e1'
                      }}>
                        {router.rule_triggered}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 650, color: '#64748b', marginBottom: 4 }}>XGBoost Classifier Attribution:</div>
                      <div style={{
                        background: '#02061730',
                        border: '1px solid #1e293b50',
                        borderRadius: 4,
                        padding: '6px 10px',
                        fontSize: 10,
                        color: router.ai_attribution.includes('early') ? '#a855f7' : '#cbd5e1'
                      }}>
                        {router.ai_attribution}
                      </div>
                    </div>
                  </div>

                  {/* Evidences Bullet logs */}
                  <div>
                    <h4 style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' }}>
                      Telemetry Evidence Logs
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {router.evidences.map((evidence, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                          <span style={{ color: badgeColor, fontSize: 12 }}>•</span>
                          <span>{evidence}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Proactive Cisco CLI console */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <Terminal size={12} />
                      Cisco IOS Recommended Fix
                    </div>
                    <button
                      onClick={() => handleCopyCli(router.router_id, router.cli_fix)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedId === router.router_id ? '#10b981' : '#64748b',
                        cursor: 'pointer',
                        fontSize: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 4,
                        transition: 'color 0.2s'
                      }}
                    >
                      {copiedId === router.router_id ? <CheckCircle size={10} /> : <Copy size={10} />}
                      {copiedId === router.router_id ? 'Copied' : 'Copy Fix'}
                    </button>
                  </div>

                  <pre style={{
                    flex: 1,
                    margin: 0,
                    background: '#020617',
                    border: '1px solid #1e293b',
                    borderRadius: 6,
                    padding: '12px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#10b981',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.4
                  }}>
                    {router.cli_fix}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
