import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Sliders, 
  Terminal, 
  Play, 
  RefreshCw, 
  Sparkles, 
  Save, 
  FileText
} from "lucide-react";

interface PlaybookStep {
  cmd: string;
  expectedOutput: string[];
  durationMs: number;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: PlaybookStep[];
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "bgp-reroute",
    name: "BGP Route Optimization Playbook",
    description: "Clears BGP table flaps, audits path costs, and reroutes around high-latency congestion hops.",
    steps: [
      { cmd: "show ip bgp summary", expectedOutput: ["BGP router identifier 10.0.0.1, local AS number 65001", "Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd", "192.168.10.2    4 65001   12048   12044       43    0    0 04:12:30 14", "192.168.20.2    4 65002   48529   48528       43    0    0 00:00:12 Active (OSCILLATING)"], durationMs: 1200 },
      { cmd: "traceroute ip 192.168.20.2", expectedOutput: ["Tracing route to 192.168.20.2...", "1  10.10.1.1 (NOC-CORE-GATEWAY) 1.2 ms", "2  172.16.4.5 (TRANSIT-CENTRAL) 84.8 ms (HIGH LATENCY / JITTER DETECTED)", "3  192.168.20.2 (DESTINATION) 88.5 ms"], durationMs: 1500 },
      { cmd: "configure terminal", expectedOutput: ["Enter configuration commands, one per line. End with CNTL/Z."], durationMs: 800 },
      { cmd: "router bgp 65001\n neighbor 192.168.10.2 route-map PREFER-PRIMARY in\n neighbor 192.168.20.2 route-map DEGRADE-BACKUP in\nexit", expectedOutput: ["% BGP-5-ADJCHANGE: neighbor 192.168.20.2 Down - Route map updated", "% BGP-5-ADJCHANGE: neighbor 192.168.20.2 Up - Established"], durationMs: 1800 },
      { cmd: "clear ip bgp * soft in", expectedOutput: ["Refreshing inbound BGP routing policies...", "BGP route selection recalculation complete."], durationMs: 1000 },
      { cmd: "show ip route bgp", expectedOutput: ["Gateway of last resort is not set", "B*   0.0.0.0/0 [20/0] via 192.168.10.2, 00:00:04", "B    192.168.20.0/24 [200/50] via 192.168.10.2, 00:00:04 (PATH REDIRECT SUCCESS)"], durationMs: 1200 }
    ]
  },
  {
    id: "port-resync",
    name: "Port Administrative Resync Playbook",
    description: "Forces port negotiation resets and switches interfaces on flapping ground segments.",
    steps: [
      { cmd: "show interfaces status", expectedOutput: ["Port      Name               Status       Vlan       Duplex  Speed Type", "Gi0/1     Primary-Uplink     err-disabled 100        auto    auto  10/100/1000BaseTX", "Gi0/2     Backup-Uplink      connected    100        full    1000  10/100/1000BaseTX"], durationMs: 1000 },
      { cmd: "configure terminal", expectedOutput: ["Enter configuration commands, one per line. End with CNTL/Z."], durationMs: 600 },
      { cmd: "interface GigabitEthernet0/1\n shutdown", expectedOutput: ["%LINK-5-CHANGED: Interface GigabitEthernet0/1, changed state to administratively down", "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down"], durationMs: 1400 },
      { cmd: "interface GigabitEthernet0/1\n no shutdown", expectedOutput: ["%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up", "Negotiating link parameters...", "%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to up (LINK STABILIZED)"], durationMs: 1800 },
      { cmd: "show controller optics GigabitEthernet0/1", expectedOutput: ["Optical transceiver status:", "  Tx Power: -4.2 dBm (Nominal)", "  Rx Power: -5.8 dBm (Nominal)", "  Laser Bias: 24.1 mA (Stable)"], durationMs: 1200 }
    ]
  },
  {
    id: "qos-shaping",
    name: "QoS Telemetry Rate-Shaping Playbook",
    description: "Applies priority queues to telemetry downlink paths and rate-limits low-priority payloads.",
    steps: [
      { cmd: "show policy-map interface GigabitEthernet0/1", expectedOutput: ["Interface GigabitEthernet0/1", "  Service-policy output: ISRO-DEFAULT", "    Class-map: class-default (match any) 14083500 bytes", "      Queue depth 148 packets (CONGESTION DETECTED)"], durationMs: 1200 },
      { cmd: "configure terminal", expectedOutput: ["Enter configuration commands, one per line. End with CNTL/Z."], durationMs: 600 },
      { cmd: "class-map match-any TELEMETRY-CLASS\n match ip precedence 5\n match dscp ef\nexit", expectedOutput: ["Class-map 'TELEMETRY-CLASS' created."], durationMs: 1000 },
      { cmd: "policy-map ISRO-QOS-SHAPING\n class class-default\n  police 10000000 conform-action transmit exceed-action drop\n class TELEMETRY-CLASS\n  priority level 1\nexit", expectedOutput: ["Policy-map 'ISRO-QOS-SHAPING' updated. Telemetry-Class priority level set to 1.", "Class-default rate-limited to 10Mbps maximum."], durationMs: 1600 },
      { cmd: "interface GigabitEthernet0/1\n service-policy output ISRO-QOS-SHAPING\nexit", expectedOutput: ["%QOS-6-POLICY_APPLIED: Policy-map ISRO-QOS-SHAPING applied successfully to GigabitEthernet0/1."], durationMs: 1400 },
      { cmd: "show policy-map interface GigabitEthernet0/1", expectedOutput: ["Interface GigabitEthernet0/1", "  Service-policy output: ISRO-QOS-SHAPING", "    Class-map: TELEMETRY-CLASS (match precedence 5) 459300 bytes", "      Output Queue: Conversation 265, priority (EF conform transmit)", "    Class-map: class-default (match any) 124021 bytes (POLICED / SHAPED)"], durationMs: 1300 }
    ]
  }
];

