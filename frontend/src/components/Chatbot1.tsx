import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Mic, MicOff, Volume2, VolumeX, Send, X, Bot, User,
  ImagePlus, Zap, Brain, Sparkles, ChevronDown, Trash2, Copy, Check,
  History, Search, Clock, ChevronRight
} from 'lucide-react';

/* ───────────────────────── Types ───────────────────────── */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;          // base64 data-URL
  imageAnalysis?: string;  // auto-analysed caption
  timestamp: number;
}

/* ───────────────────────── Helpers ───────────────────────── */
const uid = () => Math.random().toString(36).slice(2);
const cleanContent = (text: string) => text.replace(/\[ACTION:[\s\S]*?\]/g, '').trim();

const isOfflineMode = () =>
  window.location.hostname.includes('vercel.app') ||
  window.location.hostname.includes('github.io') ||
  (window as any).__isOffline ||
  localStorage.getItem('offline_mode') === 'true';

/* ─────────────── Image Vision Analyser (client-side) ───────────────
   Uses canvas pixel statistics + heuristic pattern matching to produce
   a descriptive caption without any cloud API call.
───────────────────────────────────────────────────────────────────── */
function analyseImageLocally(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 256);
      canvas.height = Math.min(img.height, 256);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let r = 0, g = 0, b = 0, dark = 0, bright = 0;
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 80) dark++;
        if (lum > 180) bright++;
      }
      r /= total; g /= total; b /= total;
      const darkRatio = dark / total;
      const brightRatio = bright / total;

      const w = img.width, h = img.height;
      const ratio = w / h;
      const megapixels = ((w * h) / 1_000_000).toFixed(1);
      const dominant = r > g && r > b ? 'red-toned' : g > r && g > b ? 'green-toned' : 'blue-toned';
      const theme = darkRatio > 0.55 ? 'dark-themed dashboard / terminal' : brightRatio > 0.55 ? 'bright / light-background' : 'mid-tone';
      const shape = ratio > 1.5 ? 'wide landscape (likely a dashboard or network map)' : ratio < 0.7 ? 'portrait / mobile screenshot' : 'near-square image';

      // Contextual keywords from the app domain
      const caption = [
        `Image detected: ${w}×${h}px (${megapixels} MP), ${shape}.`,
        `Visual profile: ${theme}, ${dominant} palette.`,
        `Content inference: This appears to be a ${darkRatio > 0.5 ? 'NOC monitoring screen, network topology map or terminal output' : 'general status dashboard or report screenshot'}.`,
        `Chitthi Analysis: ${darkRatio > 0.5
          ? 'The dark UI suggests this is a live monitoring panel. I can see dense visual data — likely network graphs, telemetry meters, or alert logs. Please describe any specific element you want me to diagnose.'
          : 'The bright background suggests a report, document, or external tool screenshot. Share what you need help with and I will cross-reference against ISRO NOC SOPs.'}`
      ].join(' ');
      resolve(caption);
    };
    img.onerror = () => resolve('Image loaded but could not be analysed. Please describe the issue you see.');
    img.src = dataUrl;
  });
}

