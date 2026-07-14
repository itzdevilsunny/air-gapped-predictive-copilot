import React, { useState, useEffect, useRef, useMemo } from "react";
import { Sliders, Terminal, Play, RefreshCw } from "lucide-react";

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

  const routers = useMemo(() => {
    return Object.keys(telemetryData);
  }, [telemetryData]);

  const playbook = useMemo(() => {
    return PLAYBOOKS.find(p => p.id === selectedPlaybook) || PLAYBOOKS[0];
  }, [selectedPlaybook]);

  useEffect(() => {
    // Scroll terminal to bottom
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  // Execute Playbook Engine
  const startExecution = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCompleted(false);
    setCurrentStepIndex(0);
    setConsoleLogs([
      `[LOG] ${new Date().toISOString()} - Initializing Playbook Session...`,
      `[LOG] Target Ground Station Node: ${selectedRouter} (${telemetryData[selectedRouter]?.telemetry.router_name || selectedRouter})`,
      `[LOG] Selected Strategy: ${playbook.name}`,
      `[LOG] Establishing encrypted SSH tunnel session to router...`,
      `[SSH] Connection established successfully. Starting terminal shell.\n`
    ]);

    let stepIdx = 0;
    const runNextStep = () => {
      if (stepIdx >= playbook.steps.length) {
        // Complete execution
        setTimeout(async () => {
          setConsoleLogs(prev => [
            ...prev,
            `\n[LOG] Playbook sequence executed successfully. All parameters within bounds.`,
            `[LOG] Sending commit signal... Configuration updated.`,
            `[LOG] Closing terminal session. Closed SSH tunnel.`
          ]);
          setCompleted(true);
          setIsRunning(false);
          setCurrentStepIndex(-1);

          // Apply mitigation logic (resolves alerts/risks)
          try {
            await onMitigate(selectedRouter);
          } catch (e) {
            console.error("Mitigation callback failed", e);
          }
        }, 1000);
        return;
      }

      const step = playbook.steps[stepIdx];
      setCurrentStepIndex(stepIdx);

      // Print command prompt
      setConsoleLogs(prev => [
        ...prev,
        `isro-router-${selectedRouter.toLowerCase()}# ${step.cmd}`
      ]);

      // Delay output
      setTimeout(() => {
        setConsoleLogs(prev => [
          ...prev,
          ...step.expectedOutput,
          "" // blank line
        ]);
        stepIdx++;
        runNextStep();
      }, step.durationMs);
    };

    setTimeout(() => {
      runNextStep();
    }, 1200);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" style={{ minHeight: "500px" }}>
      {/* Playbook Configuration Sidebar */}
      <div className="lg:col-span-4 flex flex-col gap-4 bg-[#060a16] border border-[#1e3a5f]/40 rounded-xl p-4 glass-panel">
        <div className="flex items-center gap-2 pb-2 border-b border-[#1e3a5f]/40">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
            Playbook Controller
          </h3>
        </div>

        {/* Target Node Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            Target Ground Station
          </label>
          <select
            value={selectedRouter}
            onChange={(e) => setSelectedRouter(e.target.value)}
            disabled={isRunning}
            className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            {routers.map(r => (
              <option key={r} value={r}>
                {r} - {telemetryData[r]?.telemetry.router_name || r} ({Math.round(telemetryData[r]?.analysis.failure_risk ?? 0)}% Risk)
              </option>
            ))}
          </select>
        </div>

        {/* Playbook Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            Select Playbook Workflow
          </label>
          <select
            value={selectedPlaybook}
            onChange={(e) => setSelectedPlaybook(e.target.value)}
            disabled={isRunning}
            className="bg-[#030611] border border-[#1e3a5f]/60 rounded px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            {PLAYBOOKS.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Playbook Description */}
        <div className="bg-[#030611]/80 rounded border border-[#1e3a5f]/30 p-3 mt-2 flex flex-col gap-2">
          <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
            Strategy Overview
          </p>
          <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
            {playbook.description}
          </p>
        </div>

        {/* Steps List */}
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-[9.5px] font-mono text-slate-500 uppercase tracking-widest">
            Steps to be executed:
          </p>
          <div className="flex flex-col gap-1.5">
            {playbook.steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 font-mono text-[10.5px] px-2 py-1.5 rounded border transition-colors ${
                  idx === currentStepIndex
                    ? "bg-amber-500/10 border-amber-500 text-amber-300"
                    : idx < currentStepIndex || completed
                    ? "bg-green-500/5 border-green-500/30 text-green-400"
                    : "bg-[#030611] border-[#1e3a5f]/20 text-slate-500"
                }`}
              >
                <div className="w-4 h-4 rounded-full flex items-center justify-center border border-current text-[9px] shrink-0 font-bold">
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
          className="mt-auto w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 text-slate-950 font-mono font-black text-xs py-2.5 px-4 rounded transition-colors shadow-[0_0_12px_rgba(245,158,11,0.2)] disabled:shadow-none flex items-center justify-center gap-2 uppercase tracking-widest"
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
      </div>

      {/* Terminal Display Panel */}
      <div className="lg:col-span-8 flex flex-col bg-[#02050c] border border-[#1e3a5f]/60 rounded-xl overflow-hidden glass-panel">
        {/* Terminal Header */}
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

        {/* Terminal Output Logs */}
        <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-amber-300/90 overflow-y-auto max-h-[460px] min-h-[300px]">
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
        </div>
      </div>
    </div>
  );
};
