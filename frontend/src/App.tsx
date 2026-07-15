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
import { ForecastEngine } from './components/ForecastEngine';
import { SitrepPanel } from './components/SitrepPanel';
import { BigBoard } from './components/BigBoard';
import { PlaybookExecutor } from './components/PlaybookExecutor';
import { AnomalyScatterPlot } from './components/AnomalyScatterPlot';
import { ChitthiVoiceDrawer } from './components/ChitthiVoiceDrawer';
import { PathTracer } from './components/PathTracer';
import { SlaConsole } from './components/SlaConsole';
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
  Timer,
  Mic,
  MicOff,
  FileDown
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
  
  // ── Closed-Loop Orchestration Config ──────────────────────────────────────
  const [autoHealEnabled, setAutoHealEnabled] = useState(true);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');
  const [isVoiceDrawerOpen, setIsVoiceDrawerOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);



  // ── Feature 1: Mission Timeline ───────────────────────────────────────────
  const [missionEvents, setMissionEvents] = useState<MissionEvent[]>([]);
  const prevAlertIdsRef = useRef<Set<string>>(new Set());
  const prevSolarRef    = useRef(false);
  const healingRouterRef = useRef<string | null>(null);
  const prevLockNodeRef  = useRef<string>('NONE');

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

  // ── Feature 16: Browser Push Notifications ────────────────────────────────
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // Request permission on mount (silently; no blocking UI)
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => setNotifPermission(perm));
      }
    }
  }, []);

  // Fire browser notifications for new critical alerts
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    alerts.forEach(alert => {
      const key = `${alert.router_id}-${alert.root_cause}`;
      if (notifiedAlertIdsRef.current.has(key)) return; // already notified
      notifiedAlertIdsRef.current.add(key);

      const isLinkDown = telemetryData[alert.router_id]?.telemetry?.link_status === 0;
      const isCritical = alert.risk_score > 70 || isLinkDown;
      if (!isCritical) return; // only notify for high-severity

      const title = isLinkDown
        ? `🔴 LINK DOWN — ${alert.router_name}`
        : `⚡ CRITICAL ALERT — ${alert.router_name}`;
      const body = `Failure risk: ${alert.risk_score}% | Cause: ${alert.root_cause}`;

      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: key,         // prevents duplicate toasts for same alert
          requireInteraction: isLinkDown, // link-down stays until dismissed
        });
        // Click brings the tab into focus
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch { /* silently fail on unsupported platforms */ }
    });

    // Clear stale keys for resolved alerts
    const currentKeys = new Set(alerts.map(a => `${a.router_id}-${a.root_cause}`));
    notifiedAlertIdsRef.current.forEach(key => {
      if (!currentKeys.has(key)) notifiedAlertIdsRef.current.delete(key);
    });
  }, [alerts, telemetryData]);

  // Solar flare push notification
  const prevSolarNotifRef = useRef(false);
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const isFlareActive = !!satelliteData?.solar_flare;
    if (isFlareActive && !prevSolarNotifRef.current) {
      try {
        new Notification('☀️ SOLAR STORM DETECTED — ISRO NOC', {
          body: 'Space-segment blackout in progress. Satellite SNR critically degraded. Assess downlink schedules immediately.',
          icon: '/favicon.ico',
          tag: 'solar-flare',
          requireInteraction: true,
        });
      } catch { /* silent */ }
    }
    prevSolarNotifRef.current = isFlareActive;
  }, [satelliteData]);

  // ── Feature 17: Periodic Health Score Sync ─────────────────────────────────
  useEffect(() => {
    const uploadSnapshot = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/health-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            health_score: healthScore,
            active_alerts: alerts.length,
            solar_flare: !!satelliteData?.solar_flare
          })
        });
      } catch (err) {
        console.error('[Health Sync] Failed to save health snapshot:', err);
      }
    };

    // Delay first run slightly, then repeat every 30 seconds
    const initialTimer = setTimeout(uploadSnapshot, 5000);
    const interval = setInterval(uploadSnapshot, 30000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [healthScore, alerts.length, satelliteData?.solar_flare]);



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
  const [activeTab, setActiveTab] = useState<'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6' | 'forecast' | 'sitrep' | 'bigboard' | 'playbooks'>(() => {
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
    if (tabParam === 'forecast') return 'forecast';
    if (tabParam === 'sitrep') return 'sitrep';
    if (tabParam === 'bigboard') return 'bigboard';
    if (tabParam === 'playbooks') return 'playbooks';
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
      else if (tabParam === 'forecast') setActiveTab('forecast');
      else if (tabParam === 'sitrep') setActiveTab('sitrep');
      else if (tabParam === 'bigboard') setActiveTab('bigboard');
      else if (tabParam === 'playbooks') setActiveTab('playbooks');
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
    if (isMockMode) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/config`);
        if (res.ok) {
          const data = await res.json();
          setAutoHealEnabled(data.auto_heal_enabled);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };
    fetchConfig();
  }, [isMockMode]);

  const toggleAutoHeal = useCallback(async () => {
    const nextVal = !autoHealEnabled;
    setAutoHealEnabled(nextVal);
    
    if (isMockMode) {
      pushEvent('info', 'CLOSED-LOOP ORCHESTRATION', `Automation mode toggled to: ${nextVal ? 'ACTIVE' : 'MANUAL'}`);
      return;
    }

    try {
      await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_heal_enabled: nextVal })
      });
      pushEvent('info', 'CLOSED-LOOP ORCHESTRATION', `Automation mode toggled to: ${nextVal ? 'ACTIVE' : 'MANUAL'}`);
    } catch (err) {
      console.error('Failed to save config:', err);
      setAutoHealEnabled(!nextVal); // revert
    }
  }, [autoHealEnabled, isMockMode, pushEvent]);

  const handleExportHandoffReport = useCallback(() => {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      alert('Pop-up blocker active. Please allow popups to export shift reports.');
      return;
    }

    const nowUTC = new Date().toUTCString();
    
    // Construct router details rows
    const routerRows = Object.entries(telemetryData).map(([id, state]) => {
      const isDown = state.telemetry.link_status === 0;
      const isCongested = state.telemetry.latency > 150 || state.telemetry.packet_loss > 2.0;
      const statusLabel = isDown ? "OUTAGE" : isCongested ? "DEGRADED" : "NOMINAL";
      const statusColor = isDown ? "#f43f5e" : isCongested ? "#f59e0b" : "#10b981";
      const targetSla = id === "ISTRAC-BGL" || id === "SDSC-SHAR" ? 99.99 : 99.95;
      
      let currentSla = targetSla;
      if (isDown) currentSla = parseFloat((targetSla - 0.12).toFixed(3));
      else if (isCongested) currentSla = parseFloat((targetSla - 0.04).toFixed(3));

      return `
        <tr>
          <td style="font-weight: bold; font-family: monospace;">${id}</td>
          <td>${state.telemetry.router_name}</td>
          <td style="color: ${statusColor}; font-weight: bold;">${statusLabel}</td>
          <td>${targetSla}% / <span style="font-weight: bold; color: ${currentSla < targetSla ? '#f43f5e' : '#10b981'}">${currentSla}%</span></td>
          <td>${state.telemetry.latency} ms</td>
          <td>${state.telemetry.packet_loss}%</td>
          <td>${state.telemetry.cpu}%</td>
          <td style="font-weight: bold; color: ${state.analysis.failure_risk > 70 ? '#f43f5e' : state.analysis.failure_risk > 40 ? '#f59e0b' : '#10b981'}">${state.analysis.failure_risk}%</td>
        </tr>
      `;
    }).join('');

    // Construct active alerts rows
    const alertRows = alerts.length > 0 
      ? alerts.map(a => `
        <tr>
          <td style="font-family: monospace;">${a.router_id}</td>
          <td>${a.router_name}</td>
          <td style="color: #f43f5e; font-weight: bold;">${a.risk_score}%</td>
          <td>${a.root_cause}</td>
          <td style="font-family: monospace;">${a.timestamp}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" style="text-align: center; color: #10b981; font-weight: bold;">NO ACTIVE INCIDENTS / SYSTEMS NOMINAL</td></tr>';

    // Construct satellite rows
    const satRows = satelliteData 
      ? Object.values(satelliteData.satellites).map(s => `
        <tr>
          <td style="font-weight: bold;">${s.name} (${s.type})</td>
          <td>${s.altitude} km</td>
          <td>${s.velocity} km/s</td>
          <td>${s.snr} dB</td>
          <td>${s.packet_loss}%</td>
          <td>${s.los ? 'IN VIEW' : 'LOSS OF SIGNAL'}</td>
          <td style="font-family: monospace;">${s.lock_node || 'NONE'}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="7" style="text-align: center; color: #64748b;">No satellite segment data active</td></tr>';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>ISRO PRED-NOC Shift Handover Report</title>
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #1e293b;
            line-height: 1.5;
            padding: 30px;
            background-color: #ffffff;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px double #0f172a;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .logo-text {
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 2px;
            color: #0f172a;
          }
          .sub-logo {
            font-size: 10px;
            font-family: monospace;
            color: #475569;
            margin-top: 4px;
            letter-spacing: 1px;
          }
          .meta-box {
            text-align: right;
            font-size: 11px;
            font-family: monospace;
            color: #475569;
          }
          .title {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            letter-spacing: 1px;
            margin-bottom: 30px;
            text-transform: uppercase;
            background: #f1f5f9;
            padding: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
          }
          h3 {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #94a3b8;
            padding-bottom: 4px;
            margin-top: 30px;
            margin-bottom: 12px;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            text-align: left;
          }
          th {
            background-color: #f8fafc;
            color: #334155;
            font-weight: bold;
          }
          .kpi-grid {
            display: grid;
            grid-template-cols: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 20px;
          }
          .kpi-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 12px;
            background-color: #f8fafc;
            text-align: center;
          }
          .kpi-title {
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: bold;
          }
          .kpi-value {
            font-size: 18px;
            font-weight: bold;
            color: #0f172a;
            margin-top: 4px;
            font-family: monospace;
          }
          .sign-section {
            margin-top: 60px;
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 50px;
          }
          .sign-box {
            border-top: 1px solid #0f172a;
            padding-top: 8px;
            font-size: 11px;
            text-align: center;
            font-weight: bold;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div>
            <div class="logo-text">ISRO PRED-NOC</div>
            <div class="sub-logo">PREDICTIVE MISSION OPERATIONS COMMAND CENTER</div>
          </div>
          <div class="meta-box">
            <div>REPORT ID: SH-${Date.now().toString().slice(-6)}</div>
            <div>GENERATED: ${nowUTC}</div>
            <div>SECURITY LEVEL: RESTRICTED / INTERNAL ONLY</div>
          </div>
        </div>

        <div class="title">Shift Handover & NOC SLA Compliance Report</div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">NOC Health Index</div>
            <div class="kpi-value" style="color: ${healthScore > 75 ? '#10b981' : healthScore > 50 ? '#f59e0b' : '#f43f5e'}">${healthScore}/100</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Active Alarms</div>
            <div class="kpi-value" style="color: ${alerts.length > 0 ? '#f43f5e' : '#10b981'}">${alerts.length}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Mean Resolution Speed (MTTR)</div>
            <div class="kpi-value">${mttrDisplay}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Solar Flare Outage</div>
            <div class="kpi-value" style="color: ${satelliteData?.solar_flare ? '#8b5cf6' : '#10b981'}">${satelliteData?.solar_flare ? 'ACTIVE BLACKOUT' : 'NONE'}</div>
          </div>
        </div>

        <h3>1. Underlay Router Node SLA Status</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Node Name</th>
              <th>Status</th>
              <th>Target / Current SLA</th>
              <th>Latency</th>
              <th>Packet Loss</th>
              <th>CPU Load</th>
              <th>Failure Risk</th>
            </tr>
          </thead>
          <tbody>
            ${routerRows}
          </tbody>
        </table>

        <h3>2. Active SLA Violations & Root Cause Incidents</h3>
        <table>
          <thead>
            <tr>
              <th>Router ID</th>
              <th>Node Name</th>
              <th>Failure Risk</th>
              <th>Root Cause Analysis</th>
              <th>Detected Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${alertRows}
          </tbody>
        </table>

        <h3>3. Space Segment Satellite Transponder Telemetry</h3>
        <table>
          <thead>
            <tr>
              <th>Satellite (Band)</th>
              <th>Altitude</th>
              <th>Velocity</th>
              <th>SNR Level</th>
              <th>Packet Loss</th>
              <th>Visibility status</th>
              <th>Ground lock Node</th>
            </tr>
          </thead>
          <tbody>
            ${satRows}
          </tbody>
        </table>

        <div class="sign-section">
          <div class="sign-box">
            OUTGOING OPERATOR SIGNATURE<br/>
            <span style="font-weight: normal; font-size: 9px; color: #64748b; font-family: monospace;">Time logged: ______________ UTC</span>
          </div>
          <div class="sign-box">
            INCOMING OPERATOR SIGNATURE<br/>
            <span style="font-weight: normal; font-size: 9px; color: #64748b; font-family: monospace;">Time logged: ______________ UTC</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
  }, [telemetryData, alerts, satelliteData, healthScore, mttrDisplay]);






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

      // Mock Auto-Heal orchestration (if enabled in mock mode)
      if (autoHealEnabled) {
        setAlerts(currentAlerts => {
          currentAlerts.forEach(alert => {
            if (alert.router_id !== 'ALL') {
              // If not already scheduled, schedule a timeout to heal
              if (!healingRouterRef.current) {
                healingRouterRef.current = alert.router_id;
                pushEvent('heal', `AUTO-HEAL TRIGGERED: ${alert.router_id}`, 'XGBoost predicted >60% risk. Closed-loop orchestrator executing BGP routing path reroute.', alert.router_id);
                setHealActive(true);
                setTimeout(() => {
                  setHealActive(false);
                  healingRouterRef.current = null;
                  
                  // Restore telemetry to normal
                  setTelemetryData(prev => {
                    const next = { ...prev };
                    const node = next[alert.router_id];
                    if (node) {
                      next[alert.router_id] = {
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
                  setAlerts(prev => prev.filter(a => a.router_id !== alert.router_id));
                  pushEvent('success', `AUTO-HEAL SOLVED: ${alert.router_id}`, 'Metrics stabilized. Closed-loop resolution complete.', alert.router_id);
                }, 6000);
              }
            }
          });
          return currentAlerts;
        });
      }

      // Update satellite mock values
      setSatelliteData(prev => {
        if (!prev) return null;
        const solarFlare = prev.solar_flare;
        const nextSatellites = { ...prev.satellites };

        if (nextSatellites['Cartosat-3']) {
          const sat = nextSatellites['Cartosat-3'];
          // LEO orbital step (moves by 2 degrees per 2s simulation step to match backend speed)
          const nextAngle = (sat.orbit_angle + 2) % 360;
          const los = nextAngle >= 60 && nextAngle <= 180;
          
          // Sector lock node calculations
          let lock_node = 'NONE';
          if (nextAngle >= 60 && nextAngle < 100) {
            lock_node = 'ISTRAC-BGL';
          } else if (nextAngle >= 100 && nextAngle < 140) {
            lock_node = 'SDSC-SHAR';
          } else if (nextAngle >= 140 && nextAngle <= 180) {
            lock_node = 'TRACK-PBL';
          }

          // Handover/AOS/LOS transition check
          const in_transition = los && [60, 100, 140, 180].some(b => Math.abs(nextAngle - b) <= 2);
          
          let snr = 0.0;
          let packet_loss = 100.0;
          
          if (los && !solarFlare) {
            if (in_transition) {
              snr = 11.5 + (Math.random() - 0.5) * 1.5;
              packet_loss = 9.2 + Math.random() * 3.5;
            } else {
              snr = Math.max(22, Math.min(32, sat.snr + (Math.random() - 0.5) * 2));
              packet_loss = Math.max(0, Math.min(1.5, sat.packet_loss + (Math.random() - 0.5) * 0.1));
            }
          }

          nextSatellites['Cartosat-3'] = {
            ...sat,
            orbit_angle: nextAngle,
            los,
            lock_node,
            snr,
            packet_loss,
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
  }, [isMockMode, autoHealEnabled, pushEvent]);

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

  const handleTabNavigate = useCallback((tab: 'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6' | 'forecast' | 'sitrep' | 'bigboard' | 'playbooks') => {
    const url = tab === 'all' ? window.location.pathname : `?tab=${tab}`;
    window.history.pushState({}, '', url);
    setActiveTab(tab);
    if (tab === 'overview') {
      setIsSimOpen(true);
    }
  }, []);

  const handleTabClick = (tab: 'all' | 'overview' | 'predictions' | 'anomalies' | 'rootcause' | 'copilot' | 'selfheal' | 'ph1' | 'ph6' | 'forecast' | 'sitrep' | 'bigboard' | 'playbooks', e: React.MouseEvent) => {
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
  const fetchRouterHistory = useCallback(async (routerId: string) => {
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
  }, [setRouterHistory]);

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
  }, [selectedRouterId, fetchRouterHistory]);

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
          
          if (packet.type === 'auto_heal_trigger') {
            const rid = packet.router_id;
            pushEvent('heal', `AUTO-HEAL TRIGGERED: ${rid}`, `Closed-loop orchestrator initiated automated mitigation script.`, rid);
            setHealActive(true);
            setTimeout(() => {
              setHealActive(false);
              pushEvent('success', `AUTO-HEAL SOLVED: ${rid}`, `Metrics stabilized. Closed-loop resolution complete.`, rid);
            }, 6000);
            return;
          }

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
  }, [pushEvent]);

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

  const cartosatLockNode = satelliteData?.satellites?.['Cartosat-3']?.lock_node || 'NONE';

  // ── Event logging: Handover & Signal AOS/LOS ────────────────────────────────
  useEffect(() => {
    const currentLock = cartosatLockNode;
    const wasLos = prevLockNodeRef.current === 'NONE';
    const isLos = currentLock === 'NONE';

    if (currentLock !== prevLockNodeRef.current) {
      if (wasLos && !isLos) {
        pushEvent('success', 'SATELLITE AOS: Cartosat-3 locked', `Establish connection with station: ${currentLock}`);
      } else if (!wasLos && isLos) {
        pushEvent('warning', 'SATELLITE LOS: Cartosat-3 lost signal', 'LEO transponder entered earth shadow sector. Telemetry down.');
      } else if (!wasLos && !isLos) {
        pushEvent('info', `HANDOVER INITIATED: Cartosat-3`, `Re-routing transponder signal from ${prevLockNodeRef.current} to ${currentLock}`);
        
        // Log a successful transition completion slightly later for realism
        const prevStation = prevLockNodeRef.current;
        const nextStation = currentLock;
        setTimeout(() => {
          pushEvent('success', `HANDOVER COMPLETED: Cartosat-3`, `Link successfully routed to ${nextStation} from ${prevStation}`);
        }, 2000);
      }
      prevLockNodeRef.current = currentLock;
    }
  }, [cartosatLockNode, pushEvent]);


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
  const handleMitigate = useCallback(async (routerId: string) => {
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
  }, [isMockMode, pushEvent, fetchRouterHistory]);

  // ── Speech Synthesis: Verbal Feedback ─────────────────────────────────────
  const speakPhrase = useCallback((text: string) => {
    setVoiceResponse(text);
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                         voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Speech Recognition: Vocal Command Parser ──────────────────────────────
  const handleVoiceCommand = useCallback((transcript: string) => {
    const text = transcript.toLowerCase().trim();
    console.log('Voice Command:', text);

    // Tab Navigation commands
    if (text.includes('show topology') || text.includes('show dashboard') || text.includes('go to topology')) {
      handleTabNavigate('all');
      speakPhrase('Navigating to telemetry topology grid.');
      pushEvent('info', 'VOICE ASSISTANT', 'Command: Show Topology Grid');
      return;
    }
    if (text.includes('show phase one') || text.includes('go to phase one') || text.includes('show engine')) {
      handleTabNavigate('ph1');
      speakPhrase('Displaying primary engine analytics.');
      pushEvent('info', 'VOICE ASSISTANT', 'Command: Navigate to Engine');
      return;
    }
    if (text.includes('show self heal') || text.includes('go to self heal') || text.includes('show phase six') || text.includes('go to phase six')) {
      handleTabNavigate('ph6');
      speakPhrase('Opening closed-loop automation portal.');
      pushEvent('info', 'VOICE ASSISTANT', 'Command: Navigate to Closed-loop');
      return;
    }

    // Toggle Automation
    if (text.includes('toggle auto heal') || text.includes('toggle automation') || text.includes('toggle closed loop')) {
      toggleAutoHeal();
      speakPhrase('Toggling closed-loop automation mode.');
      pushEvent('info', 'VOICE ASSISTANT', 'Command: Toggle Auto-Heal Mode');
      return;
    }

    // Solar Storm Active
    if (text.includes('solar flare') || text.includes('solar storm')) {
      const active = text.includes('active') || text.includes('inject') || text.includes('start') || text.includes('trigger');
      const cease = text.includes('cease') || text.includes('stop') || text.includes('clear');
      
      if (active || cease) {
        const nextState = active;
        if (isMockMode) {
          setSatelliteData(prev => {
            if (!prev) return null;
            return { ...prev, solar_flare: nextState };
          });
        } else {
          fetch(`${BACKEND_URL}/api/simulate-solar-flare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: nextState })
          }).catch(console.error);
        }
        speakPhrase(nextState ? 'Solar flare simulation activated.' : 'Solar storm ceased.');
        pushEvent('info', 'VOICE ASSISTANT', `Command: Solar Storm ${nextState ? 'Active' : 'Ceased'}`);
        return;
      }
    }

    // Health Query
    if (text.includes('health status') || text.includes('grid health') || text.includes('what is health') || text.includes('what is grid health')) {
      speakPhrase(`Grid composite health is ${healthScore} percent.`);
      pushEvent('info', 'VOICE ASSISTANT', 'Query: Grid Health Check');
      return;
    }

    // Node Risk Query
    const matchRisk = text.match(/(?:risk of|risk status of|risk for)\s+([a-z0-9\s-]+)/);
    if (matchRisk && matchRisk[1]) {
      const queryNode = matchRisk[1].replace(/[-_]/g, ' ');
      const foundEntry = Object.entries(telemetryData).find(([rid, node]) => {
        return rid.toLowerCase().includes(queryNode) || node.telemetry.router_name.toLowerCase().includes(queryNode);
      });
      if (foundEntry) {
        const [, node] = foundEntry;
        speakPhrase(`${node.telemetry.router_name} is reporting ${node.analysis.failure_risk} percent failure risk.`);
        pushEvent('info', 'VOICE ASSISTANT', `Query: Telemetry risk on ${node.telemetry.router_name}`);
        return;
      }
    }

    // Mitigate Router Command
    if (text.includes('mitigate') || text.includes('heal')) {
      const queryNode = text.replace('mitigate', '').replace('heal', '').trim();
      const foundEntry = Object.entries(telemetryData).find(([rid, node]) => {
        return rid.toLowerCase().includes(queryNode) || node.telemetry.router_name.toLowerCase().includes(queryNode);
      });
      if (foundEntry) {
        const [rid, node] = foundEntry;
        handleMitigate(rid);
        speakPhrase(`Mitigation started for ${node.telemetry.router_name}.`);
        pushEvent('info', 'VOICE ASSISTANT', `Command: Mitigate ${rid}`);
        return;
      }
    }

    // Unknown command
    speakPhrase('Vocal command not recognised. Please repeat.');
    pushEvent('warning', 'VOICE ASSISTANT', `Unknown vocal query: "${transcript}"`);
  }, [telemetryData, healthScore, isMockMode, toggleAutoHeal, handleMitigate, pushEvent, speakPhrase, handleTabNavigate]);

  // ── Speech Recognition: Assistant Controller ─────────────────────────────
  const toggleVoiceAssistant = useCallback(() => {
    setIsVoiceDrawerOpen(true);
    if (voiceListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setVoiceListening(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        alert('Web Speech API is not supported in this browser. Please use Chrome or Edge.');
        return;
      }
      
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setVoiceListening(true);
        setVoiceTranscript('Listening for command...');
        speakPhrase('Chitthi assistant active. Listening for command.');
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        const transcriptText = e.results[0][0].transcript;
        setVoiceTranscript(transcriptText);
        handleVoiceCommand(transcriptText);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e.error);
        setVoiceListening(false);
        if (e.error === 'not-allowed') {
          alert('Microphone permission denied. Please allow mic access in your browser settings.');
        }
      };

      rec.onend = () => {
        setVoiceListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    }
  }, [voiceListening, handleVoiceCommand, speakPhrase]);

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
            {/* Closed-Loop Auto-Heal Toggle */}
            <button
              onClick={toggleAutoHeal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all duration-300 font-bold ${
                autoHealEnabled
                  ? 'text-noc-success bg-noc-success/15 border-noc-success/40 hover:bg-noc-success/25 shadow-glow-green animate-pulse-slow'
                  : 'text-noc-muted bg-noc-card border-noc-border hover:bg-noc-border hover:text-noc-text'
              }`}
              title="Click to toggle between Closed-Loop Automated Healing and Manual operator mitigation mode"
            >
              <Shield className={`w-3.5 h-3.5 ${autoHealEnabled ? 'text-noc-success animate-bounce' : 'text-noc-muted'}`} style={{ animationDuration: '3s' }} />
              <span>AUTO-HEAL: {autoHealEnabled ? 'CLOSED-LOOP' : 'MANUAL'}</span>
            </button>

            {/* ── Chitthi Voice Operations Deck ─────────────────────────── */}
            <button
              id="chitthi-mic-btn"
              onClick={toggleVoiceAssistant}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all duration-300 font-bold ${
                voiceListening
                  ? 'text-noc-warning bg-noc-warning/15 border-noc-warning/50 shadow-[0_0_12px_rgba(251,191,36,0.4)] animate-pulse'
                  : 'text-noc-muted bg-noc-card border-noc-border hover:bg-noc-border hover:text-noc-text'
              }`}
              title="Chitthi — AI Voice Operations Deck. Click to activate hands-free voice commands."
            >
              {voiceListening ? (
                <MicOff className="w-3.5 h-3.5 text-noc-warning" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              <span>CHITTHI: {voiceListening ? 'LISTENING…' : 'VOICE'}</span>
            </button>

            {/* Export Shift Report */}
            <button
              onClick={handleExportHandoffReport}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-noc-primary bg-noc-primary/10 border-noc-primary/30 hover:bg-noc-primary/20 hover:text-noc-text transition-all duration-300 font-bold cursor-pointer"
              title="Export shift handover report as official print-ready document"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>SHIFT REPORT</span>
            </button>

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
            <span className="text-noc-border px-1">|</span>
            <button
              id="tab-forecast"
              onClick={(e) => handleTabClick('forecast', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'forecast'
                  ? 'bg-purple-500/25 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                  : 'hover:bg-purple-500/20 text-purple-400/70 hover:text-purple-300'
              }`}
            >
              ⚡ FORECAST
            </button>
            <span className="text-noc-border px-1">|</span>
            <button
              id="tab-sitrep"
              onClick={(e) => handleTabClick('sitrep', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'sitrep'
                  ? 'bg-emerald-500/25 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                  : 'hover:bg-emerald-500/20 text-emerald-400/70 hover:text-emerald-300'
              }`}
            >
              📋 SITREP
            </button>
            <span className="text-noc-border px-1">|</span>
            <button
              id="tab-bigboard"
              onClick={(e) => handleTabClick('bigboard', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'bigboard'
                  ? 'bg-cyan-500/25 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                  : 'hover:bg-cyan-500/20 text-cyan-400/70 hover:text-cyan-300'
              }`}
            >
              📺 BIG BOARD
            </button>
            <span className="text-noc-border px-1">|</span>
            <button
              id="tab-playbooks"
              onClick={(e) => handleTabClick('playbooks', e)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all text-center uppercase ${
                activeTab === 'playbooks'
                  ? 'bg-amber-500/25 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  : 'hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-300'
              }`}
            >
              🛠️ PLAYBOOKS
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

            {/* KPI 6: Push Notification Status */}
            <div className="glass-panel rounded-lg p-3 flex items-center justify-between border-noc-border/40">
              <div>
                <span className="text-[10px] text-noc-muted font-mono uppercase tracking-wider block">Push Alerts</span>
                <span className={`font-display text-xl font-bold ${
                  notifPermission === 'granted' ? 'text-noc-success' :
                  notifPermission === 'denied'  ? 'text-noc-danger' : 'text-noc-muted'
                }`}>
                  {notifPermission === 'granted' ? 'ACTIVE' : notifPermission === 'denied' ? 'BLOCKED' : 'OFF'}
                </span>
              </div>
              {notifPermission === 'granted' ? (
                <div className="p-1.5 rounded border bg-noc-success/10 border-noc-success/20 text-noc-success">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              ) : (
                <button
                  onClick={() => Notification.requestPermission().then(p => setNotifPermission(p))}
                  className="p-1.5 rounded border bg-noc-warning/10 border-noc-warning/20 text-noc-warning hover:bg-noc-warning/20 transition-colors cursor-pointer"
                  title={notifPermission === 'denied' ? 'Enable notifications in browser settings' : 'Click to enable push alerts'}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              )}
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
        ) : activeTab === 'forecast' ? (
          <div className="flex-1 flex flex-col h-full bg-[#060a16] border border-purple-500/20 rounded-xl p-5 glass-panel min-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-6 bg-purple-400 rounded-full" />
              <div>
                <h3 className="text-sm font-mono font-black text-purple-300 uppercase tracking-widest">⚡ PREDICTIVE FAILURE FORECAST ENGINE</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">AI-powered 30-minute failure risk projection using exponential smoothing + linear regression on live telemetry</p>
              </div>
            </div>
            <ForecastEngine
              routerHistory={routerHistory}
              routerNames={Object.fromEntries(
                Object.entries(telemetryData).map(([id, s]) => [id, s.telemetry.router_name])
              )}
            />
          </div>
        ) : activeTab === 'sitrep' ? (
          <div className="flex-1 flex flex-col h-full bg-[#060a16] border border-emerald-500/20 rounded-xl p-5 glass-panel min-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-6 bg-emerald-400 rounded-full" />
              <div>
                <h3 className="text-sm font-mono font-black text-emerald-300 uppercase tracking-widest">📋 AI ALERT CORRELATION &amp; SITREP ENGINE</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Real-time incident correlation, blast radius analysis, and auto-generated situational report</p>
              </div>
            </div>
            <SitrepPanel
              alerts={alerts}
              routerHistory={routerHistory}
              telemetryData={telemetryData as Parameters<typeof SitrepPanel>[0]['telemetryData']}
              healthScore={healthScore}
              utcTime={utcTime}
              isMockMode={isMockMode}
            />
          </div>
        ) : activeTab === 'bigboard' ? (
          <div className="flex-1 flex flex-col h-full bg-[#060a16] border border-cyan-500/20 rounded-xl p-5 glass-panel min-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-6 bg-cyan-400 rounded-full" />
              <div>
                <h3 className="text-sm font-mono font-black text-cyan-300 uppercase tracking-widest">📺 ISRO MISSION CONTROL BIG BOARD</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Cinematic ground segment ops big board featuring live data link streams &amp; telemetry gauges</p>
              </div>
            </div>
            <BigBoard
              telemetryData={telemetryData as Parameters<typeof BigBoard>[0]['telemetryData']}
              alerts={alerts}
              missionEvents={missionEvents}
              routerHistory={routerHistory}
              healthScore={healthScore}
              utcTime={utcTime}
              isMockMode={isMockMode}
              healActive={healActive}
            />
          </div>
        ) : activeTab === 'playbooks' ? (
          <div className="flex-1 flex flex-col h-full bg-[#060a16] border border-amber-500/20 rounded-xl p-5 glass-panel min-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-6 bg-amber-400 rounded-full" />
              <div>
                <h3 className="text-sm font-mono font-black text-amber-300 uppercase tracking-widest">🛠️ INTERACTIVE DIAGNOSTIC PLAYBOOK EXECUTOR</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Execute network diagnostic CLI workflows and apply dynamic config mitigations on ground station nodes</p>
              </div>
            </div>
            <PlaybookExecutor
              telemetryData={telemetryData as Parameters<typeof PlaybookExecutor>[0]['telemetryData']}
              onMitigate={handleMitigate}
            />
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
                  <>
                    <div className={activeTab === 'selfheal' ? 'border border-noc-success/40 shadow-glow-green rounded-xl transition-all duration-500' : ''}>
                      <AlertsPanel 
                        alerts={alerts}
                        telemetryData={telemetryData}
                        onMitigate={handleMitigate}
                      />
                    </div>
                    {activeTab === 'anomalies' && (
                      <>
                        <AnomalyScatterPlot
                          telemetryData={telemetryData as Parameters<typeof AnomalyScatterPlot>[0]['telemetryData']}
                          routerHistory={routerHistory}
                        />
                        <SlaConsole
                          telemetryData={telemetryData}
                          resolvedTimes={resolvedTimes}
                        />
                      </>
                    )}
                  </>
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
                
                {activeTab === 'all' && (
                  <PathTracer telemetryData={telemetryData} />
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
      <ChitthiVoiceDrawer
        isOpen={isVoiceDrawerOpen}
        onClose={() => setIsVoiceDrawerOpen(false)}
        voiceListening={voiceListening}
        voiceTranscript={voiceTranscript}
        voiceResponse={voiceResponse}
        onStartMic={toggleVoiceAssistant}
      />
    </>
  );
};

export default App;
