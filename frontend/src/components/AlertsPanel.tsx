import React, { useState } from 'react';
import type { ActiveAlert, RouterState } from '../types';
import { ShieldCheck, ShieldAlert, AlertTriangle, Zap, RefreshCw, Download } from 'lucide-react';

interface AlertsPanelProps {
  alerts: ActiveAlert[];
  telemetryData: Record<string, RouterState>;
  onMitigate: (routerId: string) => Promise<void>;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  telemetryData,
  onMitigate,
}) => {
  const [mitigatingIds, setMitigatingIds] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const handleMitigateClick = async (routerId: string) => {
    setMitigatingIds(prev => ({ ...prev, [routerId]: true }));
    try {
      await onMitigate(routerId);
    } finally {
      setMitigatingIds(prev => ({ ...prev, [routerId]: false }));
    }
  };

  const handleExportReport = async () => {
    setExporting(true);
    
    // Calculate SLA stats
    const nodes = Object.values(telemetryData);
    let totalCpu = 0;
    let totalLatency = 0;
    let maxLoss = 0;

    nodes.forEach(n => {
      totalCpu += n.telemetry.cpu;
      totalLatency += n.telemetry.latency;
      if (n.telemetry.packet_loss > maxLoss) {
        maxLoss = n.telemetry.packet_loss;
      }
    });

    const stats = {
      avgCpu: nodes.length > 0 ? Math.round(totalCpu / nodes.length) : 0,
      avgLat: nodes.length > 0 ? Math.round(totalLatency / nodes.length) : 0,
      maxLoss: parseFloat(maxLoss.toFixed(2))
    };

    try {
      const response = await fetch('/api/export-incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts, stats }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.html) {
          const blob = new Blob([data.html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `isro-prednoc-sla-report-${new Date().toISOString().split('T')[0]}.html`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error('Failed to export SLA incident report:', err);
    } finally {
      setExporting(false);
    }
  };

  // Find overall highest risk
  let maxRiskRouter = '';
  let maxRiskScore = 0;
  let activeAnomaliesCount = 0;

  Object.values(telemetryData).forEach((state) => {
    if (state.analysis.failure_risk > maxRiskScore) {
      maxRiskScore = state.analysis.failure_risk;
      maxRiskRouter = state.telemetry.router_name;
    }
    if (state.analysis.is_anomaly) {
      activeAnomaliesCount++;
    }
  });

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col h-[250px] overflow-hidden">
      {/* Panel Title */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-display text-sm tracking-widest text-noc-muted uppercase flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-noc-danger" />
          ML PREDICTION & ANOMALY LOG
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportReport}
            disabled={exporting}
            id="btn-export-report"
            className="bg-noc-primary/20 hover:bg-noc-primary/35 text-noc-primary border border-noc-primary/50 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 transition-all duration-200 disabled:opacity-50"
            title="Export SLA Incident Report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'EXPORTING...' : 'EXPORT REPORT'}</span>
          </button>
          <span className="text-[10px] bg-noc-border/80 border border-noc-border text-noc-text/80 px-2 py-0.5 rounded font-mono">
            MODEL: XGBOOST + ISO-FOREST
          </span>
        </div>
      </div>

      {/* Grid: Stats Summary + Scrollable Alert Stream */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden">
        {/* ML Status Card */}
        <div className="bg-[#030611]/70 border border-noc-border/30 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-mono text-noc-muted uppercase tracking-wider block">Network Risk Health</span>
            {maxRiskScore > 70 ? (
              <div className="text-noc-danger font-display text-lg font-bold mt-1 animate-pulse flex items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 text-noc-danger" />
                CRITICAL STATE
              </div>
            ) : maxRiskScore > 35 ? (
              <div className="text-noc-warning font-display text-lg font-bold mt-1 flex items-center gap-1.5">
                <ActivityIcon className="w-5 h-5 text-noc-warning" />
                ELEVATED RISK
              </div>
            ) : (
              <div className="text-noc-success font-display text-lg font-bold mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-noc-success" />
                SECURE (NOMINAL)
              </div>
            )}
          </div>

          <div className="border-t border-noc-border/20 pt-2 mt-2 flex justify-between text-xs font-mono">
            <div>
              <span className="text-noc-muted block text-[9px] uppercase">Anomalies</span>
              <span className={`font-semibold ${activeAnomaliesCount > 0 ? 'text-noc-warning' : 'text-noc-success'}`}>
                {activeAnomaliesCount} Active
              </span>
            </div>
            <div className="text-right">
              <span className="text-noc-muted block text-[9px] uppercase">Peak Predict</span>
              <span className={`font-semibold ${maxRiskScore > 50 ? 'text-noc-danger' : 'text-noc-success'}`}>
                {maxRiskScore}% ({maxRiskRouter.split(' ')[0] || 'N/A'})
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Alerts Log */}
        <div className="md:col-span-2 bg-[#030611]/40 border border-noc-border/30 rounded-lg p-2 overflow-y-auto flex flex-col gap-1.5 h-[155px]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-noc-muted">
              <ShieldCheck className="w-8 h-8 text-noc-success/40 mb-1" />
              <span className="text-xs">No active ML alarms or tunnel drops detected</span>
            </div>
          ) : (
            alerts.map((alert, idx) => {
              const telemetry = telemetryData[alert.router_id]?.telemetry;
              const isLinkDown = telemetry?.link_status === 0;
              const isMitigating = mitigatingIds[alert.router_id] || false;

              return (
                <div
                  key={`alert-${alert.router_id}-${idx}`}
                  id={`alert-row-${alert.router_id}`}
                  className={`flex items-center justify-between p-2 rounded border glass-panel transition-all duration-300 ${
                    isLinkDown 
                      ? 'border-noc-danger/40 bg-noc-danger/5' 
                      : alert.risk_score > 70 
                        ? 'border-noc-danger/30 bg-noc-danger/5' 
                        : 'border-noc-warning/30 bg-noc-warning/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="relative flex-shrink-0">
                      <span className={`flex h-2.5 w-2.5 rounded-full ${isLinkDown || alert.risk_score > 70 ? 'bg-noc-danger' : 'bg-noc-warning'} animate-ping absolute`} />
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLinkDown || alert.risk_score > 70 ? 'bg-noc-danger' : 'bg-noc-warning'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-noc-text truncate">{alert.router_name}</span>
                        <span className={`text-[9px] font-mono font-semibold px-1 rounded ${
                          isLinkDown || alert.risk_score > 70 
                            ? 'bg-noc-danger/10 text-noc-danger border border-noc-danger/25' 
                            : 'bg-noc-warning/10 text-noc-warning border border-noc-warning/25'
                        }`}>
                          {isLinkDown ? 'LINK DOWN' : `FAIL RISK ${alert.risk_score}%`}
                        </span>
                      </div>
                      <p className="text-[10px] text-noc-muted truncate mt-0.5">
                        Cause: {alert.root_cause} • {new Date(alert.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {/* Mitigation Action Trigger */}
                  <button
                    id={`btn-mitigate-${alert.router_id}`}
                    onClick={() => handleMitigateClick(alert.router_id)}
                    disabled={isMitigating}
                    className="flex-shrink-0 ml-3 bg-noc-success/20 hover:bg-noc-success/35 text-noc-success border border-noc-success/40 text-[10px] font-mono font-semibold px-2.5 py-1 rounded flex items-center gap-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-glow-green"
                  >
                    {isMitigating ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    <span>MITIGATE (SELF-HEAL)</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// Internal icon replacement helper
const ActivityIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