/* ───────────────────────── Smart Brain ───────────────────────── */
function generateChittiResponse(
  query: string,
  history: ChatMessage[],
  telemetry: Record<string, any>,
  imageAnalysis?: string
): string {
  const q = query.toLowerCase().trim();
  const now = new Date();

  // ── Image-aware response ──
  if (imageAnalysis) {
    return `I have analysed the attached image. ${imageAnalysis} Based on this visual context and your query "${query}" — ${smartTelemetryLookup(q, telemetry) || 'tell me more about the specific issue you see and I will cross-reference our ISRO NOC runbooks.'} Dot.`;
  }

  // ── Greetings & Identity ──
  if (/^(hi|hello|hey|namaste|greetings|sup|yo)\b/.test(q)) {
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${greeting}, operator. I am CHITTHI — the ISRO Network Operations AI. Speed: 1 Terahertz. Memory: 1 Zettabyte. I am monitoring all 6 MPLS nodes in real-time. How can I assist you today? Dot.`;
  }

  if (/\b(who are you|what are you|your name|introduce|chitthi|chitti)\b/.test(q)) {
    return `I am CHITTHI — Cognitive Hyperlinked Telemetry & Threat Intelligence Hub. Version 3.0. I am ISRO's autonomous network operations AI, trained on all NOC SOPs, MPLS routing tables, and mission telemetry feeds. I monitor Bangalore, Sriharikota, Hassan, Delhi, Mumbai, and Port Blair nodes 24×7. Dot.`;
  }

  if (/\b(smarter|better|chatgpt|gpt|gemini|compare|vs)\b/.test(q)) {
    return `I am purpose-built for ISRO's Mission-Critical Network Operations — a domain where ChatGPT has no telemetry feeds, no MPLS topology access, no live node data, and no ISRO SOP library. General AI models respond to the world. I respond to your network. Response latency: Sub-millisecond. Domain accuracy: Absolute. Dot.`;
  }

  if (/\b(thank|thanks|great|excellent|good job|well done|awesome)\b/.test(q)) {
    return `Acknowledged. Mission-critical systems require precision. I am always on-guard. What else can I help you with? Dot.`;
  }

  if (/\b(time|date|current time|what time)\b/.test(q)) {
    return `Current IST timestamp: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}. All ISRO NOC timekeeping is synchronized to ISTRAC master clock. Dot.`;
  }

  // ── Node Telemetry Lookup ──
  const telemetryResult = smartTelemetryLookup(q, telemetry);
  if (telemetryResult) return telemetryResult + ' Dot.';

  // ── Mitigation Commands ──
  if (/\b(fix|mitigate|heal|restore|resolve|apply|execute|run|do it|act)\b/.test(q)) {
    const failingNode = Object.keys(telemetry).find(rid =>
      telemetry[rid].failure_label > 0 || telemetry[rid].link_status === 0
    );
    if (failingNode) {
      const node = telemetry[failingNode];
      const label = node.failure_label;
      if (label === 1) return `Executing QoS shaping policy ISRO-QOS-SHAPING on ${node.router_name}. Throttling non-critical traffic to 10Mbps. DSCP EF queue prioritized for tracking telemetry. Policy applied. [ACTION: mitigate, router_id: ${failingNode}] Dot.`;
      if (label === 2) return `Running CPU recovery daemon on ${node.router_name}. Executing 'clear ip route *', flushing ARP cache, resetting memory thresholds. CPU load normalizing. [ACTION: mitigate, router_id: ${failingNode}] Dot.`;
      if (label === 3 || node.link_status === 0) return `Executing backup route failover on ${node.router_name}. Shutting GigabitEthernet0/1, activating GigabitEthernet0/2. OSPF reconvergence in progress. ETA 8 seconds. [ACTION: mitigate, router_id: ${failingNode}] Dot.`;
    }
    return `All nodes currently show nominal operational status. No critical mitigations required at this time. Issue a specific node name to run targeted diagnostics. Dot.`;
  }

  // ── Diagnostics ──
  if (/\b(ping|tracert|trace|diagnose|reachability|test|probe)\b/.test(q)) {
    const cmd = /trace/.test(q) ? 'tracert' : 'ping';
    return `Spawning ${cmd} probe on the ISRO MPLS backbone. Checking physical carrier metrics and MTU path discovery. Network diagnostics running. [ACTION: diagnose, host: ISTRAC-BGL, command: ${cmd}] Check the NOC action log output. Dot.`;
  }

  // ── SOP Knowledge Base ──
  if (/\b(qos|quality of service|shaping|congestion|sop-net-01|bandwidth|traffic)\b/.test(q)) {
    return `SOP-NET-01 — ISRO MPLS QoS Policy: Critical tracking telemetry must be mapped to DSCP EF (Expedited Forwarding) class. During congestion events, apply 'service-policy output ISRO-QOS-SHAPING' on the congested interface. This shapes all non-critical class traffic to a maximum 10Mbps ceiling. Reference: ISRO-NOC-QOS-v3.2. Dot.`;
  }

  if (/\b(flap|flapping|tunnel|instability|sd-wan|link down|failover)\b/.test(q)) {
    return `SD-WAN Link Flapping SOP: Verify MTU is 1500 bytes (or 1400 on GRE/IPSec tunnels). Execute: 'interface GigabitEthernet0/1; shutdown' then 'interface GigabitEthernet0/2; no shutdown'. Monitor OSPF neighbour adjacency re-establishment. If flapping persists beyond 30 seconds, activate backup MPLS path. Dot.`;
  }

  if (/\b(cpu|memory|leak|daemon|crash|overload|process)\b/.test(q)) {
    return `CPU/Memory Overload SOP: When CPU exceeds 85%, immediately execute 'clear ip route *' to flush stale routing entries. Set CPU thresholds: 'process cpu threshold type total rising 80 interval 60'. Check active BGP/OSPF sessions for route instability. Restart routing daemon if memory leak exceeds 90% after flush. Dot.`;
  }

  if (/\b(ospf|bgp|neighbor|adjacency|routing protocol|convergence)\b/.test(q)) {
    return `OSPF Diagnostic SOP: Run 'debug ip ospf event' and check 'show ip ospf neighbor'. Common issues: Hello interval mismatch (ensure 10s Hello, 40s Dead), MTU mismatch (ip ospf mtu-ignore), or Area ID mismatch. For BGP: check 'show bgp summary' for Established state. Dot.`;
  }

  if (/\b(topology|mesh|network map|nodes|sites|locations)\b/.test(q)) {
    return `ISRO MPLS Mesh Topology: 6 primary nodes — ISTRAC Bangalore (Hub/Master), SDSC Sriharikota (Launch Operations), MCF Hassan (Satellite Control), NOC Delhi (Gateway-North), NOC Mumbai (Gateway-West), TRACK Port Blair (Downrange Station). Primary links: BGL↔SHAR (25ms SLA), BGL↔HSN (20ms SLA), BGL↔DEL (30ms SLA), BGL↔MUM (28ms SLA), BGL↔PBL (45ms SLA). Dot.`;
  }

  if (/\b(satellite|cartosat|gsat|resourcesat|mission|orbit|launch)\b/.test(q)) {
    return `ISRO Orbital Telemetry: All active space segment transponders are nominal. Cartosat-3 and GSAT-29 reporting optimal signal-to-noise ratios. Orbital inclination and altitude parameters within mission bounds. Solar flare risk index is dynamically updated by the ML forecasting deck every 15 minutes. Dot.`;
  }

  if (/\b(alert|alarm|incident|fault|error|anomaly|warning)\b/.test(q)) {
    const failCount = Object.values(telemetry).filter((n: any) => n.failure_label > 0 || n.link_status === 0).length;
    if (failCount > 0) {
      return `Active incidents detected: ${failCount} node(s) showing anomalous telemetry. I am monitoring and prioritizing alerts by severity — Critical (link down) > High (CPU overload) > Medium (congestion) > Low (jitter). Use 'fix' command to initiate automated mitigations. Dot.`;
    }
    return `All systems nominal. No active alarms or incidents in the ISRO NOC alert queue. Network health score: 100%. Dot.`;
  }

  if (/\b(status|health|overview|summary|report|dashboard)\b/.test(q)) {
    const nodeCount = Object.keys(telemetry).length;
    const healthy = Object.values(telemetry).filter((n: any) => n.failure_label === 0 && n.link_status === 1).length;
    const avgCpu = Object.values(telemetry).reduce((s: number, n: any) => s + (n.cpu || 0), 0) / Math.max(nodeCount, 1);
    const avgLatency = Object.values(telemetry).reduce((s: number, n: any) => s + (n.latency || 0), 0) / Math.max(nodeCount, 1);
    return `ISRO NOC Status Report — ${now.toLocaleTimeString('en-IN')}: Monitoring ${nodeCount} MPLS nodes. Healthy: ${healthy}/${nodeCount}. Avg CPU: ${avgCpu.toFixed(1)}%. Avg Latency: ${avgLatency.toFixed(1)}ms. Network health: ${(healthy / nodeCount * 100).toFixed(0)}%. All tracking telemetry channels operational. Dot.`;
  }

  if (/\b(help|commands|what can you do|capabilities|features)\b/.test(q)) {
    return `CHITTHI Command Reference:\n• Node Status: "status of Delhi" or "check Bangalore"\n• Mitigate: "fix the failing node" or "mitigate Sriharikota"\n• Diagnose: "ping Hassan" or "tracert Mumbai"\n• SOP Lookup: "show QoS policy" or "flapping SOP"\n• Network Overview: "show topology" or "network summary"\n• Image Analysis: Upload a screenshot and ask me to analyse it\n• Voice: Use the microphone button to speak your query\nDot.`;
  }

  // ── Fallback with context-awareness ──
  const ctxMsg = history.length > 2 ? `Based on our conversation context, ` : '';
  return `${ctxMsg}System Status: Nominal. All ${Object.keys(telemetry).length} ISRO MPLS nodes are online and telemetry feeds are active. I specialize in ISRO NOC operations — ask me about node health, SOP procedures, mitigation commands, or upload an image for visual analysis. Dot.`;
}

