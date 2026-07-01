import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Mic, MicOff, Volume2, VolumeX, Send, X, Bot, User, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const cleanContent = (text: string) => {
  return text.replace(/\[ACTION:[\s\S]*?\]/g, '').trim();
};

const isOfflineMode = () => {
  return (
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('github.io') ||
    (window as any).__isOffline ||
    localStorage.getItem('offline_mode') === 'true'
  );
};

function generateChittiResponse(query: string, history: any[], telemetry: Record<string, any>): string {
  const qLower = query.toLowerCase();
  
  // Find mentioned router
  let routerId = '';
  for (const rid of Object.keys(telemetry)) {
    const name = telemetry[rid].router_name ? telemetry[rid].router_name.toLowerCase() : '';
    if (
      qLower.includes(rid.toLowerCase()) || 
      qLower.includes(name) || 
      (rid === 'SDSC-SHAR' && qLower.includes('sriharikota')) || 
      (rid === 'ISTRAC-BGL' && qLower.includes('bangalore')) || 
      (rid === 'MCF-HSN' && qLower.includes('hassan')) || 
      (rid === 'NOC-DEL' && qLower.includes('delhi')) || 
      (rid === 'NOC-MUM' && qLower.includes('mumbai')) || 
      (rid === 'TRACK-PBL' && qLower.includes('port blair'))
    ) {
      routerId = rid;
      break;
    }
  }

  // If no specific router mentioned, find any failing one
  if (!routerId) {
    for (const rid of Object.keys(telemetry)) {
      if (telemetry[rid].failure_label > 0 || telemetry[rid].link_status === 0) {
        routerId = rid;
        break;
      }
    }
  }

  // Handle Action Trigger check
  let actionTag = '';
  const isMitigateRequest = /\b(fix|mitigate|heal|restore|resolve|do it)\b/.test(qLower);
  const isDiagnoseRequest = /\b(ping|tracert|trace|diagnose|reachability|check)\b/.test(qLower);

  if (isMitigateRequest) {
    const targetId = routerId || 'NOC-DEL'; // fallback
    actionTag = ` [ACTION: mitigate, router_id: ${targetId}]`;
  } else if (isDiagnoseRequest) {
    const targetHost = routerId || '127.0.0.1';
    const cmd = qLower.includes('trace') || qLower.includes('tracert') ? 'tracert' : 'ping';
    actionTag = ` [ACTION: diagnose, host: ${targetHost}, command: ${cmd}]`;
  }

  // SOP text matching
  let responseText = '';
  const routerData = routerId ? telemetry[routerId] : null;

  if (isMitigateRequest && routerId && routerData) {
    const name = routerData.router_name;
    const label = routerData.failure_label;
    const isDown = routerData.link_status === 0;

    if (isDown || label === 3) {
      responseText = `Executing backup route policy on flapping SD-WAN interface for ${name}. Shutting down primary GigabitEthernet0/1 and activating secondary GigabitEthernet0/2 interface to stabilize OSPF flapping.`;
    } else if (label === 1) {
      responseText = `Applying Cisco QoS shaping policy ISRO-QOS-SHAPING to throttle non-critical class traffic to 10Mbps maximum on congested interface of ${name}. This will prioritize critical telemetry data streams.`;
    } else if (label === 2) {
      responseText = `Running diagnostic daemon reset commands on CPU-overloaded ${name}. Executing memory table flushing command 'clear ip route *' and installing threshold monitors.`;
    } else {
      responseText = `Initiating standard circuit diagnostics and interface checks on nominal node ${name}. Link status is normal.`;
    }
    responseText += ` Executing script now.${actionTag} Dot.`;
    return responseText;
  }

  if (isDiagnoseRequest) {
    const hostName = routerData ? routerData.router_name : 'the gateway node';
    responseText = `Initiating NOC diagnostics for ${hostName}. Spawning traceroute and ping probes to assess network latency and packet delivery. Terminal reports normal physical carrier metrics. Check action log output window.${actionTag} Dot.`;
    return responseText;
  }

  // General Questions / Telemetry Queries
  if (routerId && routerData) {
    const name = routerData.router_name;
    const status = routerData.link_status === 1 ? 'ACTIVE/UP' : 'OFFLINE/DOWN';
    const label = routerData.failure_label;
    const latency = routerData.latency;
    const cpu = routerData.cpu;
    const loss = routerData.packet_loss;

    let diagnosis = `Operating nominal at ${latency}ms latency with zero loss.`;
    if (label === 1) {
      diagnosis = `Alert! Heavy traffic utilization of ${routerData.bandwidth}% is causing MPLS underlay queue congestion. Enforce shaping rule SOP-NET-01.`;
    } else if (label === 2) {
      diagnosis = `Warning! Device CPU is critically high at ${cpu}%, indicating a routing daemon memory leak. Executing routing table clear as per Delhi NOC memory leak SOP.`;
    } else if (label === 3 || routerData.link_status === 0) {
      diagnosis = `Critical! Tunnel interface is flapping with ${loss}% packet loss. Secondary link reroute required via OSPF convergence.`;
    }

    responseText = `I have scanned node ${name} (${routerId}). Operational status is ${status}. Telemetry data shows CPU: ${cpu}%, Latency: ${latency}ms. Diagnostic: ${diagnosis} Dot.`;
    return responseText;
  }

  // SOP details search
  if (qLower.includes('qos') || qLower.includes('shape') || qLower.includes('congestion') || qLower.includes('sop-net-01')) {
    responseText = `According to ISRO MPLS QoS Policy SOP-NET-01, critical tracking telemetry must be mapped to DSCP EF class. In case of congestion, shape non-critical bandwidth to 10Mbps via 'service-policy output ISRO-QOS-SHAPING'. Dot.`;
  } else if (qLower.includes('flapping') || qLower.includes('tunnel') || qLower.includes('flap') || qLower.includes('instability')) {
    responseText = `For SD-WAN routing and link flapping, verify MTU size is 1500 (or 1400 on tunnels) and shut down the unstable primary interface: 'interface GigabitEthernet0/1; shutdown' and 'interface GigabitEthernet0/2; no shutdown'. Dot.`;
  } else if (qLower.includes('leak') || qLower.includes('cpu') || qLower.includes('memory') || qLower.includes('delhi')) {
    responseText = `In the event of a routing daemon crash or memory exhaustion (e.g. NOC-DEL leak), clear the routing tables with 'clear ip route *' and set process CPU thresholds to 80% rising. Dot.`;
  } else if (qLower.includes('ospf') || qLower.includes('neighbor') || qLower.includes('adjacency')) {
    responseText = `To diagnose OSPF instability or OSPF Hello interval mismatch, run OSPF events debug: 'debug ip ospf event' and analyze 'show ip ospf neighbor' command output. Dot.`;
  } else if (qLower.includes('topology') || qLower.includes('mesh') || qLower.includes('latencies')) {
    responseText = `The ISRO mesh topology connects Bangalore, Sriharikota, Hassan, Delhi, Mumbai, and Port Blair. Latency threshold Bangalore-Sriharikota is 25ms, jitter below 5ms. Dot.`;
  } else if (qLower.includes('cartosat') || qLower.includes('gsat') || qLower.includes('satellite') || qLower.includes('solar') || qLower.includes('flare')) {
    responseText = `Live orbital tracking telemetry confirms the Space Segments transponders are active. Solar flare prediction risk scores are dynamically updated by the ML forecasting deck. Dot.`;
  } else {
    responseText = `System Status: Nominal. I am monitoring the ISRO MPLS mesh. All telemetry channels are operating at optimal speeds. Ask me about specific node metrics or ask me to perform mitigations. Dot.`;
  }

  return responseText;
}

