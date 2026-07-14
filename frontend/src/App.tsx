import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import Phase1Dashboard from './components/phase1/Phase1Dashboard';
import Phase6Dashboard from './components/phase6/Phase6Dashboard';
import { MissionTimeline } from './components/MissionTimeline';
import type { MissionEvent, MissionEventSeverity } from './components/MissionTimeline';
import { HealthGauge } from './components/HealthGauge';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  Clock, 
  Sliders, 
  AlertCircle, 
  Activity, 
  Database,
  ChevronsUp,
  Shield,
  Sun,
  ShieldAlert,
  CheckCircle2,
  Timer
} from 'lucide-react';

// ─── Mission Mode ─────────────────────────────────────────────────────────────
type MissionMode = 'nominal' | 'elevated' | 'critical' | 'solar' | 'healing';

const MISSION_MODE_CONFIG: Record<MissionMode, {
  label: string;
  sublabel: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  pulse: boolean;
}> = {
  nominal:  { label: 'NOMINAL OPS',             sublabel: 'All systems within thresholds',          icon: CheckCircle2, colorClass: 'text-noc-success', bgClass: 'bg-noc-success/8',  borderClass: 'border-noc-success/30', pulse: false },
  elevated: { label: 'ELEVATED ALERT',           sublabel: 'Degraded performance detected',          icon: ShieldAlert,  colorClass: 'text-noc-warning', bgClass: 'bg-noc-warning/8',  borderClass: 'border-noc-warning/30', pulse: false },
  critical: { label: '⚡ CRITICAL INCIDENT',      sublabel: 'Immediate operator intervention required', icon: AlertCircle,  colorClass: 'text-noc-danger',  bgClass: 'bg-noc-danger/8',   borderClass: 'border-noc-danger/40',  pulse: true  },
  solar:    { label: '☀ SOLAR STORM ACTIVE',      sublabel: 'Space-segment blackout in progress',    icon: Sun,          colorClass: 'text-noc-purple',  bgClass: 'bg-noc-purple/8',   borderClass: 'border-noc-purple/40',  pulse: true  },
  healing:  { label: '🛡 AUTO-HEALING IN PROGRESS', sublabel: 'Self-repair scripts executing',         icon: Shield,       colorClass: 'text-[#06b6d4]',   bgClass: 'bg-[#06b6d4]/8',   borderClass: 'border-[#06b6d4]/40',   pulse: false },
};

