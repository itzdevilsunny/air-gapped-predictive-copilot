import React, { useState, useEffect } from 'react';
import { Terminal, Play, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';

interface DiagnosticConsoleProps {
  routerId: string;
}

export const DiagnosticConsole: React.FC<DiagnosticConsoleProps> = ({ routerId }) => {
  const [command, setCommand] = useState<'ping' | 'tracert'>('ping');
  const [host, setHost] = useState('127.0.0.1');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>('Console initialized. Ready to execute diagnosis.\nSelect a host and command, then click Run.');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'timeout'>('idle');

  // Suggest a target IP based on selected router
  useEffect(() => {
    const ipMap: Record<string, string> = {
      'ISTRAC-BGL': '10.100.10.1',
      'SDSC-SHAR': '10.100.20.1',
      'MCF-HSN': '10.100.30.1',
      'NOC-DEL': '10.100.40.1',
      'NOC-MUM': '10.100.50.1',
      'TRACK-PBL': '10.100.60.1',
    };
    setHost(ipMap[routerId] || '127.0.0.1');
  }, [routerId]);

  const handleRunDiagnostic = async () => {
    setLoading(true);
    setStatus('idle');
    setOutput('Initiating connection...\nExecuting subprocess command on air-gapped gateway...');
    
    try {
      const response = await fetch('http://127.0.0.1:8000/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, command }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to complete diagnostic run.');
      }
      
      const data = await response.json();
      setOutput(data.output || 'No output returned from diagnostic command.');
      if (data.status === 'success') {
        setStatus('success');
      } else if (data.status === 'timeout') {
        setStatus('timeout');
      } else {
        setStatus('error');
      }
    } catch (err) {
      setOutput(`DIAGNOSTIC ERROR:\n${(err as Error)?.message || 'Unknown network error.'}`);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Console Input Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center justify-between border-b border-noc-border/20 pb-3">
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Command Select Toggle */}
          <div className="flex bg-[#030611] rounded p-0.5 border border-noc-border/60">
            <button
              onClick={() => setCommand('ping')}
              disabled={loading}
              className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all duration-200 ${
                command === 'ping' ? 'bg-noc-card text-noc-primary shadow' : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              PING
            </button>
            <button
              onClick={() => setCommand('tracert')}
              disabled={loading}
              className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all duration-200 ${
                command === 'tracert' ? 'bg-noc-card text-noc-primary shadow' : 'text-noc-muted hover:text-noc-text'
              }`}
            >
              TRACERT
            </button>
          </div>
          
          {/* Target Host Input */}
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={loading}
            className="flex-1 sm:w-44 bg-[#030611] border border-noc-border text-noc-text rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-noc-primary"
            placeholder="Host IP or Address"
          />
        </div>

        {/* Execute Button */}
        <button
          onClick={handleRunDiagnostic}
          disabled={loading || !host.trim()}
          className="w-full sm:w-auto bg-noc-primary/20 hover:bg-noc-primary/35 text-noc-primary border border-noc-primary/50 px-4 py-1.5 rounded text-xs font-mono font-bold transition-all duration-200 hover:shadow-glow-cyan disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <>
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
              <span>RUNNING...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>EXECUTE DIAGNOSTIC</span>
            </>
          )}
        </button>
      </div>

      {/* Terminal View Output */}
      <div className="flex-1 flex flex-col min-h-0 relative bg-black/90 border border-noc-border/50 rounded-lg overflow-hidden font-mono text-xs">
        {/* Terminal Header */}
        <div className="bg-[#0c1020]/80 border-b border-noc-border/30 px-3 py-1.5 flex justify-between items-center text-[9px] text-noc-muted">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-noc-primary" />
            <span>NOC GATEWAY SHELL: {command.toUpperCase()} {host}</span>
          </span>
          <span className="flex items-center gap-1">
            {status === 'success' && <CheckCircle className="w-3 h-3 text-noc-success" />}
            {status === 'error' && <AlertCircle className="w-3 h-3 text-noc-danger" />}
            {status === 'timeout' && <AlertCircle className="w-3 h-3 text-noc-warning" />}
            <span className={`uppercase text-[8px] font-bold ${
              status === 'success' ? 'text-noc-success' : status === 'error' ? 'text-noc-danger' : status === 'timeout' ? 'text-noc-warning' : 'text-noc-muted'
            }`}>
              {status}
            </span>
          </span>
        </div>

        {/* Console Log Area */}
        <pre className="flex-1 p-3 text-emerald-400 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text font-mono text-[10px] custom-scrollbar">
          {output}
        </pre>
      </div>
    </div>
  );
};