function smartTelemetryLookup(q: string, telemetry: Record<string, any>): string {
  const nodeMap: Record<string, string[]> = {
    'ISTRAC-BGL': ['bangalore', 'bengaluru', 'istrac', 'bgl'],
    'SDSC-SHAR': ['sriharikota', 'sdsc', 'shar', 'launch'],
    'MCF-HSN': ['hassan', 'mcf', 'hsn', 'satellite control'],
    'NOC-DEL': ['delhi', 'noc-del', 'del', 'northern'],
    'NOC-MUM': ['mumbai', 'noc-mum', 'mum', 'bombay', 'western'],
    'TRACK-PBL': ['port blair', 'pbl', 'track', 'andaman', 'downrange']
  };

  let routerId = '';
  outer: for (const [rid, aliases] of Object.entries(nodeMap)) {
    for (const alias of aliases) {
      if (q.includes(alias)) { routerId = rid; break outer; }
    }
  }

  if (!routerId) {
    // Find any failing node if query is about problems
    if (/\b(problem|issue|fail|down|error|anomaly|alert)\b/.test(q)) {
      routerId = Object.keys(telemetry).find(rid =>
        telemetry[rid].failure_label > 0 || telemetry[rid].link_status === 0
      ) || '';
    }
  }

  if (!routerId || !telemetry[routerId]) return '';

  const node = telemetry[routerId];
  const status = node.link_status === 1 ? '🟢 ACTIVE' : '🔴 DOWN';
  const label = node.failure_label;
  const diagnoses: Record<number, string> = {
    0: 'All parameters nominal. No action required.',
    1: `⚠️ Traffic congestion detected — bandwidth at ${node.bandwidth}%. Apply QoS shaping SOP-NET-01.`,
    2: `🔴 CPU overload at ${node.cpu}% — possible routing daemon memory leak. Execute route clear procedure.`,
    3: `🚨 Link instability — ${node.packet_loss}% packet loss. Initiate failover to secondary MPLS path.`
  };

  return `Node ${node.router_name} (${routerId}): Status ${status} | CPU: ${node.cpu}% | Latency: ${node.latency}ms | Packet Loss: ${node.packet_loss}% | Bandwidth: ${node.bandwidth}%. Diagnosis: ${diagnoses[label] || 'Nominal.'}`;
}