interface PlaybookExecutorProps {
  telemetryData: Record<string, { telemetry: { router_id: string; router_name: string; latency: number; cpu: number }; analysis: { failure_risk: number } }>;
  onMitigate: (routerId: string) => Promise<void>;
}

interface SupabaseMitigationLog {
  id: string;
  created_at: string;
  router_id: string;
  router_name: string;
  status: string;
  action_taken: string;
}

export const PlaybookExecutor: React.FC<PlaybookExecutorProps> = ({
  telemetryData,
  onMitigate,
}) => {
  const [selectedRouter, setSelectedRouter] = useState<string>("NOC-MUM");
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("bgp-reroute");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [completed, setCompleted] = useState<boolean>(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'execute' | 'design' | 'history'>('execute');
  const isDesignerMode = activeTab === 'design';

  // Feature 14 Playbook Run History States
  const [mitigationLogs, setMitigationLogs] = useState<SupabaseMitigationLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState<boolean>(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<SupabaseMitigationLog | null>(null);

  // Feature 10 designer states
  const [customPlaybooks, setCustomPlaybooks] = useState<Playbook[]>([]);
  const [designerPlaybook, setDesignerPlaybook] = useState<Playbook>({
    id: "",
    name: "",
    description: "",
    steps: [{ cmd: "", expectedOutput: [""], durationMs: 1000 }]
  });
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [dbError, setDbError] = useState<boolean>(false);

  const routers = useMemo(() => {
    return Object.keys(telemetryData);
  }, [telemetryData]);

  // Load custom playbooks from Supabase (mappings for 'title' column)
  const fetchCustomPlaybooks = async () => {
    const localSavedStr = localStorage.getItem("isro_custom_playbooks");
    let localSaved: Playbook[] = [];
    if (localSavedStr) {
      try {
        localSaved = JSON.parse(localSavedStr);
      } catch (e) {
        console.error("Failed to parse local playbooks:", e);
      }
    }

    try {
      const url = "https://jfagvkjsagdjrtxljnga.supabase.co/rest/v1/custom_playbooks";
      const headers = {
        "apikey": "sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Authorization": "Bearer sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y"
      };
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        // Map Database column 'title' to Frontend state field 'name'
        const mapped = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          name: (row.title || row.name || "Custom Playbook") as string,
          description: (row.description || "") as string,
          steps: (row.steps || []) as PlaybookStep[]
        }));
        
        // Merge Supabase and local storage playbooks
        const merged = [...mapped];
        localSaved.forEach(localP => {
          if (!merged.some(m => m.id === localP.id)) {
            merged.push(localP);
          }
        });
        setTimeout(() => {
          setCustomPlaybooks(merged);
          setDbError(false);
        }, 0);
      } else {
        setTimeout(() => {
          setCustomPlaybooks(localSaved);
          if (res.status === 404) {
            setDbError(true);
          }
        }, 0);
      }
    } catch (err) {
      console.warn("[Playbooks] Supabase fetch warning: custom_playbooks table may not exist, loading offline storage.", err);
      setTimeout(() => {
        setCustomPlaybooks(localSaved);
        setDbError(true);
      }, 0);
    }
  };

  const fetchMitigationLogs = async () => {
    try {
      setTimeout(() => setIsLogsLoading(true), 0);
      const url = "https://jfagvkjsagdjrtxljnga.supabase.co/rest/v1/mitigation_logs?order=created_at.desc&limit=15";
      const headers = {
        "apikey": "sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Authorization": "Bearer sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y"
      };
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setTimeout(() => setMitigationLogs(data), 0);
      }
    } catch (err) {
      console.error("Failed to fetch mitigation logs from Supabase:", err);
    } finally {
      setTimeout(() => setIsLogsLoading(false), 0);
    }
  };

  useEffect(() => {
    fetchCustomPlaybooks();
    fetchMitigationLogs();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchMitigationLogs();
    }
  }, [activeTab]);

  const allPlaybooks = useMemo(() => {
    return [...PLAYBOOKS, ...customPlaybooks];
  }, [customPlaybooks]);

  const playbook = useMemo(() => {
    return allPlaybooks.find(p => p.id === selectedPlaybook) || allPlaybooks[0];
  }, [selectedPlaybook, allPlaybooks]);

  useEffect(() => {
    // Scroll terminal to bottom
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  const logPlaybookExecutionToSupabase = async (routerId: string, playbookName: string, consoleLogsArray: string[]) => {
    try {
      const url = "https://jfagvkjsagdjrtxljnga.supabase.co/rest/v1/mitigation_logs";
      const headers = {
        "apikey": "sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Authorization": "Bearer sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Content-Type": "application/json"
      };
      
      const routerName = telemetryData[routerId]?.telemetry.router_name || routerId;
      const logSummary = consoleLogsArray.join("\n");

      const payload = {
        router_id: routerId,
        router_name: routerName,
        status: "resolved",
        action_taken: `Executed Playbook "${playbookName}". Summary:\n${logSummary}`
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.error("Failed to write playbook mitigation log:", await res.text());
      }
    } catch (err) {
      console.error("Failed to sync playbook mitigation log to Supabase:", err);
    }
  };

  // Execute Playbook Engine
  const startExecution = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCompleted(false);
    setCurrentStepIndex(0);
    
    const initialLogs = [
      `[LOG] ${new Date().toISOString()} - Initializing Playbook Session...`,
      `[LOG] Target Ground Station Node: ${selectedRouter} (${telemetryData[selectedRouter]?.telemetry.router_name || selectedRouter})`,
      `[LOG] Selected Strategy: ${playbook.name}`,
      `[LOG] Establishing encrypted SSH tunnel session to router...`,
      `[SSH] Connection established successfully. Starting terminal shell.\n`
    ];
    setConsoleLogs(initialLogs);

    let runLogs = [...initialLogs];
    let stepIdx = 0;
    
    const runNextStep = () => {
      if (stepIdx >= playbook.steps.length) {
        // Complete execution
        setTimeout(async () => {
          const completionLogs = [
            `\n[LOG] Playbook sequence executed successfully. All parameters within bounds.`,
            `[LOG] Sending commit signal... Configuration updated.`,
            `[LOG] Closing terminal session. Closed SSH tunnel.`
          ];
          setConsoleLogs(prev => [
            ...prev,
            ...completionLogs
          ]);
          runLogs = [...runLogs, ...completionLogs];
          
          setCompleted(true);
          setIsRunning(false);
          setCurrentStepIndex(-1);

          // Apply mitigation logic (resolves alerts/risks)
          try {
            await onMitigate(selectedRouter);
          } catch (e) {
            console.error("Mitigation callback failed", e);
          }

          // Async log to Supabase mitigation_logs
          await logPlaybookExecutionToSupabase(selectedRouter, playbook.name, runLogs);
          fetchMitigationLogs();
        }, 1000);
        return;
      }

      const step = playbook.steps[stepIdx];
      setCurrentStepIndex(stepIdx);

      // Print command prompt
      const promptLog = `isro-router-${selectedRouter.toLowerCase()}# ${step.cmd}`;
      setConsoleLogs(prev => [
        ...prev,
        promptLog
      ]);
      runLogs.push(promptLog);

      // Delay output
      setTimeout(() => {
        setConsoleLogs(prev => [
          ...prev,
          ...step.expectedOutput,
          "" // blank line
        ]);
        runLogs = [...runLogs, ...step.expectedOutput, ""];
        stepIdx++;
        runNextStep();
      }, step.durationMs);
    };

    setTimeout(() => {
      runNextStep();
    }, 1200);
  };

  // Save Playbook to Supabase REST endpoint (with schema-mapped 'title' and integer 'id')
  const handleSavePlaybook = async () => {
    if (!designerPlaybook.name.trim()) return;
    setSaveStatus("Saving...");
    
    // Generate a valid integer/bigint id for database PK
    const numericId = isNaN(Number(designerPlaybook.id)) || !designerPlaybook.id
      ? Date.now()
      : Number(designerPlaybook.id);
      
    const payload = {
      id: numericId,
      title: designerPlaybook.name, // Maps name to title
      description: designerPlaybook.description,
      steps: designerPlaybook.steps
    };
    
    // Save to local storage first
    try {
      const localSavedStr = localStorage.getItem("isro_custom_playbooks");
      let localSaved: Playbook[] = [];
      if (localSavedStr) {
        localSaved = JSON.parse(localSavedStr);
      }
      
      const newPlaybook = {
        id: String(numericId),
        name: designerPlaybook.name,
        description: designerPlaybook.description,
        steps: designerPlaybook.steps
      };
      
      const existingIdx = localSaved.findIndex(p => p.id === String(numericId));
      if (existingIdx >= 0) {
        localSaved[existingIdx] = newPlaybook;
      } else {
        localSaved.push(newPlaybook);
      }
      localStorage.setItem("isro_custom_playbooks", JSON.stringify(localSaved));
      setSaveStatus("Saved locally!");
    } catch (e) {
      console.error("Local save failed:", e);
    }
    
    try {
      const url = "https://jfagvkjsagdjrtxljnga.supabase.co/rest/v1/custom_playbooks";
      const headers = {
        "apikey": "sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Authorization": "Bearer sb_publishable_i28U3zuTkb4w5yfiC6PEOQ_DhgKH21Y",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSaveStatus("Saved successfully to database!");
        setDesignerPlaybook(prev => ({ ...prev, id: String(numericId) }));
        await fetchCustomPlaybooks();
        setTimeout(() => setSaveStatus(""), 3500);
      } else {
        const err = await res.text();
        console.error("Save failed:", err);
        setSaveStatus("Saved locally (DB Offline / Schema mismatch)");
      }
    } catch (err) {
      console.error("Supabase write exception:", err);
      setSaveStatus("Saved locally (DB Connection error)");
    }
  };

  // AI-Assisted Playbook Auto-Generation using Gemini
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    try {
      const promptText = `Generate a troubleshooting playbook for network operators. Topic: "${aiPrompt}". Respond ONLY with a valid JSON object matching this schema, no extra text:
      {
        "name": "Brief Title",
        "description": "Short explanation",
        "steps": [
          { "cmd": "Cisco CLI Command", "expectedOutput": ["Output line 1", "Output line 2"], "durationMs": 1000 }
        ]
      }`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: promptText })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.answer || "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.name && parsed.steps) {
            setDesignerPlaybook({
              id: "custom-" + Date.now(),
              name: parsed.name,
              description: parsed.description || "",
              steps: parsed.steps.map((s: Record<string, unknown>) => ({
                cmd: (s.cmd || "") as string,
                expectedOutput: Array.isArray(s.expectedOutput) ? s.expectedOutput : [String(s.expectedOutput || "")],
                durationMs: Number(s.durationMs) || 1200
              }))
            });
            setAiPrompt("");
          }
        }
      }
    } catch (err) {
      console.error("AI Playbook generation failed:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Editor step field handlers
  const handleStepChange = (index: number, field: keyof PlaybookStep, value: string | number) => {
    setDesignerPlaybook(prev => {
      const nextSteps = [...prev.steps];
      if (field === "expectedOutput") {
        nextSteps[index] = { ...nextSteps[index], expectedOutput: String(value).split("\n") };
      } else {
        nextSteps[index] = { ...nextSteps[index], [field]: value };
      }
      return { ...prev, steps: nextSteps };
    });
  };

  const addStep = () => {
    setDesignerPlaybook(prev => ({
      ...prev,
      steps: [...prev.steps, { cmd: "", expectedOutput: [""], durationMs: 1000 }]
    }));
  };

  const removeStep = (index: number) => {
    setDesignerPlaybook(prev => {
      if (prev.steps.length <= 1) return prev;
      const nextSteps = prev.steps.filter((_, i) => i !== index);
      return { ...prev, steps: nextSteps };
    });
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    setDesignerPlaybook(prev => {
      const nextSteps = [...prev.steps];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextSteps.length) return prev;
      
      const temp = nextSteps[index];
      nextSteps[index] = nextSteps[targetIndex];
      nextSteps[targetIndex] = temp;
      
      return { ...prev, steps: nextSteps };
    });
  };

  const cloneStep = (index: number) => {
    setDesignerPlaybook(prev => {
      const nextSteps = [...prev.steps];
      const stepToClone = nextSteps[index];
      const clonedStep = {
        cmd: stepToClone.cmd,
        expectedOutput: [...stepToClone.expectedOutput],
        durationMs: stepToClone.durationMs
      };
      nextSteps.splice(index + 1, 0, clonedStep);
      return { ...prev, steps: nextSteps };
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" style={{ minHeight: "550px" }}>
      {/* Playbook Configuration Sidebar */}
      <div className="lg:col-span-4 flex flex-col gap-4 bg-[#060a16] border border-[#1e3a5f]/40 rounded-xl p-4 glass-panel overflow-y-auto max-h-[600px]">
        {/* Designer Toggle Tabs */}
        <div className="flex border-b border-[#1e3a5f]/40 gap-2 mb-2">
          <button
            onClick={() => setActiveTab('execute')}
            className={`flex-1 pb-2 font-mono text-[9px] font-black tracking-wider uppercase border-b-2 transition-all ${
              activeTab === 'execute' ? 'border-amber-500 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Execute
          </button>
          <button
            onClick={() => setActiveTab('design')}
            className={`flex-1 pb-2 font-mono text-[9px] font-black tracking-wider uppercase border-b-2 transition-all ${
              activeTab === 'design' ? 'border-amber-500 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Design
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 pb-2 font-mono text-[9px] font-black tracking-wider uppercase border-b-2 transition-all ${
              activeTab === 'history' ? 'border-amber-500 text-amber-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            History
          </button>
        </div>

        {activeTab === 'execute' && (
          <>
            <div className="flex items-center gap-2 pb-1.5 border-b border-[#1e3a5f]/20">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <h4 className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                Execution Controller
              </h4>
            </div>

            {/* Target Node Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                Target Ground Station
              </label>
              <select
                value={selectedRouter}
                onChange={(e) => setSelectedRouter(e.target.value)}
                disabled={isRunning}
                className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                {routers.map(r => (
                  <option key={r} value={r}>
                    {r} - {telemetryData[r]?.telemetry.router_name || r} ({Math.round(telemetryData[r]?.analysis.failure_risk ?? 0)}% Risk)
                  </option>
                ))}
              </select>
            </div>

            {/* Playbook Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                Select Playbook Workflow
              </label>
              <select
                value={selectedPlaybook}
                onChange={(e) => setSelectedPlaybook(e.target.value)}
                disabled={isRunning}
                className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <optgroup label="Default System SOPs">
                  {PLAYBOOKS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
                {customPlaybooks.length > 0 && (
                  <optgroup label="Custom User SOPs (Supabase)">
                    {customPlaybooks.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Playbook Description */}
            <div className="bg-[#030611]/80 rounded border border-[#1e3a5f]/30 p-2.5 flex flex-col gap-1.5">
              <p className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                Strategy Overview
              </p>
              <p className="text-[10.5px] font-mono text-slate-400 leading-normal">
                {playbook.description}
              </p>
            </div>

            {/* Steps List */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                Steps to be executed:
              </p>
              <div className="flex flex-col gap-1">
                {playbook.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
                      idx === currentStepIndex
                        ? "bg-amber-500/10 border-amber-500 text-amber-300 animate-pulse"
                        : idx < currentStepIndex || completed
                        ? "bg-green-500/5 border-green-500/30 text-green-400"
                        : "bg-[#030611] border-[#1e3a5f]/20 text-slate-500"
                    }`}
                  >
                    <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center border border-current text-[8.5px] shrink-0 font-bold">
                      {idx + 1}
                    </div>
                    <div className="truncate flex-1">
                      <code>{step.cmd.split("\n")[0]}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={startExecution}
              disabled={isRunning}
              className="mt-auto w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-slate-950 font-mono font-bold text-[10px] py-2 px-3 rounded transition-colors shadow-[0_0_12px_rgba(245,158,11,0.2)] disabled:shadow-none flex items-center justify-center gap-1.5 uppercase tracking-widest"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing Playbook...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Diagnostic Playbook</span>
                </>
              )}
            </button>
          </>
        )}

        {activeTab === 'design' && (
          <div className="flex flex-col gap-3 font-mono text-xs">
            <div className="flex items-center gap-2 pb-1.5 border-b border-[#1e3a5f]/20">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <h4 className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                Playbook Builder Workspace
              </h4>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] text-slate-500 uppercase tracking-widest">Playbook Title</label>
              <input
                type="text"
                value={designerPlaybook.name}
                onChange={(e) => setDesignerPlaybook(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. 'Delhi MCF OSPF Repair'"
                className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2.5 py-1.5 text-white"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] text-slate-500 uppercase tracking-widest">Description</label>
              <textarea
                value={designerPlaybook.description}
                onChange={(e) => setDesignerPlaybook(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Briefly explain target symptoms and outcome behavior..."
                className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2.5 py-1.5 text-white min-h-[50px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[9px] text-slate-500 uppercase tracking-widest">CLI Sequence Steps</label>
                <button
                  type="button"
                  onClick={addStep}
                  className="text-amber-400 hover:text-amber-300 text-[10px] uppercase font-bold"
                >
                  + Add Step
                </button>
              </div>

              <div className="flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1">
                {designerPlaybook.steps.map((step, idx) => (
                  <div key={idx} className="p-2 border border-[#1e3a5f]/30 rounded bg-[#030611]/60 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <span>STEP {idx + 1}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <button
                          type="button"
                          onClick={() => moveStep(idx, "up")}
                          disabled={idx === 0}
                          className="text-amber-400 hover:text-amber-300 disabled:text-slate-700 disabled:cursor-not-allowed font-bold"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(idx, "down")}
                          disabled={idx === designerPlaybook.steps.length - 1}
                          className="text-amber-400 hover:text-amber-300 disabled:text-slate-700 disabled:cursor-not-allowed font-bold"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => cloneStep(idx)}
                          className="text-cyan-400 hover:text-cyan-300 font-bold ml-1"
                          title="Duplicate Step"
                        >
                          Clone
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(idx)}
                          className="text-red-400 hover:text-red-300 font-bold ml-1"
                          title="Delete Step"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={step.cmd}
                      onChange={(e) => handleStepChange(idx, "cmd", e.target.value)}
                      placeholder="CLI Command e.g. show ip ospf"
                      className="bg-[#02050c] border border-[#1e3a5f]/40 rounded px-2 py-1 text-white text-[11px]"
                    />

                    <textarea
                      value={step.expectedOutput.join("\n")}
                      onChange={(e) => handleStepChange(idx, "expectedOutput", e.target.value)}
                      placeholder="Expected Output (One line per trace response)"
                      className="bg-[#02050c] border border-[#1e3a5f]/40 rounded px-2 py-1 text-slate-300 text-[10px] min-h-[40px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Save Controls */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1e3a5f]/30">
              <button
                type="button"
                onClick={handleSavePlaybook}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2 px-3 rounded flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save to Supabase</span>
              </button>
              {saveStatus && (
                <p className="text-[10px] text-center font-bold text-cyan-400">{saveStatus}</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-1.5 border-b border-[#1e3a5f]/20">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <h4 className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                Mitigation &amp; Run History
              </h4>
            </div>

            {isLogsLoading ? (
              <div className="text-[10px] font-mono text-slate-500 text-center py-4">
                Loading history from Supabase...
              </div>
            ) : mitigationLogs.length === 0 ? (
              <div className="text-[10px] font-mono text-slate-500 text-center py-4">
                No past runs found.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                {mitigationLogs.map((log) => {
                  const dateStr = new Date(log.created_at || "2026-07-15T00:00:00Z").toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  });
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedAuditLog(log)}
                      className="text-left bg-[#030611] hover:bg-[#0c1428] border border-[#1e3a5f]/40 hover:border-amber-500/50 rounded p-2 transition-all flex flex-col gap-1 w-full"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[10px] font-mono text-white font-bold">
                          {log.router_id}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">
                          {dateStr}
                        </span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-400 truncate max-w-full">
                        {log.action_taken || "Mitigation action applied"}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[8px] font-mono">
                        <span className="text-slate-500 uppercase truncate">
                          {log.router_name}
                        </span>
                        <span className="text-green-400 px-1 rounded bg-green-500/10 border border-green-500/20">
                          {log.status || "resolved"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Terminal Display & AI Prompt Workspace Panel */}
      <div className="lg:col-span-8 flex flex-col bg-[#02050c] border border-[#1e3a5f]/60 rounded-xl overflow-hidden glass-panel">
        
        {/* If in designer mode, show AI Generator bar at the top */}
        {isDesignerMode ? (
          <div className="px-4 py-3 border-b border-[#1e3a5f]/60 bg-[#030a1c]/80 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-black">
                Gemini AI Playbook Auto-Generator
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={isAiLoading}
                placeholder="Describe play: 'Analyze CPU leak on Delhi' or 'Mitigate OSPF flapping on MCF-HSN'..."
                className="flex-1 bg-[#02050c] border border-[#1e3a5f]/60 rounded px-3 py-1.5 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400"
              />
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isAiLoading || !aiPrompt.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white font-mono font-bold text-[10px] px-4 rounded transition-all flex items-center gap-1.5 uppercase shadow-[0_0_12px_rgba(147,51,234,0.3)] disabled:shadow-none"
              >
                {isAiLoading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                <span>Generate Flow</span>
              </button>
            </div>
            {dbError && (
              <div className="text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/25 p-2 rounded mt-1">
                ⚠️ [Supabase Notice] Table 'custom_playbooks' not found in database. Run the database schema SQL query to enable playbook saves!
              </div>
            )}
          </div>
        ) : (
          /* Terminal Header */
          <div className="px-4 py-2 border-b border-[#1e3a5f]/60 flex items-center justify-between bg-[#030814]/80">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                ISRO Router SSH Console Session
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
          </div>
        )}

        {/* Console / Preview Output Logs */}
        <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-amber-300/90 overflow-y-auto max-h-[460px] min-h-[300px]">
          {isDesignerMode ? (
            /* PREVIEW LAYOUT IN DESIGNER */
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-slate-500 border-b border-[#1e3a5f]/20 pb-1">
                <span>🔍 PREVIEW: CLI TERMINAL SEQUENCE</span>
                <span className="text-[9px] bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 px-1.5 py-0.5 rounded">Dynamic Simulator Mode</span>
              </div>
              
              <div className="text-slate-500 italic select-none">
                # Preview of console telemetry stream once playbook starts:
              </div>

              <div className="pl-2 border-l border-amber-500/20 flex flex-col gap-3.5">
                <div>
                  <span className="text-cyan-400">[LOG] Playbook Session started: {designerPlaybook.name || "(No Title)"}</span>
                  <p className="text-slate-500">[SSH] Encryption keys validated. Initializing secure shell...</p>
                </div>

                {designerPlaybook.steps.map((step, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="text-white font-bold">
                      isro-router-gate# {step.cmd || `(Empty Command Step ${idx + 1})`}
                    </div>
                    <div className="pl-3 text-amber-300/80">
                      {step.expectedOutput.map((out, oIdx) => (
                        <div key={oIdx}>{out || "(No expected output configured)"}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* EXECUTION CONSOLE logs */
            <>
              {consoleLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 select-none">
                  <Terminal className="w-8 h-8 opacity-25 mb-1" />
                  <p>CONSOLE SESSION IDLE</p>
                  <p className="text-[9px] mt-0.5">Start execution to open terminal tunnel</p>
                </div>
              ) : (
                <>
                  {consoleLogs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap">
                      {log.startsWith("[LOG]") ? (
                        <span className="text-cyan-400">{log}</span>
                      ) : log.startsWith("[SSH]") ? (
                        <span className="text-slate-500">{log}</span>
                      ) : log.startsWith("isro-router-") ? (
                        <span className="text-white font-bold">{log}</span>
                      ) : (
                        <span>{log}</span>
                      )}
                    </div>
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-3.5 bg-amber-400 animate-pulse inline-block" />
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider animate-pulse">Running router script...</span>
                    </div>
                  )}
                  <div ref={consoleBottomRef} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Audit Log Modal Dialog */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#050b18] border border-[#1e3a5f] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3a5f] bg-[#070e20]">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-bold text-xs text-white">
                  SSH Console Audit Log — {selectedAuditLog.router_id}
                </span>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="text-slate-400 hover:text-white font-mono text-xs hover:bg-[#1a2744] px-2 py-1 rounded"
              >
                ✕ Close
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-[#02050c]">
              <div className="flex flex-col gap-1.5 pb-3 mb-3 border-b border-[#1e3a5f]/40 text-slate-400 text-[10px]">
                <p>Node Name: <b className="text-white">{selectedAuditLog.router_name}</b></p>
                <p>Execution Status: <b className="text-green-400">{selectedAuditLog.status || "resolved"}</b></p>
                <p>Log Time: <b className="text-white">{new Date(selectedAuditLog.created_at).toLocaleString("en-IN")}</b></p>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed text-emerald-400/90 font-mono text-[11px]">
                {selectedAuditLog.action_taken}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