const renderMessageContent = (content: string) => {
  const cleaned = cleanContent(content);
  const parts = cleaned.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, idx) => {
    if (part.startsWith('```')) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const code = match ? match[2] : part.slice(3, -3);
      return (
        <pre key={idx} className="bg-slate-950 p-2.5 rounded-lg my-2 font-mono text-[10px] text-cyan-400 border border-slate-800/80 overflow-x-auto select-text">
          <code>{code.trim()}</code>
        </pre>
      );
    }
    
    const subparts = part.split(/(\[System[\s\S]*?\])/g);
    return subparts.map((subpart, sIdx) => {
      if (subpart.startsWith('[System')) {
        const cleanSub = subpart.slice(1, -1);
        const isDiag = cleanSub.includes('Diagnostic Output:');
        const contentVal = isDiag 
          ? cleanSub.replace('Diagnostic Output:', '').trim()
          : cleanSub.replace('System:', '').trim();
          
        return (
          <div key={`${idx}-${sIdx}`} className="bg-slate-950/90 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-lg my-2 font-mono text-[10px] flex flex-col gap-1 shadow-inner select-text">
            <span className="text-[8px] uppercase tracking-wider text-emerald-500 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              NOC Agent Terminal Action
            </span>
            <span className="whitespace-pre-wrap">{contentVal}</span>
          </div>
        );
      }
      return <span key={`${idx}-${sIdx}`} className="whitespace-pre-wrap">{subpart}</span>;
    });
  });
};

