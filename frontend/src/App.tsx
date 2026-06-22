import React, { useState, useEffect, useRef } from 'react';
import type { RouterState, ActiveAlert, EnrichedHistoryPoint, ChatMessage } from './types';
import { TopologyMap } from './components/TopologyMap';
import { RouterDetails } from './components/RouterDetails';
import { AlertsPanel } from './components/AlertsPanel';
import { SimulationController } from './components/SimulationController';
import { CopilotChat } from './components/CopilotChat';
import { LandingPage } from './components/LandingPage';
import { Chatbot1 } from './components/Chatbot1';
import { SatelliteMonitor } from './components/SatelliteMonitor';
import type { SatelliteTelemetry } from './components/SatelliteMonitor';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  Clock, 
  Sliders, 
  AlertCircle, 
  Activity, 
  Database,
  ChevronsUp
} from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry';

export const App: React.FC = () => {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('noc_is_logged_in') === 'true');

  // Connection and live states
  const [isConnected, setIsConnected] = useState(false);
  const [telemetryData, setTelemetryData] = useState<Record<string, RouterState>>({});
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string | null>('SDSC-SHAR');
  
  // History cache for graphing
  const [routerHistory, setRouterHistory] = useState<Record<string, EnrichedHistoryPoint[]>>({});
  
  // UI Panels states
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [utcTime, setUtcTime] = useState('');
  const [satelliteData, setSatelliteData] = useState<SatelliteTelemetry | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Sync clock in UTC format for space center authenticity
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial history for a selected router to populate the charts
  const fetchRouterHistory = async (routerId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/router/${routerId}/history`);
      if (res.ok) {
        const history: EnrichedHistoryPoint[] = await res.json();
        setRouterHistory(prev => ({
          ...prev,
          [routerId]: history
        }));
      }
    } catch (err) {
      console.error(`Error fetching history for ${routerId}:`, err);
    }
  };

  // Pre-fetch all routers history on load
  useEffect(() => {
    const initRouters = ['ISTRAC-BGL', 'SDSC-SHAR', 'MCF-HSN', 'NOC-DEL', 'NOC-MUM', 'TRACK-PBL'];
    initRouters.forEach(rid => fetchRouterHistory(rid));
  }, []);

  // When a router is selected, if its history is empty, fetch it
  useEffect(() => {
    if (selectedRouterId) {
      const timer = setTimeout(() => {
        setRouterHistory(prev => {
          if (!prev[selectedRouterId]) {
            fetchRouterHistory(selectedRouterId);
          }
          return prev;
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedRouterId]);

  // Establish WebSocket telemetry stream
  useEffect(() => {
    let reconnectTimeout: number;

    const connectWs = () => {
      console.log('Connecting to NOC telemetry stream...');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('Connected to NOC telemetry stream.');
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          
          if (packet.type === 'telemetry_update') {
            const data: Record<string, RouterState> = packet.data;
            const activeAlerts: ActiveAlert[] = packet.alerts;

            setTelemetryData(data);
            setAlerts(activeAlerts);

            // Parse satellite telemetry from WS payload
            if (packet.satellites) {
              setSatelliteData(packet.satellites as SatelliteTelemetry);
            }

            // Append live updates to history cache
            setRouterHistory(prev => {
              const updated = { ...prev };
              Object.entries(data).forEach(([rid, nodeState]) => {
                const nodeHistory = prev[rid] || [];
                const newPoint: EnrichedHistoryPoint = {
                  ...nodeState.telemetry,
                  failure_risk: nodeState.analysis.failure_risk,
                  is_anomaly: nodeState.analysis.is_anomaly,
                  anomaly_score: nodeState.analysis.anomaly_score
                };
                
                // Append and slice to max 60 points
                const slicedHistory = [...nodeHistory, newPoint].slice(-60);
                updated[rid] = slicedHistory;
              });
              return updated;
            });
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket closed. Attempting reconnect in 3 seconds...');
        reconnectTimeout = window.setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // REST trigger: Manual override injection
  const handleTriggerScenario = async (routerId: string, scenarioType: string) => {
    const response = await fetch(`${BACKEND_URL}/api/simulate-failure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ router_id: routerId, failure_type: scenarioType }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || 'Failed to trigger simulation');
    }
  };

  // REST trigger: Self-healing mitigation
  const handleMitigate = async (routerId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/mitigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ router_id: routerId }),
      });
      if (response.ok) {
        // Refresh local history immediately to reflect healing state change
        await fetchRouterHistory(routerId);
      }
    } catch (err) {
      console.error(`Mitigation failed on ${routerId}:`, err);
    }
  };

  // REST trigger: Copilot NLP Query
  const handleSendCopilotQuery = async (query: string, routerId: string | null, history: ChatMessage[]) => {
    const formattedHistory = history
      .filter(m => m.id !== 'welcome' && !m.text.startsWith('Error connecting'))
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, router_id: routerId, history: formattedHistory }),
    });
    if (!response.ok) {
      throw new Error('Failed to query Copilot');
    }
    return response.json();
  };

  // Calculate global NOC averages for KPI Cards
  const calculateKpiStats = () => {
    const nodes = Object.values(telemetryData);
    if (nodes.length === 0) return { avgCpu: 0, avgLat: 0, maxLoss: 0 };

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

    return {
      avgCpu: Math.round(totalCpu / nodes.length),
      avgLat: Math.round(totalLatency / nodes.length),
      maxLoss: parseFloat(maxLoss.toFixed(2))
    };
  };

  const kpis = calculateKpiStats();

  return (
    <>
      {!isLoggedIn ? (
        <LandingPage onLogin={setIsLoggedIn} />
      ) : (
        <div className="min-h-screen bg-noc-bg text-noc-text flex flex-col font-sans select-none relative overflow-hidden">
      {/* Dynamic Cyber Command Scanline Overlay */}
      <div className="absolute inset-0 scanline opacity-5 pointer-events-none z-40" />

      {/* Main Command Center Header */}
      <header className="bg-[#030611] border-b border-noc-border/80 px-6 py-4 flex justify-between items-center z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-noc-primary/10 rounded border border-noc-primary/30">
            <Radio className="w-6 h-6 text-noc-primary animate-pulse" />
          </div>
          <div>
            <h1 className="font-display font-black text-lg tracking-widest text-noc-text flex items-center gap-2">
              ISRO PRED-NOC
              <span className="text-[10px] bg-noc-primary/20 text-noc-primary px-1.5 py-0.5 rounded font-mono font-normal tracking-normal uppercase border border-noc-primary/30">
                PREDICTIVE CORE v1.0
              </span>
            </h1>
            <p className="text-[10px] text-noc-muted font-mono tracking-wider">AIR-GAPPED OPERATIONS & UNDERLAY QoS COPILOT</p>
          </div>
        </div>

        {/* Tactical Info Deck (UTC Time, WS Status, Sim deck trigger) */}
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-noc-muted border-r border-noc-border/40 pr-6">
            <Clock className="w-4 h-4 text-noc-primary" />
            <span>SYSTEM TIME (UTC):</span>
            <span className="text-noc-text font-bold">{utcTime || 'SYS_SYNCING...'}</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {isConnected ? (
              <span id="ws-status-online" className="flex items-center gap-1.5 text-noc-success bg-noc-success/10 border border-noc-success/35 px-2.5 py-1 rounded">
                <Wifi className="w-3.5 h-3.5" /> TELEMETRY: LIVE
              </span>
            ) : (
              <span id="ws-status-offline" className="flex items-center gap-1.5 text-noc-danger bg-noc-danger/10 border border-noc-danger/35 px-2.5 py-1 rounded animate-pulse">
                <WifiOff className="w-3.5 h-3.5" /> TELEMETRY: RETRYING
              </span>
            )}
          </div>

          {/* Dashboard Navigation Group */}
          <div className="flex items-center gap-1 border border-noc-border rounded p-1 bg-[#060a16]">
            <a href="http://localhost:5175/?tab=overview" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 1: SIM</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=predictions" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 2: ML</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=anomalies" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 3: ANOMALY</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=rootcause" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 4: RCA</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5175/?tab=copilot" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 5: COPILOT</a>
            <span className="text-noc-border px-1">|</span>
            <a href="http://localhost:5176/" className="bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary px-2 py-1 rounded text-[10px] font-mono font-bold transition-all no-underline">PH 6: HEAL</a>
          </div>

          {/* Trigger Failure Injection Deck */}
          <button
            id="btn-trigger-deck"
            onClick={() => setIsSimOpen(true)}
            className="bg-noc-warning/20 hover:bg-noc-warning/35 text-noc-warning border border-noc-warning/45 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all duration-200 hover:shadow-glow-warning flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>SIMULATION DECK</span>
          </button>

          {/* Secure Logout */}
          <button
            onClick={() => {
              localStorage.removeItem('noc_is_logged_in');
              setIsLoggedIn(false);
            }}
            className="bg-noc-card border border-noc-border hover:bg-noc-border hover:text-noc-text text-noc-muted px-3 py-1.5 rounded text-xs font-mono font-bold transition-all flex items-center gap-1.5"
          >
            LOGOUT
          </button>
        </div>
      </header>

      {/* Main Grid View Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden mb-[390px] transition-all duration-300">
        {/* Row 1: KPI Statistics Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* KPI 1: Latency */}
          <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
            <div>
              <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Avg SLA Latency</span>
              <span className="font-display text-xl font-bold text-noc-text">{kpis.avgLat} ms</span>
            </div>
            <div className="text-noc-primary p-1.5 bg-noc-primary/5 rounded border border-noc-primary/10">
              <Activity className="w-4 h-4" />
            </div>
          </div>

          {/* KPI 2: Max Loss */}
          <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
            <div>
              <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Max Packet Loss</span>
              <span className={`font-display text-xl font-bold ${kpis.maxLoss > 1.5 ? 'text-noc-danger animate-pulse' : 'text-noc-text'}`}>
                {kpis.maxLoss} %
              </span>
            </div>
            <div className="text-noc-danger p-1.5 bg-noc-danger/5 rounded border border-noc-danger/10">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>

          {/* KPI 3: System CPU */}
          <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
            <div>
              <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Avg Grid Load</span>
              <span className="font-display text-xl font-bold text-noc-text">{kpis.avgCpu} % CPU</span>
            </div>
            <div className="text-noc-purple p-1.5 bg-noc-purple/5 rounded border border-noc-purple/10">
              <Database className="w-4 h-4" />
            </div>
          </div>

          {/* KPI 4: Active Alarms */}
          <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
            <div>
              <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Active Warnings</span>
              <span className={`font-display text-xl font-bold ${alerts.length > 0 ? 'text-noc-danger animate-pulse' : 'text-noc-success'}`}>
                {alerts.length} ALARMS
              </span>
            </div>
            <div className={`p-1.5 rounded border ${alerts.length > 0 ? 'bg-noc-danger/15 border-noc-danger/30 text-noc-danger animate-bounce' : 'bg-noc-success/15 border-noc-success/30 text-noc-success'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Row 2: Topology Map split with Router Detail Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* Left Area (8 cols on lg): Topology Map & Alerts Log */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <TopologyMap 
              telemetryData={telemetryData} 
              selectedRouterId={selectedRouterId}
              onSelectRouter={setSelectedRouterId}
            />

            <AlertsPanel 
              alerts={alerts}
              telemetryData={telemetryData}
              onMitigate={handleMitigate}
            />

            <SatelliteMonitor
              data={satelliteData}
              onInjectSolarFlare={async (active) => {
                await fetch(`${BACKEND_URL}/api/simulate-solar-flare`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ active, duration_steps: 30 })
                });
              }}
            />
          </div>

          {/* Right Area (5 cols on lg): Inspector Details Panel */}
          <div className="lg:col-span-5">
            {selectedRouterId && telemetryData[selectedRouterId] ? (
              <RouterDetails 
                routerId={selectedRouterId}
                routerState={telemetryData[selectedRouterId]}
                history={routerHistory[selectedRouterId] || []}
                onMitigate={handleMitigate}
              />
            ) : (
              <div className="glass-panel rounded-xl p-6 flex flex-col items-center justify-center text-center h-full text-noc-muted">
                <AlertCircle className="w-12 h-12 text-noc-primary/20 mb-2" />
                <h3 className="font-display font-semibold text-sm text-noc-text uppercase">Node Inspection Offline</h3>
                <p className="text-xs text-noc-muted max-w-xs mt-1">Select a router node on the topology map to load metrics, historical timeline logs, and recommended cisco fixes.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Slide-Up AI Operations Chat Terminal */}
      <div 
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ${
          isChatExpanded ? 'h-[370px]' : 'h-[44px]'
        }`}
      >
        {/* Toggle Bar */}
        <div 
          id="btn-chat-toggle"
          onClick={() => setIsChatExpanded(!isChatExpanded)}
          className="bg-[#030611] border-t border-noc-border/80 p-2.5 cursor-pointer hover:bg-noc-card flex justify-between items-center px-6 transition-colors shadow-2xl select-none"
        >
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-noc-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-noc-primary"></span>
            </span>
            <span className="text-noc-primary font-bold uppercase tracking-wider">AI Operations Assistant Terminal</span>
            <span className="text-noc-muted text-[10px] hidden md:inline">• Live SOP RAG and offline network knowledge index loaded</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-noc-muted font-mono">
            <span className="text-[10px]">{isChatExpanded ? 'CLOSE TERMINAL' : 'EXPAND TERMINAL'}</span>
            <ChevronsUp className={`w-4 h-4 transition-transform duration-300 ${isChatExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Chat Component Body */}
        {isChatExpanded && (
          <div className="h-[326px]">
            <CopilotChat 
              onSendMessage={handleSendCopilotQuery}
              telemetryData={telemetryData}
              currentRouterId={selectedRouterId}
            />
          </div>
        )}
      </div>

      {/* Failure Simulation Deck Modal */}
      <SimulationController 
        onTriggerScenario={handleTriggerScenario}
        isOpen={isSimOpen}
        onClose={() => setIsSimOpen(false)}
      />
        </div>
      )}
      <Chatbot1 />
    </>
  );
};

export default App;