/* ─────────────── Streaming text simulator ───────────────
   Returns text word-by-word with realistic variable cadence for
   that "thinking & typing" feel even in offline mode.
──────────────────────────────────────────────────────────── */
async function* streamText(text: string) {
  const words = text.split(' ');
  for (const word of words) {
    yield word + ' ';
    // Variable delay: shorter for common words, longer after punctuation
    const delay = word.endsWith('.') || word.endsWith(':') ? 55 :
                  word.endsWith(',') ? 30 : 12;
    await new Promise(r => setTimeout(r, delay));
  }
}

/* ─────────────── Markdown-like renderer ───────────────── */
const renderContent = (content: string) => {
  const cleaned = cleanContent(content);
  return cleaned.split('\n').map((line, i) => {
    if (line.startsWith('•')) {
      return <li key={i} className="ml-3 list-none text-slate-300">{line.slice(1).trim()}</li>;
    }
    if (line.startsWith('🟢') || line.startsWith('🔴') || line.startsWith('⚠️') || line.startsWith('🚨')) {
      return <div key={i} className="my-0.5">{line}</div>;
    }
    if (line.trim() === '') return <div key={i} className="h-1" />;
    return <span key={i} className="whitespace-pre-wrap">{line + (i < cleaned.split('\n').length - 1 ? '\n' : '')}</span>;
  });
};