export const Chatbot1: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello, I am Chitti the Robot, Version 2.0. Speed: 1 Terahertz. Memory: 1 Zettabyte. Ask me any question regarding the ISRO NOC. Dot.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Draggable state
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 450 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Adjust position if window is resized
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(window.innerWidth - 80, prev.x),
        y: Math.min(window.innerHeight - 80, prev.y)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSendMessage(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        window.speechSynthesis.cancel();
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    } else {
      alert('Speech recognition is not supported in this browser.');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const speakText = (text: string) => {
    if (isMuted) return;
    try {
      window.speechSynthesis.cancel();
      
      let chittiText = text;
      // Append a terminal "Dot" if not present to mimic Chitti's robot cadence
      if (chittiText && !chittiText.endsWith('Dot.') && !chittiText.endsWith('Dot')) {
        chittiText = `${chittiText} Dot.`;
      }
      
      const utterance = new SpeechSynthesisUtterance(chittiText);
      const voices = window.speechSynthesis.getVoices();
      
      // Select best available male/robotic voice
      let chittiVoice = voices.find(v => v.lang.includes('en-IN') && v.name.toLowerCase().includes('male'));
      if (!chittiVoice) {
        chittiVoice = voices.find(v => v.lang.includes('en-IN'));
      }
      if (!chittiVoice) {
        chittiVoice = voices.find(v => v.name.toLowerCase().includes('google uk english male') || v.name.toLowerCase().includes('google us english male'));
      }
      if (!chittiVoice) {
        chittiVoice = voices.find(v => v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('male'));
      }
      if (!chittiVoice) {
        chittiVoice = voices.find(v => v.lang.startsWith('en'));
      }
      
      if (chittiVoice) {
        utterance.voice = chittiVoice;
      }
      
      // Apply Chitti's deep, fast robot voice characteristics
      utterance.pitch = 0.85; // Deeper register
      utterance.rate = 1.12;  // Quick, robotic delivery
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis failed', e);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setHasDragged(false);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setHasDragged(false);
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    posStart.current = { x: position.x, y: position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        setHasDragged(true);
      }
      
      const newX = Math.max(10, Math.min(window.innerWidth - 60, posStart.current.x + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, posStart.current.y + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        setHasDragged(true);
      }

      const newX = Math.max(10, Math.min(window.innerWidth - 60, posStart.current.x + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, posStart.current.y + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  async function handleSendMessage(textToSend?: string) {
    const queryText = (textToSend || input).trim();
    if (!queryText) return;

    if (!textToSend) {
      setInput('');
    }

    const newMessages = [...messages, { role: 'user', content: queryText } as ChatMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const formattedHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      if (isOfflineMode()) {
        const rawTelemetry = (window as any).__liveTelemetry;
        const telemetry: Record<string, any> = {};
        if (rawTelemetry) {
          Object.keys(rawTelemetry).forEach(rid => {
            const val = rawTelemetry[rid];
            if (val && val.telemetry) {
              telemetry[rid] = val.telemetry;
            } else {
              telemetry[rid] = val;
            }
          });
        } else {
          const BASELINES: Record<string, any> = {
            'ISTRAC-BGL': { latency: 15, cpu: 35, bandwidth: 50 },
            'SDSC-SHAR': { latency: 25, cpu: 45, bandwidth: 80 },
            'MCF-HSN': { latency: 20, cpu: 30, bandwidth: 40 },
            'NOC-DEL': { latency: 30, cpu: 55, bandwidth: 60 },
            'NOC-MUM': { latency: 28, cpu: 50, bandwidth: 70 },
            'TRACK-PBL': { latency: 45, cpu: 25, bandwidth: 30 }
          };
          const STATIC_ROUTERS = [
            { id: 'ISTRAC-BGL', name: 'ISTRAC Bangalore', ip_address: '10.101.10.1', site_type: 'Master Control' },
            { id: 'SDSC-SHAR', name: 'SDSC Sriharikota', ip_address: '10.101.20.1', site_type: 'Launch Site' },
            { id: 'MCF-HSN', name: 'MCF Hassan', ip_address: '10.101.30.1', site_type: 'Satellite Control' },
            { id: 'NOC-DEL', name: 'NOC Delhi', ip_address: '10.101.40.1', site_type: 'NOC Gateway' },
            { id: 'NOC-MUM', name: 'NOC Mumbai', ip_address: '10.101.50.1', site_type: 'NOC Gateway' },
            { id: 'TRACK-PBL', name: 'TRACK Port Blair', ip_address: '10.101.60.1', site_type: 'Downrange Station' }
          ];
          STATIC_ROUTERS.forEach(r => {
            const baseline = BASELINES[r.id];
            telemetry[r.id] = {
              router_id: r.id,
              router_name: r.name,
              latency: baseline.latency,
              packet_loss: 0.0,
              jitter: 1.5,
              bandwidth: baseline.bandwidth,
              cpu: baseline.cpu,
              memory: baseline.cpu + 5,
              link_status: 1,
              failure_label: 0,
              ip_address: r.ip_address,
              site_type: r.site_type
            };
          });
        }

        const responseText = generateChittiResponse(queryText, formattedHistory, telemetry);
        
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        setLoading(false);
        
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: responseText
            };
          }
          return updated;
        });

        const voiceText = responseText
          .replace(/\[ACTION:[\s\S]*?\]/g, '')
          .replace(/\[System[\s\S]*?\]/g, '')
          .trim();
        speakText(voiceText);
        return;
      }

      const res = await fetch('/api/chatbot1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: queryText,
          history: formattedHistory
        })
      });

      if (!res.ok) {
        throw new Error('Chatbot response error');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      // Append an empty assistant message first and hide loader
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      setLoading(false);

      let accumulatedAnswer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedAnswer += chunk;
        
        // Update the last assistant message
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: accumulatedAnswer
            };
          }
          return updated;
        });
      }

      // Strip action tags and system diagnostic messages for voice audio feedback
      const voiceText = accumulatedAnswer
        .replace(/\[ACTION:[\s\S]*?\]/g, '')
        .replace(/\[System[\s\S]*?\]/g, '')
        .trim();
      speakText(voiceText);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I had trouble reaching Chitthi server." }]);
    } finally {
      setLoading(false);
    }
  };

  // Determine alignment of chat window based on drag position
  const isLeftHalf = position.x < window.innerWidth / 2;
  const isTopHalf = position.y < window.innerHeight / 2;

  return (
    <div 
      style={{ 
        position: 'fixed', 
        left: `${position.x}px`, 
        top: `${position.y}px`, 
        zIndex: 99999,
        touchAction: 'none'
      }}
      className="font-sans"
    >
      {/* Floating launcher button */}
      {!isOpen && (
        <button
          ref={buttonRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onClick={() => {
            if (!hasDragged) {
              setIsOpen(true);
            }
          }}
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.5)',
            border: '2px solid rgba(34, 211, 238, 0.6)'
          }}
          className="bg-slate-900 text-cyan-400 hover:text-cyan-300 transition-transform duration-200 hover:scale-105"
          title="Drag me! Click to open Chitthi"
        >
          <MessageSquare style={{ width: '20px', height: '20px' }} className="animate-pulse" />
          <span style={{ position: 'absolute', top: '2px', right: '2px', width: '10px', height: '10px', borderRadius: '50%' }} className="bg-emerald-500 border border-slate-900" />
        </button>
      )}

      {/* Glassmorphic Chat Window */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            // Position chat panel relative to launcher button coordinates to stay inside window bounds
            right: isLeftHalf ? 'auto' : '10px',
            left: isLeftHalf ? '10px' : 'auto',
            top: isTopHalf ? '10px' : 'auto',
            bottom: isTopHalf ? 'auto' : '10px',
          }}
          className="w-[360px] h-[480px] bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        >
          {/* Header (Draggable too!) */}
          <div 
            className="p-4 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between cursor-move select-none"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            title="Drag Chitthi panel"
          >
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="font-bold text-sm tracking-wider uppercase text-cyan-400">Chitthi</h3>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Voice Enabled
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const muted = !isMuted;
                  setIsMuted(muted);
                  if (muted) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className={`p-1.5 rounded-md transition-colors ${isMuted ? 'text-slate-500 hover:bg-slate-800' : 'text-cyan-400 hover:bg-slate-800'}`}
                title={isMuted ? 'Unmute voice response' : 'Mute voice response'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div className={`p-1 rounded-full h-fit mt-1 flex items-center justify-center ${m.role === 'user' ? 'bg-cyan-900/40 text-cyan-300' : 'bg-slate-800 text-slate-300'}`}>
                  {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-cyan-600/80 to-blue-600/80 text-white rounded-tr-none'
                      : 'bg-slate-800/80 border border-slate-700/30 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {renderMessageContent(m.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 max-w-[85%] mr-auto">
                <div className="p-1 rounded-full bg-slate-800 text-slate-300 h-fit mt-1">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="p-3 bg-slate-800/80 border border-slate-700/30 text-slate-400 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Panel */}
          <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-2">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-2 rounded-xl transition-all duration-300 ${
                isListening
                  ? 'bg-red-500/20 text-red-400 border border-red-500/45 animate-pulse'
                  : 'bg-slate-800 text-cyan-400 hover:bg-slate-700 border border-slate-700/50'
              }`}
              title={isListening ? 'Stop listening' : 'Start speaking (voice input)'}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Ask Chitthi...'}
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder-slate-500"
              disabled={isListening}
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white p-2 rounded-xl transition-colors flex items-center justify-center disabled:text-slate-500 border border-cyan-400/20"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