// ─── Failure Countdown Helper ─────────────────────────────────────────────────
/** Returns estimated minutes to 90% risk or null if not trending there */
function estimateTimeToFailure(history: EnrichedHistoryPoint[]): number | null {
  if (history.length < 5) return null;
  const recent = history.slice(-10);
  const risks  = recent.map(p => p.failure_risk);
  const latestRisk = risks[risks.length - 1];
  if (latestRisk < 60) return null;
  // Simple linear regression slope
  const n = risks.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  risks.forEach((y, i) => { sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i; });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  if (slope <= 0) return null; // not rising
  // Each history point is ~2 seconds apart
  const stepsTo90 = (90 - latestRisk) / slope;
  const secsTo90  = stepsTo90 * 2;
  return Math.max(0, Math.round(secsTo90 / 60)); // minutes
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;
const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/telemetry`;

const MOCK_ROUTER_INFOS = [
  { id: 'NOC-DEL', name: 'NOC Delhi', role: 'Gateway Core', baseLatency: 12, baseCpu: 20 },
  { id: 'NOC-MUM', name: 'NOC Mumbai', role: 'Transit Center', baseLatency: 18, baseCpu: 25 },
  { id: 'MCF-HSN', name: 'MCF Hassan', role: 'Control Node', baseLatency: 28, baseCpu: 15 },
  { id: 'ISTRAC-BGL', name: 'ISTRAC Bangalore', role: 'Primary Telemetry Hub', baseLatency: 8, baseCpu: 30 },
  { id: 'SDSC-SHAR', name: 'SDSC Sriharikota', role: 'Launch Control Sync', baseLatency: 15, baseCpu: 40 },
  { id: 'TRACK-PBL', name: 'TRACK Port Blair', role: 'Deep Space Downlink', baseLatency: 45, baseCpu: 10 },
];

const generateInitialMockState = (): Record<string, RouterState> => {
  const data: Record<string, RouterState> = {};
  const nowStr = new Date().toISOString();
  MOCK_ROUTER_INFOS.forEach(r => {
    data[r.id] = {
      telemetry: {
        timestamp: nowStr,
        router_id: r.id,
        router_name: r.name,
        latency: r.baseLatency,
        packet_loss: 0.0,
        jitter: 1.5,
        bandwidth: 850.0,
        cpu: r.baseCpu,
        memory: 45.0,
        link_status: 1,
        failure_label: 0
      },
      analysis: {
        failure_risk: 2.0,
        is_anomaly: false,
        anomaly_score: 0.12,
        explanation: 'System operating within standard thresholds. Bandwidth and memory consumption are nominal.',
        root_cause: 'None',
        cli_recommendation: 'show ip interface brief\nshow policy-map interface',
        timeline_events: [
          { time: new Date(Date.now() - 3600000).toLocaleTimeString(), type: 'info', msg: 'System initialized' },
          { time: new Date(Date.now() - 1800000).toLocaleTimeString(), type: 'info', msg: 'Link status check normal' }
        ]
      }
    };
  });
  return data;
};

const generateInitialMockHistories = (): Record<string, EnrichedHistoryPoint[]> => {
  const histories: Record<string, EnrichedHistoryPoint[]> = {};
  MOCK_ROUTER_INFOS.forEach(r => {
    const points: EnrichedHistoryPoint[] = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const timeOffset = i * 10000; // 10s intervals
      const timeStr = new Date(now - timeOffset).toISOString();
      const cpu = Math.max(5, r.baseCpu + Math.round((Math.random() - 0.5) * 10));
      const latency = Math.max(2, r.baseLatency + Math.round((Math.random() - 0.5) * 6));
      points.push({
        timestamp: timeStr,
        router_id: r.id,
        router_name: r.name,
        latency,
        packet_loss: Math.random() > 0.95 ? parseFloat((Math.random() * 2).toFixed(2)) : 0.0,
        jitter: 1.2 + Math.random() * 0.8,
        bandwidth: 800 + Math.random() * 100,
        cpu,
        memory: 42 + Math.random() * 6,
        link_status: 1,
        failure_label: 0,
        failure_risk: cpu > 60 ? 30 : 2 + Math.round(Math.random() * 5),
        is_anomaly: false,
        anomaly_score: 0.1 + Math.random() * 0.1
      });
    }
    histories[r.id] = points;
  });
  return histories;
};

const isOfflineMode = () => {
  return (
    typeof window !== 'undefined' && (
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('github.io') ||
      (window as Window & { __isOffline?: boolean }).__isOffline ||
      localStorage.getItem('offline_mode') === 'true'
    )
  );
};

export const App: React.FC = () => {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('noc_is_logged_in') === 'true');

  // Connection and live states
  const [isConnected, setIsConnected] = useState(false);
  const [isMockMode, setIsMockMode] = useState(() => isOfflineMode());
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

  // ── Feature 1: Mission Timeline ───────────────────────────────────────────
  const [missionEvents, setMissionEvents] = useState<MissionEvent[]>([]);
  const prevAlertIdsRef = useRef<Set<string>>(new Set());
  const prevSolarRef    = useRef(false);
  const healingRouterRef = useRef<string | null>(null);

  const pushEvent = useCallback((severity: MissionEventSeverity, title: string, detail: string, node?: string) => {
    setMissionEvents(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString().slice(11, 19) + ' UTC',
        severity,
        title,
        detail,
        node,
      },
      ...prev,
    ].slice(0, 80)); // cap at 80 events
  }, []);

  // ── Feature 2: NOC Health Score ────────────────────────────────────────────
  const computeHealthScore = useCallback(() => {
    const nodes = Object.values(telemetryData);
    if (nodes.length === 0) return 100;
    let score = 100;
    nodes.forEach(n => {
      const risk    = n.analysis.failure_risk;
      const loss    = n.telemetry.packet_loss;
      const linkOk  = n.telemetry.link_status === 1;
      score -= (risk / nodes.length) * 0.55;
      score -= (loss / nodes.length) * 3;
      if (!linkOk) score -= 15;
    });
    // Alert penalty
    score -= alerts.length * 8;
    // Solar flare penalty
    if (satelliteData?.solar_flare) score -= 30;
    // Satellite LOS penalty
    const sats = satelliteData ? Object.values(satelliteData.satellites) : [];
    sats.forEach(s => { if (!s.los) score -= 5; });
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [telemetryData, alerts, satelliteData]);

  const healthScore = computeHealthScore();

  // ── Feature 3: Failure Countdown ──────────────────────────────────────────
  const failureCountdowns: Record<string, number | null> = {};
  Object.keys(routerHistory).forEach(rid => {
    failureCountdowns[rid] = estimateTimeToFailure(routerHistory[rid] || []);
  });

  // ── Feature 5: Live MTTR (Mean Time to Resolution) ────────────────────────
  const incidentStartRef = useRef<Record<string, number>>({});
  const [resolvedTimes, setResolvedTimes] = useState<number[]>([]);

  useEffect(() => {
    const alertIds = new Set(alerts.map(a => a.router_id));
    // Record start for new alerts
    alertIds.forEach(rid => {
      if (!incidentStartRef.current[rid]) {
        incidentStartRef.current[rid] = Date.now();
      }
    });
    // Record resolution durations for cleared alerts
    const resolved: number[] = [];
    Object.keys(incidentStartRef.current).forEach(rid => {
      if (!alertIds.has(rid)) {
        const dur = (Date.now() - incidentStartRef.current[rid]) / 1000;
        resolved.push(dur);
        delete incidentStartRef.current[rid];
      }
    });
    if (resolved.length > 0) {
      setResolvedTimes(prev => [...prev, ...resolved].slice(-20));
    }
  }, [alerts]);

  const mttrSeconds = resolvedTimes.length > 0
    ? Math.round(resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length)
    : null;
  const mttrDisplay = mttrSeconds === null
    ? '—'
    : mttrSeconds < 60
      ? `${mttrSeconds}s`
      : `${Math.floor(mttrSeconds / 60)}m ${mttrSeconds % 60}s`;

  // ── Feature 4: Mission Mode ────────────────────────────────────────────────
  const [healActive, setHealActive] = useState(false);
  const deriveMissionMode = useCallback((): MissionMode => {
    if (healActive) return 'healing';
    if (satelliteData?.solar_flare) return 'solar';
    const nodes = Object.values(telemetryData);
    const maxRisk = nodes.reduce((m, n) => Math.max(m, n.analysis.failure_risk), 0);
    const anyLinkDown = nodes.some(n => n.telemetry.link_status === 0);
    if (maxRisk > 60 || anyLinkDown) return 'critical';
    if (maxRisk > 30 || alerts.length > 0) return 'elevated';
    return 'nominal';
  }, [healActive, satelliteData, telemetryData, alerts]);

  const missionMode = deriveMissionMode();
  const modeCfg = MISSION_MODE_CONFIG[missionMode];

  // Tab/Routing state
  const [activeTab, setActiveTab] = useState<'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'overview') return 'overview';
    if (tabParam === 'predictions') return 'predictions';
    if (tabParam === 'anomalies') return 'anomalies';
    if (tabParam === 'rootcause') return 'rootcause';
    if (tabParam === 'copilot') return 'copilot';
    if (tabParam === 'selfheal' || tabParam === 'heal') return 'selfheal';
    if (tabParam === 'ph1') return 'ph1';
    if (tabParam === 'ph6') return 'ph6';
    return 'all';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'overview') setActiveTab('overview');
      else if (tabParam === 'predictions') setActiveTab('predictions');
      else if (tabParam === 'anomalies') setActiveTab('anomalies');
      else if (tabParam === 'rootcause') setActiveTab('rootcause');
      else if (tabParam === 'copilot') setActiveTab('copilot');
      else if (tabParam === 'selfheal' || tabParam === 'heal') setActiveTab('selfheal');
      else if (tabParam === 'ph1') setActiveTab('ph1');
      else if (tabParam === 'ph6') setActiveTab('ph6');
      else setActiveTab('all');
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    // If not connected after 4 seconds, activate mock mode
    const timer = setTimeout(() => {
      if (!isConnected) {
        setIsMockMode(true);
        console.log('Backend offline. Activating client-side mock telemetry sandbox mode.');
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  useEffect(() => {
    (window as Window & { __liveTelemetry?: Record<string, RouterState> }).__liveTelemetry = telemetryData;
  }, [telemetryData]);

  useEffect(() => {
    if (!isMockMode) return;

    // Load initial mock states asynchronously to satisfy react-hooks/set-state-in-effect
    const initTimer = setTimeout(() => {
      setTelemetryData(generateInitialMockState());
      setRouterHistory(generateInitialMockHistories());
      setSatelliteData({
        solar_flare: false,
        satellites: {
          'Cartosat-3': {
            name: 'Cartosat-3',
            type: 'LEO',
            altitude: 509,
            velocity: 7.6,
            snr: 24.5,
            packet_loss: 0.1,
            temp: 22.4,
            los: true,
            lock_node: 'ISTRAC-BGL',
            orbit_angle: 45
          },
          'GSAT-31': {
            name: 'GSAT-31',
            type: 'GEO',
            altitude: 35786,
            velocity: 3.07,
            snr: 16.2,
            packet_loss: 0.0,
            temp: 45.8,
            los: true,
            lock_node: 'MCF-HSN',
            orbit_angle: 120
          }
        }
      });
    }, 0);

    const interval = setInterval(() => {
      const nowStr = new Date().toISOString();

      setTelemetryData(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          const node = next[id];
          const isLinkDown = node.telemetry.link_status === 0;

          let cpu = node.telemetry.cpu;
          let latency = node.telemetry.latency;
          let packet_loss = node.telemetry.packet_loss;
          let failure_risk = node.analysis.failure_risk;
          let is_anomaly = node.analysis.is_anomaly;

          if (isLinkDown) {
            cpu = 0;
            latency = 0;
            packet_loss = 100;
            failure_risk = 99;
          } else {
            cpu = Math.max(5, Math.min(95, cpu + Math.round((Math.random() - 0.5) * 6)));
            latency = Math.max(2, Math.min(250, latency + Math.round((Math.random() - 0.5) * 4)));
            packet_loss = Math.max(0, Math.min(25, packet_loss + (Math.random() > 0.9 ? parseFloat((Math.random() * 1.5 - 0.7).toFixed(2)) : 0)));
            
            if (cpu > 80 || packet_loss > 3.0) {
              failure_risk = Math.min(98, failure_risk + Math.round(Math.random() * 8));
            } else {
              failure_risk = Math.max(2, failure_risk - Math.round(Math.random() * 4));
            }

            if (failure_risk > 45 || packet_loss > 5.0) {
              is_anomaly = Math.random() > 0.4;
            } else {
              is_anomaly = false;
            }
          }

          next[id] = {
            ...node,
            telemetry: {
              ...node.telemetry,
              timestamp: nowStr,
              cpu,
              latency,
              packet_loss: parseFloat(packet_loss.toFixed(2)),
            },
            analysis: {
              ...node.analysis,
              failure_risk,
              is_anomaly,
              anomaly_score: parseFloat((failure_risk / 100 + Math.random() * 0.1).toFixed(2))
            }
          };
        });
        return next;
      });

      // Update history caches
      setRouterHistory(prev => {
        const next = { ...prev };
        MOCK_ROUTER_INFOS.forEach(r => {
          setTelemetryData(currentData => {
            const current = currentData[r.id];
            if (current) {
              const currentHistory = next[r.id] || [];
              const newPoint: EnrichedHistoryPoint = {
                ...current.telemetry,
                failure_risk: current.analysis.failure_risk,
                is_anomaly: current.analysis.is_anomaly,
                anomaly_score: current.analysis.anomaly_score
              };
              next[r.id] = [...currentHistory, newPoint].slice(-30);
            }
            return currentData;
          });
        });
        return next;
      });

      // Update satellite mock values
      setSatelliteData(prev => {
        if (!prev) return null;
        const solarFlare = prev.solar_flare;
        const nextSatellites = { ...prev.satellites };

        if (nextSatellites['Cartosat-3']) {
          const sat = nextSatellites['Cartosat-3'];
          const nextAngle = (sat.orbit_angle + 1) % 360;
          const los = nextAngle >= 0 && nextAngle <= 180;
          nextSatellites['Cartosat-3'] = {
            ...sat,
            orbit_angle: nextAngle,
            los,
            snr: los ? Math.max(10, Math.min(32, sat.snr + (Math.random() - 0.5) * 2)) : 0,
            temp: Math.max(15, Math.min(45, sat.temp + (Math.random() - 0.5) * 1.5))
          };
        }

        if (nextSatellites['GSAT-31']) {
          const sat = nextSatellites['GSAT-31'];
          nextSatellites['GSAT-31'] = {
            ...sat,
            snr: !solarFlare ? Math.max(12, Math.min(22, sat.snr + (Math.random() - 0.5) * 1)) : 0,
            temp: Math.max(40, Math.min(85, sat.temp + (Math.random() - 0.5) * 3))
          };
        }

        return {
          ...prev,
          satellites: nextSatellites
        };
      });
    }, 2000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [isMockMode]);

  // Fetch Interceptor for offline mode
  useEffect(() => {
    if (!isMockMode) return;

    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      
      if (urlStr.includes('/api/')) {
        const urlObj = new URL(urlStr, window.location.origin);
        
        // 1. GET /api/sops
        if (urlObj.pathname.endsWith('/api/sops')) {
          return new Response(JSON.stringify([
            {
              id: "sop-qos-01",
              title: "SOP-NET-01: MPLS QoS Policy & Congestion Management",
              content: "In case of Link Congestion: Route non-critical streams to secondary links. Deploy rate-limit QoS policy map to interface. Policy maps shape class-default to 10Mbps maximum and prioritize class ISRO-CRITICAL-TELEMETRY.",
              created_at: new Date().toISOString()
            },
            {
              id: "sop-bgp-02",
              title: "SOP-BGP-02: BGP Route Flapping & Table Bloat Mitigation",
              content: "In case of Link Flapping: Apply carrier-delay 2000 to suppress brief flaps. Tune OSPF hello/dead timers to prevent sub-second peer drops.",
              created_at: new Date().toISOString()
            },
            {
              id: "sop-mem-03",
              title: "SOP-MEM-03: Memory Exhaustion / CPU Overload Remediation",
              content: "In case of Device Overload / Memory Table Bloat: Flush router lookup tables dynamically via 'clear ip route *'. Set logging buffer cpu limits to rising 80 interval 5.",
              created_at: new Date().toISOString()
            }
          ]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // 2. GET /api/copilot/status
        if (urlObj.pathname.endsWith('/api/copilot/status')) {
          return new Response(JSON.stringify({
            engine: "Local Expert Engine (SANDBOX)",
            knowledge_docs: 3
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 3. GET /api/router/.../history
        if (urlObj.pathname.includes('/history')) {
          const points = [];
          const now = Date.now();
          for (let i = 29; i >= 0; i--) {
            points.push({
              timestamp: new Date(now - i * 60000).toISOString(),
              cpu: Math.floor(Math.random() * 40) + 10,
              latency: Math.floor(Math.random() * 20) + 15,
              packet_loss: Math.random() > 0.95 ? Math.random() * 2 : 0,
              bandwidth: Math.floor(Math.random() * 50) + 20,
              failure_risk: Math.floor(Math.random() * 10) + 5,
              is_anomaly: false,
              anomaly_score: 0.05
            });
          }
          return new Response(JSON.stringify(points), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 4. POST /api/export-incident
        if (urlObj.pathname.endsWith('/api/export-incident')) {
          return new Response(JSON.stringify({
            success: true,
            path: "#"
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 5. POST /api/diagnose
        if (urlObj.pathname.endsWith('/api/diagnose')) {
          return new Response(JSON.stringify({
            output: "PING 10.100.20.1 (10.100.20.1) 56(84) bytes of data.\n64 bytes from 10.100.20.1: icmp_seq=1 ttl=64 time=18.2 ms\n64 bytes from 10.100.20.1: icmp_seq=2 ttl=64 time=17.9 ms\n\n--- 10.100.20.1 ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss, time 1001ms\nrtt min/avg/max/mdev = 17.912/18.064/18.216/0.152 ms"
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isMockMode]);

  const handleTabNavigate = (tab: 'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6') => {
    const url = tab === 'all' ? window.location.pathname : `?tab=${tab}`;
    window.history.pushState({}, '', url);
    setActiveTab(tab);
    if (tab === 'overview') {
      setIsSimOpen(true);
    }
  };

  const handleTabClick = (tab: 'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6', e: React.MouseEvent) => {
    e.preventDefault();
    handleTabNavigate(tab);
  };

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

            // Log new alerts to mission timeline
            const newAlertIds = new Set(activeAlerts.map(a => a.router_id));
            activeAlerts.forEach(al => {
              if (!prevAlertIdsRef.current.has(al.router_id)) {
                pushEvent(
                  al.risk_score > 75 ? 'critical' : 'warning',
                  `ALERT: ${al.router_name}`,
                  al.root_cause || 'Anomaly detected',
                  al.router_id
                );
              }
            });
            // Log cleared alerts
            prevAlertIdsRef.current.forEach(rid => {
              if (!newAlertIds.has(rid)) {
                pushEvent('success', `CLEARED: ${rid}`, 'Alert resolved — metrics returned to nominal', rid);
              }
            });
            prevAlertIdsRef.current = newAlertIds;

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
    if (isMockMode) {
      // Mock failure injection logic
      setTelemetryData(prev => {
        const next = { ...prev };
        const node = next[routerId];
        if (node) {
          let cpu = node.telemetry.cpu;
          let latency: number;
          let packet_loss: number;
          let link_status = 1;
          let explanation: string;
          let root_cause: string;
          let failure_risk: number;
          let is_anomaly: boolean;

          if (scenarioType === 'congestion') {
            cpu = Math.max(85, cpu);
            latency = 180 + Math.round(Math.random() * 50);
            packet_loss = 3.5 + parseFloat((Math.random() * 2).toFixed(2));
            failure_risk = 85;
            is_anomaly = true;
            explanation = 'High bandwidth usage detected on QoS priority queues, leading to buffer occupancy spikes.';
            root_cause = 'Bandwidth Congestion / Queue Exhaustion';
          } else if (scenarioType === 'overload') {
            cpu = 96 + Math.round(Math.random() * 3);
            latency = 120 + Math.round(Math.random() * 40);
            packet_loss = 1.8 + parseFloat((Math.random() * 1).toFixed(2));
            failure_risk = 92;
            is_anomaly = true;
            explanation = 'Device CPU core is overloaded due to memory buffer leaks or high control plane packet processing rates.';
            root_cause = 'Device CPU/Memory Overload';
          } else if (scenarioType === 'instability') {
            cpu = Math.max(40, cpu);
            latency = 220 + Math.round(Math.random() * 80);
            packet_loss = 8.5 + parseFloat((Math.random() * 5).toFixed(2));
            link_status = 0; // Link Flapping/Down
            failure_risk = 97;
            is_anomaly = true;
            explanation = 'Physical underlay link flap detected. High packet drops on active interface and routing protocol reconvergence.';
            root_cause = 'Routing Instability / Link Flapping';
          } else {
            // Normal / Nominal
            cpu = 20;
            latency = 15;
            packet_loss = 0.0;
            link_status = 1;
            failure_risk = 2;
            is_anomaly = false;
            explanation = 'System operating within standard thresholds. Bandwidth and memory consumption are nominal.';
            root_cause = 'None';
          }

          next[routerId] = {
            ...node,
            telemetry: {
              ...node.telemetry,
              cpu,
              latency,
              packet_loss,
              link_status,
            },
            analysis: {
              ...node.analysis,
              failure_risk,
              is_anomaly,
              anomaly_score: is_anomaly ? 0.85 : 0.05,
              explanation,
              root_cause,
            }
          };

          // Also generate/update alarm in state if anomaly
          if (is_anomaly) {
            setAlerts(prevAlerts => {
              const filterAlerts = prevAlerts.filter(a => a.router_id !== routerId);
              return [
                ...filterAlerts,
                {
                  router_id: routerId,
                  router_name: node.telemetry.router_name,
                  risk_score: failure_risk,
                  root_cause,
                  timestamp: new Date().toISOString()
                }
              ];
            });
          } else {
            setAlerts(prevAlerts => prevAlerts.filter(a => a.router_id !== routerId));
          }
        }
        return next;
      });
      return;
    }

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

  // ── Event logging: Solar Flare ────────────────────────────────────────────
  useEffect(() => {
    const isSolar = !!satelliteData?.solar_flare;
    if (isSolar && !prevSolarRef.current) {
      pushEvent('solar', 'SOLAR STORM DETECTED', 'GEO satellite transponders under energetic particle bombardment. Switching to LEO fallback.');
    } else if (!isSolar && prevSolarRef.current) {
      pushEvent('info', 'SOLAR STORM CLEARED', 'Space-segment links restored to nominal signal levels.');
    }
    prevSolarRef.current = isSolar;
  }, [satelliteData?.solar_flare, pushEvent]);

  // ── Event logging: Initial boot ───────────────────────────────────────────
  const bootLoggedRef = useRef(false);
  useEffect(() => {
    const nodes = Object.keys(telemetryData);
    if (nodes.length > 0 && !bootLoggedRef.current) {
      bootLoggedRef.current = true;
      pushEvent('info', 'TELEMETRY STREAM ACTIVE', `Monitoring ${nodes.length} ground station nodes. All channels initialised.`);
    }
  }, [telemetryData, pushEvent]);

  // REST trigger: Self-healing mitigation
  const handleMitigate = async (routerId: string) => {
    if (isMockMode) {
      // Mock mitigation
      setTelemetryData(prev => {
        const next = { ...prev };
        const node = next[routerId];
        if (node) {
          next[routerId] = {
            ...node,
            telemetry: {
              ...node.telemetry,
              cpu: 18,
              latency: 12,
              packet_loss: 0.0,
              link_status: 1,
            },
            analysis: {
              ...node.analysis,
              failure_risk: 1,
              is_anomaly: false,
              anomaly_score: 0.02,
              explanation: 'System operating within standard thresholds. Bandwidth and memory consumption are nominal.',
              root_cause: 'None',
            }
          };
        }
        return next;
      });
      // Clear alert
      setAlerts(prev => prev.filter(a => a.router_id !== routerId));
      // Log heal events in mock mode
      pushEvent('heal', `SELF-HEAL INITIATED: ${routerId}`, 'Automated mitigation script executing. Restoring router to nominal state.', routerId);
      setHealActive(true);
      setTimeout(() => {
        setHealActive(false);
        pushEvent('success', `SELF-HEAL COMPLETE: ${routerId}`, 'Router fully restored. Failure risk cleared to nominal.', routerId);
      }, 4000);
      return;
    }

    // Log heal event
    pushEvent('heal', `SELF-HEAL INITIATED: ${routerId}`, 'Automated mitigation script executing. Restoring router to nominal state.', routerId);
    setHealActive(true);
    healingRouterRef.current = routerId;
    setTimeout(() => {
      setHealActive(false);
      pushEvent('success', `SELF-HEAL COMPLETE: ${routerId}`, 'Router fully restored. Failure risk cleared to nominal.', routerId);
    }, 6000);

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
    if (isMockMode) {
      const lowerQuery = query.toLowerCase();
      let answer: string;
      if (lowerQuery.includes('status') || lowerQuery.includes('health')) {
        answer = `**PRED-NOC Sandbox Copilot System Status Report**:\n\nAll ground tracking and sync channels are simulated as UP. Under mock telemetry mode, QoS metrics are updated every 2 seconds. The selected node **${routerId || 'none'}** is reporting nominal conditions.`;
      } else if (lowerQuery.includes('solar') || lowerQuery.includes('flare')) {
        answer = `**ISRO SOP-RAG Space Segment Warning (Ref: SOP-42-Flare)**:\n\nDuring extreme Solar Flare events (solar particle storms), high-frequency transponders on GEO satellites like GSAT-31 experience severe attenuation. GROUND ACTION: Route backup telemetry via LEO satellite Cartosat-3 or fallback to low-frequency underlay tracking channels.`;
      } else if (lowerQuery.includes('mitigate') || lowerQuery.includes('heal') || lowerQuery.includes('congestion')) {
        answer = `**ISRO SOP-RAG QoS Congestion Mitigation SOP**:\n\n1. Verify active traffic class policies using: \`show policy-map interface\`\n2. Shift non-critical tracking feeds to secondary transponders.\n3. Trigger automated self-healing protocol to re-prioritize telemetry sync.`;
      } else {
        answer = `**PRED-NOC RAG Bot (Sandbox fallback)**:\n\nI have scanned the local ISRO SOP (Standard Operating Procedures) manuals for ground station telemetry recovery. For the selected router **${routerId || 'SDSC-SHAR'}**, please verify physical interface statuses and execute dynamic traffic-shaping controls.`;
      }
      return { response: answer };
    }

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

      {/* ── Feature 4: Mission Mode Status Banner ─────────────────────────── */}
      <div
        className={`px-6 py-1.5 flex items-center justify-between border-b transition-all duration-700 z-30 ${modeCfg.bgClass} ${modeCfg.borderClass}`}
      >
        <div className="flex items-center gap-2">
          <modeCfg.icon className={`w-3.5 h-3.5 flex-shrink-0 ${modeCfg.colorClass} ${modeCfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[10px] font-mono font-black tracking-widest uppercase ${modeCfg.colorClass} ${modeCfg.pulse ? 'animate-pulse' : ''}`}>
            {modeCfg.label}
          </span>
          <span className="text-[9px] text-noc-muted font-mono hidden sm:inline">— {modeCfg.sublabel}</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-noc-muted">
          {Object.keys(failureCountdowns).map(rid => {
            const mins = failureCountdowns[rid];
            if (mins === null) return null;
            return (
              <span key={rid} className="flex items-center gap-1 text-noc-danger animate-pulse">
                <Timer className="w-3 h-3" />
                {rid}: ~{mins}m to CRIT
              </span>
            );
          })}
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${modeCfg.bgClass} ${modeCfg.colorClass} border ${modeCfg.borderClass}`}>
            HEALTH: {healthScore}
          </span>
        </div>
      </div>

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
          {/* ── Feature 2: Health Gauge ────────────────────────────────────── */}
          <div className="hidden xl:block">
            <HealthGauge
              score={healthScore}
              alertCount={alerts.length}
              solarFlare={!!satelliteData?.solar_flare}
              healActive={healActive}
            />
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-noc-muted border-r border-noc-border/40 pr-6">
            <Clock className="w-4 h-4 text-noc-primary" />
            <span>SYSTEM TIME (UTC):</span>
            <span className="text-noc-text font-bold">{utcTime || 'SYS_SYNCING...'}</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {isMockMode ? (
              <span id="ws-status-mock" className="flex items-center gap-1.5 text-noc-primary bg-noc-primary/10 border border-noc-primary/35 px-2.5 py-1 rounded shadow-glow-cyan">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> TELEMETRY: SIMULATION (SANDBOX)
              </span>
            ) : isConnected ? (
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
            <button
              onClick={(e) => handleTabClick('all', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                activeTab === 'all'
                  ? 'bg-noc-primary/25 text-noc-primary shadow-glow-cyan'
                  : 'bg-noc-bg hover:bg-noc-primary/20 text-noc-muted hover:text-noc-primary'
              }`}
            >
              ALL SENSORS
            </button>
            <span className="text-noc-border px-1">|</span>
            <button
              onClick={(e) => handleTabClick('ph1', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'ph1'
                  ? 'bg-noc-primary/25 text-noc-primary shadow-glow-cyan'
                  : 'hover:bg-noc-primary/20 text-noc-primary'
              }`}
            >
              PH 1-5 ENGINE
            </button>
            <span className="text-noc-border px-1">|</span>
            <button
              onClick={(e) => handleTabClick('ph6', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'ph6'
                  ? 'bg-noc-primary/25 text-noc-primary shadow-glow-cyan'
                  : 'hover:bg-noc-primary/20 text-noc-primary'
              }`}
            >
              PH 6 HEAL
            </button>
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
      <main className={`flex-1 max-w-[1600px] w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden transition-all duration-300 ${
        (activeTab === 'ph1' || activeTab === 'ph6') ? 'mb-0 p-0 max-w-none' : activeTab === 'copilot' ? 'mb-[50px]' : isChatExpanded ? 'mb-[390px]' : 'mb-[50px]'
      }`}>
        {/* Row 1: KPI Statistics Widgets */}
        {activeTab !== 'copilot' && activeTab !== 'ph1' && activeTab !== 'ph6' && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

            {/* KPI 5: Live MTTR */}
            <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
              <div>
                <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Avg MTTR</span>
                <span className={`font-display text-xl font-bold ${
                  mttrSeconds === null ? 'text-noc-muted' :
                  mttrSeconds < 120 ? 'text-noc-success' :
                  mttrSeconds < 300 ? 'text-noc-warning' : 'text-noc-danger'
                }`}>
                  {mttrDisplay}
                </span>
              </div>
              <div className={`p-1.5 rounded border ${
                mttrSeconds === null ? 'bg-noc-border/10 border-noc-border/20 text-noc-muted' :
                mttrSeconds < 120 ? 'bg-noc-success/10 border-noc-success/20 text-noc-success' :
                'bg-noc-warning/10 border-noc-warning/20 text-noc-warning'
              }`}>
                <Timer className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Main Layout */}
        {activeTab === 'ph1' ? (
          <div className="phase1-app flex-1 flex flex-col h-full min-h-[500px]">
            <Phase1Dashboard isInline={true} />
          </div>
        ) : activeTab === 'ph6' ? (
          <div className="phase6-app flex-1 flex flex-col h-full min-h-[500px]">
            <Phase6Dashboard isInline={true} />
          </div>
        ) : activeTab === 'copilot' ? (
          <div className="flex-1 flex flex-col h-full bg-[#060a16] border border-noc-border rounded-xl p-4 glass-panel min-h-[500px]">
            <h3 className="text-xs font-mono font-bold text-noc-primary mb-3 tracking-widest uppercase">
              PHASE 5: AIR-GAPPED NLP COPILOT COMMAND INTERFACE
            </h3>
            <div className="flex-1 min-h-0 bg-[#030611]/80 rounded border border-noc-border/60">
              <CopilotChat 
                onSendMessage={handleSendCopilotQuery}
                telemetryData={telemetryData}
                currentRouterId={selectedRouterId}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden min-h-0">
            {/* Left Area: Topology Map, Alerts Panel, Satellite Monitor */}
            {activeTab !== 'predictions' && activeTab !== 'rootcause' && (
              <div className={`flex flex-col gap-4 overflow-y-auto ${
                activeTab === 'overview' ? 'lg:col-span-12' : 'lg:col-span-7'
              }`}>
                <TopologyMap 
                  telemetryData={telemetryData} 
                  selectedRouterId={selectedRouterId}
                  onSelectRouter={setSelectedRouterId}
                />

                {(activeTab === 'all' || activeTab === 'anomalies' || activeTab === 'selfheal') && (
                  <div className={activeTab === 'selfheal' ? 'border border-noc-success/40 shadow-glow-green rounded-xl transition-all duration-500' : ''}>
                    <AlertsPanel 
                      alerts={alerts}
                      telemetryData={telemetryData}
                      onMitigate={handleMitigate}
                    />
                  </div>
                )}

                {(activeTab === 'all' || activeTab === 'overview') && (
                  <SatelliteMonitor
                    data={satelliteData}
                    onInjectSolarFlare={async (active) => {
                      if (isMockMode) {
                        setSatelliteData(prev => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            solar_flare: active
                          };
                        });
                        // Add flare alerts/mitigation checks if active
                        if (active) {
                          setAlerts(prevAlerts => {
                            const filtered = prevAlerts.filter(a => a.router_id !== 'ALL');
                            return [
                              ...filtered,
                              {
                                router_id: 'ALL',
                                router_name: 'Space Segments',
                                risk_score: 99,
                                root_cause: 'Solar energetic particle event causing satellite transponder disruption and link outages.',
                                timestamp: new Date().toISOString()
                              }
                            ];
                          });
                        } else {
                          setAlerts(prevAlerts => prevAlerts.filter(a => a.router_id !== 'ALL'));
                        }
                        return;
                      }

                      await fetch(`${BACKEND_URL}/api/simulate-solar-flare`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active, duration_steps: 30 })
                      });
                    }}
                  />
                )}
              </div>
            )}

            {/* Split layout view for Predictions or Rootcause */}
            {(activeTab === 'predictions' || activeTab === 'rootcause') && (
              <div className="lg:col-span-7 flex flex-col gap-4 overflow-y-auto">
                <TopologyMap 
                  telemetryData={telemetryData} 
                  selectedRouterId={selectedRouterId}
                  onSelectRouter={setSelectedRouterId}
                />
              </div>
            )}

            {/* Right Area: Router Details + Mission Timeline */}
            {activeTab !== 'overview' && (
              <div className="lg:col-span-5 overflow-y-auto flex flex-col gap-3 min-h-0">
                {selectedRouterId && telemetryData[selectedRouterId] ? (
                  <RouterDetails 
                    routerId={selectedRouterId}
                    routerState={telemetryData[selectedRouterId]}
                    history={routerHistory[selectedRouterId] || []}
                    onMitigate={handleMitigate}
                    highlightSection={
                      activeTab === 'predictions' ? 'predictions' :
                      activeTab === 'rootcause' ? 'rootcause' :
                      undefined
                    }
                  />
                ) : (
                  <div className="glass-panel rounded-xl p-6 flex flex-col items-center justify-center text-center text-noc-muted" style={{minHeight: 200}}>
                    <AlertCircle className="w-12 h-12 text-noc-primary/20 mb-2" />
                    <h3 className="font-display font-semibold text-sm text-noc-text uppercase">Node Inspection Offline</h3>
                    <p className="text-xs text-noc-muted max-w-xs mt-1">Select a router node on the topology map to load metrics, historical timeline logs, and recommended cisco fixes.</p>
                  </div>
                )}

                {/* ── Feature 1: Mission Timeline Feed ───────────────────── */}
                {(activeTab === 'all' || activeTab === 'anomalies' || activeTab === 'selfheal') && (
                  <div style={{ minHeight: 220, maxHeight: 300 }} className="flex flex-col">
                    <MissionTimeline events={missionEvents} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Slide-Up AI Operations Chat Terminal */}
      {activeTab !== 'copilot' && activeTab !== 'ph1' && activeTab !== 'ph6' && (
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
      )}

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