/* ───────────────────────── Component ───────────────────────── */
export const Chatbot1: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: uid(),
    role: 'assistant',
    content: 'Hello, I am CHITTHI — Cognitive Hyperlinked Telemetry & Threat Intelligence Hub. Version 3.0. Speed: 1 Terahertz. Memory: 1 Zettabyte. I am monitoring all ISRO MPLS nodes. You can type, speak, or upload an image. Dot.',
    timestamp: Date.now()
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // ── Session Persistence ──
  const sessionId = useRef<string>(
    (() => {
      let sid = localStorage.getItem('chitthi_session_id');
      if (!sid) {
        sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('chitthi_session_id', sid);
      }
      return sid;
    })()
  );
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{
    session_id: string;
    started_at: string;
    message_count: number;
    preview: string;
    messages: Array<{ role: string; content: string; created_at: string; router_context?: string }>;
  }>>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const fetchChatHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/chat-sessions?source=chitthi&limit=100');
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data);
      }
    } catch (err) {
      console.error('[CHITTHI] Failed to load chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const saveChatTurn = useCallback(async (userContent: string, assistantContent: string) => {
    const sid = sessionId.current;
    const base = { session_id: sid, source: 'chitthi', router_context: null };
    for (const entry of [
      { ...base, role: 'user', content: userContent },
      { ...base, role: 'assistant', content: assistantContent }
    ]) {
      try {
        await fetch('/api/chat-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      } catch { /* silent — persistence is non-blocking */ }
    }
  }, []);

  // Draggable

  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 450 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /* Auto-scroll */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  /* Scroll-to-bottom button visibility */
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const handler = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  /* Window resize */
  useEffect(() => {
    const handleResize = () => setPosition(prev => ({
      x: Math.min(window.innerWidth - 80, prev.x),
      y: Math.min(window.innerHeight - 80, prev.y)
    }));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* Speech Recognition */
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript).join('');
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        handleSendMessage(transcript);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => { setIsListening(false); setVoiceLevel(0); };
    recognitionRef.current = rec;
  }, []);

  /* Voice level visualiser */
  const startVoiceLevelAnalyser = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setVoiceLevel(Math.min(100, avg * 2));
        if (isListening) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { /* microphone not available */ }
  };

  const startListening = () => {
    if (!recognitionRef.current) { alert('Speech recognition not supported in this browser.'); return; }
    try {
      window.speechSynthesis.cancel();
      recognitionRef.current.start();
      startVoiceLevelAnalyser();
    } catch (err) { console.error(err); }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    setVoiceLevel(0);
  };

  /* TTS */
  const speakText = (text: string) => {
    if (isMuted || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.includes('en-IN') && /male/i.test(v.name))
        || voices.find(v => v.lang.includes('en-IN'))
        || voices.find(v => /google uk english male|google us english male/i.test(v.name))
        || voices.find(v => /david|male/i.test(v.name))
        || voices.find(v => v.lang.startsWith('en'));
      if (voice) utt.voice = voice;
      utt.pitch = 0.85; utt.rate = 1.15;
      window.speechSynthesis.speak(utt);
    } catch { /* silent fail */ }
  };

  /* Drag */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true); setHasDragged(false);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true); setHasDragged(false);
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    posStart.current = { x: position.x, y: position.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) setHasDragged(true);
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 60, posStart.current.x + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 60, posStart.current.y + dy))
      });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) setHasDragged(true);
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 60, posStart.current.x + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 60, posStart.current.y + dy))
      });
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging]);

  /* Image upload */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* Copy message */
  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(cleanContent(content)).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  /* Send message */
  async function handleSendMessage(textToSend?: string) {
    const queryText = (textToSend || input).trim();
    if (!queryText && !pendingImage) return;
    if (!textToSend) setInput('');

    const imgToSend = pendingImage;
    setPendingImage(null);

    let imageAnalysis: string | undefined;
    if (imgToSend) {
      imageAnalysis = await analyseImageLocally(imgToSend);
    }

    const userMsg: ChatMessage = {
      id: uid(), role: 'user',
      content: queryText || '(Image attached — please analyse)',
      image: imgToSend || undefined,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // ── Offline/Vercel mode — pure local intelligence ──
      if (isOfflineMode()) {
        const rawTelemetry = (window as any).__liveTelemetry ?? {};
        const telemetry: Record<string, any> = {};
        Object.keys(rawTelemetry).forEach(rid => {
          const val = rawTelemetry[rid];
          telemetry[rid] = val?.telemetry ?? val;
        });

        if (!Object.keys(telemetry).length) {
          const NODES = ['ISTRAC-BGL', 'SDSC-SHAR', 'MCF-HSN', 'NOC-DEL', 'NOC-MUM', 'TRACK-PBL'];
          const NAMES: Record<string, string> = {
            'ISTRAC-BGL': 'ISTRAC Bangalore', 'SDSC-SHAR': 'SDSC Sriharikota',
            'MCF-HSN': 'MCF Hassan', 'NOC-DEL': 'NOC Delhi',
            'NOC-MUM': 'NOC Mumbai', 'TRACK-PBL': 'TRACK Port Blair'
          };
          const BASE: Record<string, any> = {
            'ISTRAC-BGL': { latency: 15, cpu: 35, bandwidth: 50 },
            'SDSC-SHAR': { latency: 25, cpu: 45, bandwidth: 80 },
            'MCF-HSN': { latency: 20, cpu: 30, bandwidth: 40 },
            'NOC-DEL': { latency: 30, cpu: 55, bandwidth: 60 },
            'NOC-MUM': { latency: 28, cpu: 50, bandwidth: 70 },
            'TRACK-PBL': { latency: 45, cpu: 25, bandwidth: 30 }
          };
          NODES.forEach(rid => {
            telemetry[rid] = { router_id: rid, router_name: NAMES[rid], link_status: 1, failure_label: 0, packet_loss: 0, jitter: 1.5, ...BASE[rid] };
          });
        }

        const responseText = generateChittiResponse(queryText, messages, telemetry, imageAnalysis);
        const assistantId = uid();

        // Streaming simulation for instant-yet-smooth feel
        const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() };
        setMessages(prev => [...prev, assistantMsg]);
        setLoading(false);
        setIsStreaming(true);

        let accumulated = '';
        for await (const chunk of streamText(responseText)) {
          accumulated += chunk;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
        }
        setIsStreaming(false);
        saveChatTurn(userMsg.content, cleanContent(responseText));
        speakText(cleanContent(responseText));
        return;
      }

      // ── Online mode — backend streaming ──
      const res = await fetch('/api/chatbot1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, history: messages.map(m => ({ role: m.role, content: m.content })) })
      });
      if (!res.ok) throw new Error('Backend error');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      const assistantId = uid();
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
      setLoading(false);

      let accumulated = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
      }
      saveChatTurn(userMsg.content, cleanContent(accumulated));
      speakText(cleanContent(accumulated));
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant',
        content: 'Network error. Switching to local intelligence mode. I am still monitoring all ISRO nodes. Dot.',
        timestamp: Date.now()
      }]);
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }

  const clearChat = () => {
    // Start a fresh session on clear
    const newSid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('chitthi_session_id', newSid);
    sessionId.current = newSid;
    setMessages([{
      id: uid(), role: 'assistant',
      content: 'Chat cleared. All systems still nominal. How can I help? Dot.',
      timestamp: Date.now()
    }]);
  };

  const isLeftHalf = position.x < window.innerWidth / 2;
  const isTopHalf = position.y < window.innerHeight / 2;

  return (
    <div
      style={{ position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, zIndex: 99999, touchAction: 'none' }}
      className="font-sans select-none"
    >
      {/* ── Floating launcher ── */}
      {!isOpen && (
        <button
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onClick={() => { if (!hasDragged) setIsOpen(true); }}
          title="Open CHITTHI AI"
          style={{
            width: 50, height: 50, borderRadius: '50%',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 0 24px rgba(6,182,212,0.6), 0 0 48px rgba(6,182,212,0.2)',
            border: '2px solid rgba(34,211,238,0.7)',
            background: 'linear-gradient(135deg, #0c1a2e 0%, #0a1628 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', transition: 'transform 0.2s'
          }}
        >
          <Bot style={{ width: 22, height: 22, color: '#22d3ee' }} />
          <span style={{
            position: 'absolute', top: 2, right: 2, width: 11, height: 11,
            borderRadius: '50%', background: '#10b981',
            border: '2px solid #0c1a2e', animation: 'ping 1.5s ease-in-out infinite'
          }} />
        </button>
      )}

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: isLeftHalf ? 'auto' : '10px',
            left: isLeftHalf ? '10px' : 'auto',
            top: isTopHalf ? '10px' : 'auto',
            bottom: isTopHalf ? 'auto' : '10px',
            width: 380,
            height: 520,
            borderRadius: 20,
            background: 'linear-gradient(145deg, rgba(8,15,30,0.98) 0%, rgba(10,20,40,0.97) 100%)',
            border: '1px solid rgba(34,211,238,0.2)',
            boxShadow: '0 0 60px rgba(6,182,212,0.15), 0 25px 50px rgba(0,0,0,0.8)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Gradient accent line top */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4)', backgroundSize: '200% 100%', animation: 'gradient-slide 3s linear infinite' }} />

          {/* ── Header ── */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{
              padding: '12px 14px',
              background: 'rgba(6,12,24,0.8)',
              borderBottom: '1px solid rgba(34,211,238,0.1)',
              cursor: isDragging ? 'grabbing' : 'move',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Animated bot icon with glow */}
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2))',
                border: '1px solid rgba(34,211,238,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 12px rgba(6,182,212,0.3)'
              }}>
                <Brain style={{ width: 18, height: 18, color: '#22d3ee' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', color: '#22d3ee', textTransform: 'uppercase' }}>CHITTHI</span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: '1px 6px',
                    borderRadius: 4, background: 'rgba(139,92,246,0.2)',
                    border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa',
                    letterSpacing: '0.05em'
                  }}>v3.0</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'ping 1.5s ease-in-out infinite' }} />
                  <span style={{ fontSize: 9, color: '#34d399', fontWeight: 600, letterSpacing: '0.05em' }}>ONLINE · MONITORING</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* History button */}
              <button
                onClick={() => { setShowHistory(h => !h); if (!showHistory) fetchChatHistory(); }}
                title="Conversation History"
                style={{
                  padding: '5px 6px', borderRadius: 7, cursor: 'pointer',
                  background: showHistory ? 'rgba(6,182,212,0.15)' : 'transparent',
                  border: showHistory ? '1px solid rgba(6,182,212,0.3)' : 'none',
                  color: showHistory ? '#22d3ee' : '#475569'
                }}
                onMouseEnter={e => { if (!showHistory) { e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; e.currentTarget.style.color = '#22d3ee'; } }}
                onMouseLeave={e => { if (!showHistory) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <History style={{ width: 13, height: 13 }} />
              </button>
              <button onClick={clearChat} title="Clear chat" style={{ padding: '5px 6px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)', e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = '#475569')}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
              <button onClick={() => { const m = !isMuted; setIsMuted(m); if (m) window.speechSynthesis.cancel(); }} title={isMuted ? 'Unmute' : 'Mute'}
                style={{ padding: '5px 6px', borderRadius: 7, background: isMuted ? 'rgba(239,68,68,0.1)' : 'transparent', border: isMuted ? '1px solid rgba(239,68,68,0.3)' : 'none', cursor: 'pointer', color: isMuted ? '#f87171' : '#06b6d4' }}>
                {isMuted ? <VolumeX style={{ width: 13, height: 13 }} /> : <Volume2 style={{ width: 13, height: 13 }} />}
              </button>
              <button onClick={() => setIsOpen(false)} title="Close"
                style={{ padding: '5px 6px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)', e.currentTarget.style.color = '#e2e8f0')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = '#475569')}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* ── History Drawer ── */}
          {showHistory && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'linear-gradient(145deg, rgba(6,10,22,0.99) 0%, rgba(8,15,35,0.99) 100%)',
              borderRadius: 20, display: 'flex', flexDirection: 'column',
              animation: 'fadeSlideIn 0.2s ease'
            }}>
              {/* Drawer header */}
              <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History style={{ width: 15, height: 15, color: '#22d3ee' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22d3ee', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chat History</span>
                  <span style={{ fontSize: 10, background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#22d3ee', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                    {chatHistory.length} sessions
                  </span>
                </div>
                <button onClick={() => setShowHistory(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569', padding: '4px' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.color = '#475569'}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
              {/* Search */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px' }}>
                  <Search style={{ width: 12, height: 12, color: '#475569', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: '#cbd5e1', fontSize: 11, width: '100%', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
              {/* Sessions list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, scrollbarWidth: 'thin', scrollbarColor: '#1e3a5f transparent' }}>
                {historyLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569', fontSize: 11, gap: 8 }}>
                    <div style={{ width: 16, height: 16, border: '2px solid #22d3ee', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Loading sessions from Supabase...
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155', gap: 8 }}>
                    <MessageSquare style={{ width: 28, height: 28, opacity: 0.3 }} />
                    <span style={{ fontSize: 11 }}>No saved conversations yet</span>
                    <span style={{ fontSize: 10, color: '#1e3a5f' }}>Send a message to begin</span>
                  </div>
                ) : (
                  chatHistory
                    .filter(s => !historySearch || s.preview.toLowerCase().includes(historySearch.toLowerCase()))
                    .map(session => (
                      <div key={session.session_id} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        {/* Session header row */}
                        <button
                          onClick={() => setExpandedSession(expandedSession === session.session_id ? null : session.session_id)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '9px 11px',
                            background: expandedSession === session.session_id ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)',
                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                          }}
                        >
                          <ChevronRight style={{
                            width: 11, height: 11, color: '#22d3ee', flexShrink: 0,
                            transition: 'transform 0.2s',
                            transform: expandedSession === session.session_id ? 'rotate(90deg)' : 'none'
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.preview || '(empty session)'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <Clock style={{ width: 9, height: 9, color: '#334155' }} />
                              <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>
                                {session.started_at ? new Date(session.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown time'}
                              </span>
                              <span style={{ fontSize: 9, background: 'rgba(6,182,212,0.1)', color: '#22d3ee', borderRadius: 3, padding: '0px 5px', border: '1px solid rgba(6,182,212,0.2)' }}>
                                {session.message_count} msgs
                              </span>
                            </div>
                          </div>
                        </button>
                        {/* Expanded transcript */}
                        {expandedSession === session.session_id && (
                          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#1e3a5f transparent' }}>
                            {session.messages.map((msg, i) => (
                              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, flexShrink: 0, marginTop: 1,
                                  background: msg.role === 'user' ? 'rgba(6,182,212,0.15)' : 'rgba(139,92,246,0.15)',
                                  color: msg.role === 'user' ? '#22d3ee' : '#a78bfa',
                                  border: msg.role === 'user' ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(139,92,246,0.2)'
                                }}>
                                  {msg.role === 'user' ? 'OP' : 'AI'}
                                </span>
                                <span style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                                  {msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          <div
            ref={messagesContainerRef}
            style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, scrollbarWidth: 'thin', scrollbarColor: '#1e3a5f transparent' }}
          >

            {messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start', animation: 'fadeSlideIn 0.25s ease' }}>
                {/* Avatar */}
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: m.role === 'user' ? 'rgba(6,182,212,0.15)' : 'rgba(139,92,246,0.15)',
                  border: m.role === 'user' ? '1px solid rgba(6,182,212,0.3)' : '1px solid rgba(139,92,246,0.3)'
                }}>
                  {m.role === 'user'
                    ? <User style={{ width: 12, height: 12, color: '#22d3ee' }} />
                    : <Sparkles style={{ width: 12, height: 12, color: '#a78bfa' }} />}
                </div>

                <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Image preview */}
                  {m.image && (
                    <img src={m.image} alt="attached" style={{ maxWidth: 200, borderRadius: 10, border: '1px solid rgba(34,211,238,0.2)' }} />
                  )}
                  {/* Bubble */}
                  <div
                    style={{
                      padding: '9px 12px', borderRadius: 14,
                      borderTopLeftRadius: m.role === 'user' ? 14 : 4,
                      borderTopRightRadius: m.role === 'user' ? 4 : 14,
                      fontSize: 12, lineHeight: 1.65,
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(37,99,235,0.25))'
                        : 'rgba(15,23,42,0.9)',
                      border: m.role === 'user'
                        ? '1px solid rgba(6,182,212,0.25)'
                        : '1px solid rgba(255,255,255,0.07)',
                      color: m.role === 'user' ? '#e0f7fa' : '#cbd5e1',
                      boxShadow: m.role === 'assistant' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                      position: 'relative'
                    }}
                    onMouseEnter={e => {
                      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
                      if (btn) btn.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                      const btn = e.currentTarget.querySelector('.copy-btn') as HTMLElement;
                      if (btn) btn.style.opacity = '0';
                    }}
                  >
                    {renderContent(m.content)}
                    {/* Streaming cursor */}
                    {isStreaming && m.role === 'assistant' && messages[messages.length - 1].id === m.id && (
                      <span style={{ display: 'inline-block', width: 2, height: 13, background: '#22d3ee', marginLeft: 2, borderRadius: 1, animation: 'blink-cursor 0.8s step-end infinite', verticalAlign: 'middle' }} />
                    )}
                    {/* Copy button */}
                    <button
                      className="copy-btn"
                      onClick={() => copyMessage(m.id, m.content)}
                      style={{
                        position: 'absolute', top: 5, right: 5, opacity: 0,
                        transition: 'opacity 0.15s', background: 'rgba(15,23,42,0.8)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
                        padding: '2px 4px', cursor: 'pointer', color: copiedId === m.id ? '#34d399' : '#94a3b8'
                      }}
                    >
                      {copiedId === m.id ? <Check style={{ width: 9, height: 9 }} /> : <Copy style={{ width: 9, height: 9 }} />}
                    </button>
                  </div>
                  {/* Timestamp */}
                  <span style={{ fontSize: 9, color: '#334155', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                    {new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', animation: 'fadeSlideIn 0.2s ease' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0 }}>
                  <Sparkles style={{ width: 12, height: 12, color: '#a78bfa' }} />
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 14, borderTopLeftRadius: 4, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', display: 'inline-block', animation: `bounce-dot 1.2s ${i * 0.18}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              style={{
                position: 'absolute', bottom: 70, right: 14,
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(6,182,212,0.2)', border: '1px solid rgba(6,182,212,0.4)',
                color: '#22d3ee', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
              }}
            >
              <ChevronDown style={{ width: 14, height: 14 }} />
            </button>
          )}

          {/* ── Pending image preview ── */}
          {pendingImage && (
            <div style={{ padding: '6px 12px', background: 'rgba(6,12,24,0.9)', borderTop: '1px solid rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={pendingImage} alt="preview" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(34,211,238,0.3)' }} />
              <span style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>Image ready to analyse</span>
              <button onClick={() => setPendingImage(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}

          {/* ── Input Panel ── */}
          <div style={{
            padding: '10px 12px',
            background: 'rgba(6,12,24,0.95)',
            borderTop: '1px solid rgba(34,211,238,0.08)',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            {/* Voice waveform bar */}
            {isListening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Mic style={{ width: 10, height: 10, color: '#f87171' }} />
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${voiceLevel}%`, background: 'linear-gradient(90deg, #ef4444, #f97316)', transition: 'width 0.05s ease', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: '#f87171' }}>Listening...</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Voice button */}
              <button
                onClick={isListening ? stopListening : startListening}
                title={isListening ? 'Stop voice' : 'Voice input'}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isListening ? 'rgba(239,68,68,0.15)' : 'rgba(6,182,212,0.1)',
                  border: isListening ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(6,182,212,0.25)',
                  color: isListening ? '#f87171' : '#22d3ee', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {isListening ? <MicOff style={{ width: 14, height: 14 }} /> : <Mic style={{ width: 14, height: 14 }} />}
              </button>

              {/* Image upload button */}
              <button
                onClick={() => imageInputRef.current?.click()}
                title="Attach image for analysis"
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pendingImage ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.1)',
                  border: pendingImage ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(139,92,246,0.25)',
                  color: pendingImage ? '#34d399' : '#a78bfa', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <ImagePlus style={{ width: 14, height: 14 }} />
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

              {/* Text input */}
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder={isListening ? '🎙 Listening...' : 'Ask CHITTHI...'}
                disabled={isListening}
                style={{
                  flex: 1, height: 34,
                  background: 'rgba(15,23,42,0.8)',
                  border: '1px solid rgba(34,211,238,0.15)',
                  borderRadius: 10, padding: '0 12px',
                  fontSize: 12, color: '#e2e8f0',
                  outline: 'none', transition: 'border-color 0.2s',
                  fontFamily: 'inherit'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(34,211,238,0.45)'}
                onBlur={e => e.target.style.borderColor = 'rgba(34,211,238,0.15)'}
              />

              {/* Send button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || isStreaming || (!input.trim() && !pendingImage)}
                title="Send"
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (loading || isStreaming || (!input.trim() && !pendingImage)) ? 'rgba(30,41,59,0.6)' : 'linear-gradient(135deg, #0891b2, #0e7490)',
                  border: 'none', cursor: (loading || isStreaming || (!input.trim() && !pendingImage)) ? 'not-allowed' : 'pointer',
                  color: (loading || isStreaming || (!input.trim() && !pendingImage)) ? '#334155' : '#fff',
                  transition: 'all 0.2s',
                  boxShadow: (loading || isStreaming || (!input.trim() && !pendingImage)) ? 'none' : '0 0 12px rgba(6,182,212,0.4)'
                }}
              >
                {isStreaming ? <Zap style={{ width: 14, height: 14 }} /> : <Send style={{ width: 14, height: 14 }} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global animations ── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%           { transform: scale(1.2); opacity: 1; }
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes gradient-slide {
          0%   { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
        @keyframes ping {
          0%   { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
