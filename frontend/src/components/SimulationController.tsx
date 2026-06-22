import React, { useState } from 'react';
import { Play, RotateCcw, AlertTriangle, X } from 'lucide-react';

interface SimulationControllerProps {
  onTriggerScenario: (routerId: string, type: string) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

const ROUTERS_LIST = [
  { id: 'ISTRAC-BGL', name: 'ISTRAC Bangalore' },
  { id: 'SDSC-SHAR', name: 'SDSC Sriharikota' },
  { id: 'MCF-HSN', name: 'MCF Hassan' },
  { id: 'NOC-DEL', name: 'NOC Delhi' },
  { id: 'NOC-MUM', name: 'NOC Mumbai' },
  { id: 'TRACK-PBL', name: 'TRACK Port Blair' },
];

const SCENARIOS = [
  { id: 'congestion', name: 'MPLS Bandwidth Congestion', description: 'Simulates high bandwidth usage (95%+), elevated latency, and moderate packet loss.', color: 'text-noc-warning' },
  { id: 'overload', name: 'Device CPU/Memory Overload', description: 'Simulates memory leaks and routing table exhaustion. CPU hits 95%+, causing buffer drops.', color: 'text-noc-purple' },
  { id: 'instability', name: 'Routing Instability / Link Flapping', description: 'Simulates physical link issues and packet drops. Link oscillates between UP and DOWN.', color: 'text-noc-danger' },
  { id: 'normal', name: 'Nominal Operations', description: 'Resets the router parameters to baseline healthy standards.', color: 'text-noc-success' },
];

export const SimulationController: React.FC<SimulationControllerProps> = ({
  onTriggerScenario,
  isOpen,
  onClose,
}) => {
  const [selectedRouter, setSelectedRouter] = useState('SDSC-SHAR');
  const [selectedScenario, setSelectedScenario] = useState('congestion');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleTrigger = async () => {
    setLoading(true);
    setMessage('');
    try {
      await onTriggerScenario(selectedRouter, selectedScenario);
      setMessage(`Successfully triggered ${selectedScenario} on ${selectedRouter}.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`Failed to trigger scenario: ${(err as Error)?.message || 'Error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md bg-noc-card rounded-xl p-6 shadow-2xl relative border border-noc-border animate-fade-in">
        {/* Close Button */}
        <button 
          id="btn-close-sim"
          onClick={onClose} 
          className="absolute top-4 right-4 text-noc-muted hover:text-noc-text transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-4">
          <h3 className="font-display text-lg tracking-widest text-noc-warning uppercase flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-noc-warning" />
            NOC FAILURE INJECTION DECK
          </h3>
          <p className="text-xs text-noc-muted mt-1">Inject anomaly scenarios to test XGBoost forecasting and Isolation Forest classification.</p>
        </div>

        {/* Form Body */}
        <div className="flex flex-col gap-4">
          {/* Target Router Selector */}
          <div>
            <label className="text-xs font-semibold text-noc-muted uppercase font-mono block mb-1.5">Select Target Router</label>
            <select
              id="select-sim-router"
              value={selectedRouter}
              onChange={(e) => setSelectedRouter(e.target.value)}
              className="w-full bg-[#030611] border border-noc-border text-noc-text rounded px-3 py-2 text-sm focus:outline-none focus:border-noc-primary font-mono"
            >
              {ROUTERS_LIST.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </select>
          </div>

          {/* Scenario Selector */}
          <div>
            <label className="text-xs font-semibold text-noc-muted uppercase font-mono block mb-1.5">Select Scenario Type</label>
            <div className="flex flex-col gap-2">
              {SCENARIOS.map((sc) => (
                <div
                  key={sc.id}
                  id={`scenario-${sc.id}`}
                  onClick={() => setSelectedScenario(sc.id)}
                  className={`border rounded p-2.5 cursor-pointer transition-all duration-200 ${
                    selectedScenario === sc.id
                      ? 'border-noc-primary bg-noc-primary/5 shadow-glow-cyan'
                      : 'border-noc-border/60 hover:border-noc-border bg-[#030611]/30 hover:bg-[#030611]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={selectedScenario === sc.id}
                      onChange={() => setSelectedScenario(sc.id)}
                      className="accent-noc-primary"
                    />
                    <span className={`text-xs font-semibold font-mono ${sc.color}`}>{sc.name}</span>
                  </div>
                  <p className="text-[10px] text-noc-muted mt-1 leading-normal ml-5">{sc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trigger Button */}
          <div className="mt-2">
            <button
              id="btn-inject-simulation"
              onClick={handleTrigger}
              disabled={loading}
              className="w-full bg-noc-warning/20 hover:bg-noc-warning/35 text-noc-warning border border-noc-warning/50 py-2.5 rounded font-mono text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-glow-warning disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>TRANSMITTING INJECTION CODE...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>EXECUTE FAILURE INJECTION</span>
                </>
              )}
            </button>
          </div>

          {/* Logs message */}
          {message && (
            <div className="bg-[#030611] border border-noc-border rounded p-2 text-center text-[10px] font-mono text-noc-primary animate-pulse">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
