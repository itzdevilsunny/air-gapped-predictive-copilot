import React, { useState } from 'react';
import type { RouterState, EnrichedHistoryPoint } from '../types';
import { ShieldCheck, Cpu, HardDrive, Network, Copy, Check, Activity, BarChart2 } from 'lucide-react';
import { DiagnosticConsole } from './DiagnosticConsole';

interface RouterDetailsProps {
  routerId: string;
  routerState: RouterState;
  history: EnrichedHistoryPoint[];
  onMitigate: (routerId: string) => Promise<void>;
  highlightSection?: 'predictions' | 'rootcause';
}

type ChartMetric = 'load' | 'network' | 'diagnostic';

export const RouterDetails: React.FC<RouterDetailsProps> = ({
  routerId,
  routerState,
  history,
  onMitigate,
  highlightSection,
}) => {
  const [activeChartTab, setActiveChartTab] = useState<ChartMetric>('load');
  const [copied, setCopied] = useState(false);
  const [isMitigating, setIsMitigating] = useState(false);

  const { telemetry, analysis } = routerState;

  const handleCopyCLI = () => {
    if (analysis.cli_recommendation) {
      navigator.clipboard.writeText(analysis.cli_recommendation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMitigateClick = async () => {
    setIsMitigating(true);
    try {
      await onMitigate(routerId);
    } finally {
      setIsMitigating(false);
    }
  };

  // Helper to build a responsive SVG Line Chart
  const renderSvgChart = (metricType: ChartMetric) => {
    if (history.length < 2) {
      return (
        <div className="h-36 flex items-center justify-center text-noc-muted text-xs font-mono">
          Gathering timeline datapoints...
        </div>
      );
    }

    const width = 500;
    const height = 130;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 20;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const series = metricType === 'load'
      ? [
          { name: 'CPU (%)', color: '#38bdf8', data: history.map(h => h.cpu) },
          { name: 'Memory (%)', color: '#a855f7', data: history.map(h => h.memory) },
        ]
      : [
          { name: 'Bandwidth (%)', color: '#10b981', data: history.map(h => h.bandwidth) },
          { name: 'Latency (ms)', color: '#f59e0b', data: history.map(h => h.latency) },
        ];

    // Find min and max values across all plotted series to auto-scale Y axis
    const allVals = series.flatMap(s => s.data);
    const maxVal = Math.max(...allVals, 100); // at least scale up to 100 for percentage
    const minVal = Math.min(...allVals, 0);

    const range = maxVal - minVal || 1;

    // Map history points to coordinates
    const pointsCount = history.length;
    const stepX = chartW / (pointsCount - 1);

    const getX = (index: number) => paddingLeft + index * stepX;
    const getY = (value: number) => height - paddingBottom - ((value - minVal) / range) * chartH;

    return (
      <div className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Y Axis Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const yVal = minVal + ratio * range;
            const y = getY(yVal);
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  className="stroke-noc-border/20"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
                <text
                  x={paddingLeft - 5}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-noc-muted font-mono text-[8px]"
                >
                  {Math.round(yVal)}
                </text>
              </g>
            );
          })}

          {/* X Axis Time Labels (shows first, middle, last timestamps) */}
          {history.length >= 3 && (
            <>
              {/* First point */}
              <text x={paddingLeft} y={height - 5} className="fill-noc-muted font-mono text-[7px]" textAnchor="start">
                {new Date(history[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </text>
              {/* Middle point */}
              <text x={paddingLeft + chartW / 2} y={height - 5} className="fill-noc-muted font-mono text-[7px]" textAnchor="middle">
                {new Date(history[Math.floor(history.length / 2)].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </text>
              {/* Last point */}
              <text x={width - paddingRight} y={height - 5} className="fill-noc-muted font-mono text-[7px]" textAnchor="end">
                {new Date(history[history.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </text>
            </>
          )}

          {/* Area Gradients & Lines for each Series */}
          {series.map((s, sIdx) => {
            const pathPoints = s.data.map((val, index) => `${getX(index)},${getY(val)}`);
            const pathD = `M ${pathPoints.join(' L ')}`;
            
            // For fill area under the line
            const fillD = `${pathD} L ${getX(pointsCount - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z`;

            return (
              <g key={`series-${s.name}`}>
                {/* Area Fill */}
                <path
                  d={fillD}
                  fill={`url(#area-gradient-${sIdx})`}
                  opacity="0.12"
                />
                {/* Line Path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  className="transition-all duration-300"
                />

                {/* Gradient Def */}
                <defs>
                  <linearGradient id={`area-gradient-${sIdx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={s.color} />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                  </linearGradient>
                </defs>
              </g>
            );
          })}
        </svg>

        {/* Legend Overlay */}
        <div className="absolute top-1 right-2 flex gap-3 text-[9px] font-mono">
          {series.map(s => (
            <div key={s.name} className="flex items-center gap-1">
              <span className="w-2.5 h-1 inline-block" style={{ backgroundColor: s.color }} />
              <span className="text-noc-text">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col h-full bg-noc-card/90 relative">
      {/* Node Inspector Header */}
      <div className="flex justify-between items-start border-b border-noc-border/40 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display font-black text-xl text-noc-primary tracking-wider">
              {telemetry.router_name}
            </span>
            <span className={`w-2.5 h-2.5 rounded-full ${telemetry.link_status === 1 ? 'bg-noc-success shadow-glow-green' : 'bg-noc-danger shadow-glow-danger animate-pulse'}`} />
          </div>
          <span className="text-xs font-mono text-noc-muted">{routerId} • IP: 10.100.{routerId === 'ISTRAC-BGL' ? '10' : routerId === 'SDSC-SHAR' ? '20' : '50'}.1</span>
        </div>

        <div className={`flex flex-col items-end px-2 py-1 rounded transition-all duration-500 ${
          highlightSection === 'predictions' ? 'bg-noc-primary/10 ring-1 ring-noc-primary/50 shadow-glow-cyan animate-pulse' : ''
        }`}>
          <span className="text-[10px] font-mono text-noc-muted">XGBoost Risk</span>
          <span className={`text-xl font-display font-bold ${
            analysis.failure_risk > 70 
              ? 'text-noc-danger' 
              : analysis.failure_risk > 35 
                ? 'text-noc-warning' 
                : 'text-noc-success'
          }`}>
            {analysis.failure_risk}%
          </span>
        </div>
      </div>

      {/* Grid: 3 Health Ring Gauges */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        {/* CPU Ring */}
        <div className="bg-[#030611]/40 border border-noc-border/20 rounded-lg p-2.5 flex flex-col items-center justify-center">
          <Cpu className="w-4 h-4 text-noc-primary mb-1" />
          <span className="text-[9px] text-noc-muted uppercase font-mono tracking-wider">CPU Util</span>
          <span className="font-display font-bold text-sm text-noc-text mt-0.5">{telemetry.cpu}%</span>
          <div className="w-full bg-noc-border/30 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${telemetry.cpu > 80 ? 'bg-noc-danger' : telemetry.cpu > 50 ? 'bg-noc-warning' : 'bg-noc-primary'}`}
              style={{ width: `${telemetry.cpu}%` }}
            />
          </div>
        </div>

        {/* Memory Ring */}
        <div className="bg-[#030611]/40 border border-noc-border/20 rounded-lg p-2.5 flex flex-col items-center justify-center">
          <HardDrive className="w-4 h-4 text-noc-purple mb-1" />
          <span className="text-[9px] text-noc-muted uppercase font-mono tracking-wider">RAM Usage</span>
          <span className="font-display font-bold text-sm text-noc-text mt-0.5">{telemetry.memory}%</span>
          <div className="w-full bg-noc-border/30 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${telemetry.memory > 80 ? 'bg-noc-danger' : telemetry.memory > 50 ? 'bg-noc-warning' : 'bg-noc-purple'}`}
              style={{ width: `${telemetry.memory}%` }}
            />
          </div>
        </div>

        {/* Bandwidth Gauge */}
        <div className="bg-[#030611]/40 border border-noc-border/20 rounded-lg p-2.5 flex flex-col items-center justify-center">
          <Network className="w-4 h-4 text-noc-success mb-1" />
          <span className="text-[9px] text-noc-muted uppercase font-mono tracking-wider">Bandwidth</span>
          <span className="font-display font-bold text-sm text-noc-text mt-0.5">{telemetry.bandwidth}%</span>
          <div className="w-full bg-noc-border/30 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${telemetry.bandwidth > 80 ? 'bg-noc-danger' : telemetry.bandwidth > 50 ? 'bg-noc-warning' : 'bg-noc-success'}`}
              style={{ width: `${telemetry.bandwidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Network SLA Stats Grid */}
      <div className="grid grid-cols-3 gap-2 bg-[#030611]/50 border border-noc-border/30 rounded-lg p-2 mb-4 font-mono text-center">
        <div>
          <span className="text-[8px] text-noc-muted block">LATENCY</span>
          <span className="text-xs font-semibold text-noc-text">{telemetry.latency} ms</span>
        </div>
        <div className="border-x border-noc-border/20">
          <span className="text-[8px] text-noc-muted block">JITTER</span>
          <span className="text-xs font-semibold text-noc-text">{telemetry.jitter} ms</span>
        </div>
        <div>
          <span className="text-[8px] text-noc-muted block">PACKET LOSS</span>
          <span className={`text-xs font-semibold ${telemetry.packet_loss > 1.5 ? 'text-noc-danger animate-pulse' : 'text-noc-text'}`}>
            {telemetry.packet_loss}%
          </span>
        </div>
      </div>

      {/* Timeline Trend Charts */}
      <div className="bg-[#030611]/70 border border-noc-border/40 rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center border-b border-noc-border/25 pb-2 mb-3">
          <span className="text-xs font-display tracking-widest text-noc-primary flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            TELEMETRY TIME SERIES
          </span>
          {/* Chart Metric Selector */}
          <div className="flex bg-noc-bg rounded p-0.5 border border-noc-border/60">
            <button
              onClick={() => setActiveChartTab('load')}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-all duration-200 ${
                activeChartTab === 'load' ? 'bg-noc-card text-noc-primary shadow' : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              RESOURCE LOAD
            </button>
            <button
              onClick={() => setActiveChartTab('network')}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-all duration-200 ${
                activeChartTab === 'network' ? 'bg-noc-card text-noc-primary shadow' : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              NETWORK SLA
            </button>
            <button
              onClick={() => setActiveChartTab('diagnostic')}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-all duration-200 ${
                activeChartTab === 'diagnostic' ? 'bg-noc-card text-noc-primary shadow' : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              DIAGNOSTIC SHELL
            </button>
          </div>
        </div>

        {/* Render SVG chart or Diagnostic Console */}
        {activeChartTab === 'diagnostic' ? (
          <div className="h-44">
            <DiagnosticConsole routerId={routerId} />
          </div>
        ) : (
          renderSvgChart(activeChartTab)
        )}
      </div>

      {/* AI Diagnosis and Action Panel */}
      <div className={`flex-1 flex flex-col min-h-0 bg-[#030611]/50 border border-noc-border/30 rounded-lg p-3 overflow-y-auto transition-all duration-500 ${
        highlightSection === 'rootcause' ? 'ring-1 ring-noc-warning/60 bg-noc-warning/5 shadow-glow-warning animate-pulse' : ''
      }`}>
        <h4 className="text-xs font-display tracking-widest text-noc-warning flex items-center gap-1.5 mb-2">
          <BarChart2 className="w-3.5 h-3.5" />
          EXPLAINABLE AI (XAI) DIAGNOSTIC
        </h4>

        {/* Explainable text */}
        <div className="text-[11px] text-noc-text/95 bg-[#030611]/80 border border-noc-border/30 rounded p-2.5 mb-3 leading-relaxed">
          <p className="font-semibold text-noc-primary flex items-center gap-1">
            Root Cause: <span className={telemetry.link_status === 0 || analysis.failure_risk > 50 ? 'text-noc-danger' : 'text-noc-success'}>{analysis.root_cause}</span>
          </p>
          <p className="text-noc-muted mt-1 font-mono text-[10px]">{analysis.explanation}</p>
        </div>

        {/* CLI Script & Run Mitigation */}
        {analysis.cli_recommendation && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center text-[10px] font-mono text-noc-muted mb-1 px-1">
              <span>RECOMMENDED MITIGATION CLI SCRIPT</span>
              <button 
                id="btn-copy-cli"
                onClick={handleCopyCLI} 
                className="hover:text-noc-primary flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-noc-success" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            
            {/* Syntax block */}
            <div className="bg-black/80 border border-noc-border/40 rounded p-2 text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre leading-relaxed select-text flex-1">
              {analysis.cli_recommendation}
            </div>

            {/* Run Mitigation */}
            <button
              id={`btn-mitigate-inspect-${routerId}`}
              onClick={handleMitigateClick}
              disabled={isMitigating}
              className="mt-3 w-full bg-noc-success/20 hover:bg-noc-success/35 text-noc-success border border-noc-success/40 py-2 rounded text-xs font-mono font-semibold transition-all duration-200 hover:shadow-glow-green flex items-center justify-center gap-2"
            >
              {isMitigating ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-noc-success" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>EXECUTING SELF-HEALING CLI RUN...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>EXECUTE RECOMMENDED CLI MITIGATION</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
