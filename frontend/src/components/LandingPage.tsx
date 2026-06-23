import React, { useState, useEffect } from 'react';
import { Shield, Server, Cpu, Radio, BookOpen, Lock } from 'lucide-react';

interface LandingPageProps {
  onLogin: (success: boolean) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('isro-admin');
  const [password, setPassword] = useState('predictive-noc');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const timer = setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auto-login presentation mode active: bypass verification checks
    localStorage.setItem('noc_is_logged_in', 'true');
    onLogin(true);
  };

  return (
    <div className="min-h-screen bg-noc-bg text-noc-text flex flex-col font-sans select-none relative overflow-y-auto">
      {/* Background Cyber Grid */}
      <div className="absolute inset-0 grid-bg opacity-25 z-0 pointer-events-none" />
      <div className="absolute inset-0 scanline opacity-5 pointer-events-none z-10" />

      {/* Header */}
      <header className="border-b border-noc-border/80 px-6 py-4 bg-[#030611] flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-noc-primary/10 rounded border border-noc-primary/30">
            <Radio className="w-6 h-6 text-noc-primary animate-pulse" />
          </div>
          <div>
            <h1 className="font-display font-black text-lg tracking-widest text-noc-text flex items-center gap-2">
              ISRO PRED-NOC
            </h1>
            <p className="text-[10px] text-noc-muted font-mono tracking-wider">AIR-GAPPED OPERATIONS CORE</p>
          </div>
        </div>
        <div className="flex gap-4">
          <a
            href="?tab=overview"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 1 (SIM)
          </a>
          <a
            href="?tab=predictions"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 2 (ML)
          </a>
          <a
            href="?tab=anomalies"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 3 (ANOMALY)
          </a>
          <a
            href="?tab=rootcause"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 4 (ROOT CAUSE)
          </a>
          <a
            href="?tab=copilot"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 5 (COPILOT)
          </a>
          <a
            href="?tab=selfheal"
            className="text-[11px] text-noc-muted hover:text-noc-primary font-mono transition-colors"
          >
            PHASE 6 (SELF-HEAL)
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-20 max-w-5xl mx-auto px-6 pt-16 pb-12 text-center flex flex-col items-center">
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded bg-noc-primary/10 border border-noc-primary/30 text-xs font-mono text-noc-primary tracking-wide">
          <Shield className="w-3.5 h-3.5" /> SECURE LAUNCH CONTROL GROUND SUITE
        </div>
        <h2 className="font-display text-4xl md:text-5xl font-black text-noc-text tracking-tight uppercase max-w-4xl leading-tight">
          Prevent Satellite Ground Station Adjacency Drops
        </h2>
        <p className="mt-4 text-sm md:text-base text-noc-muted max-w-2xl font-mono leading-relaxed">
          Autonomous telemetry anomaly detection, predictive failure warning, and air-gapped OSPF self-healing scripts for ISRO's mission-critical underlay control segments.
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="#login-section"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '#login-section');
              document.getElementById('login-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-noc-primary/20 hover:bg-noc-primary/30 text-noc-primary border border-noc-primary/45 px-6 py-2.5 rounded font-mono font-bold transition-all text-xs tracking-wider uppercase no-underline hover:shadow-glow-cyan"
          >
            Access Command Console
          </a>
          <a
            href="#problem-section"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '#problem-section');
              document.getElementById('problem-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="border border-noc-border hover:bg-noc-card/30 text-noc-text px-6 py-2.5 rounded font-mono transition-all text-xs tracking-wider uppercase no-underline"
          >
            Review Operations Playbook
          </a>
        </div>
      </section>

      {/* Problem & Image Examples Section */}
      <section id="problem-section" className="relative z-20 max-w-6xl mx-auto px-6 py-12 border-t border-noc-border/40 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <h3 className="font-display font-black text-2xl tracking-wide uppercase text-noc-primary">The Challenge</h3>
            <p className="mt-4 text-xs text-noc-muted font-mono leading-relaxed">
              During critical spacecraft launches and orbital maneuvers, tracking ground networks experience high-frequency packet bursts. Traditional NOCs fail to diagnose early warning indicators, leading to:
            </p>
            <ul className="mt-4 space-y-3 font-mono text-[11px] text-noc-muted">
              <li className="flex items-start gap-2">
                <span className="text-noc-primary">◆</span>
                <span><strong>OSPF Link Flapping:</strong> Brief physical links triggers false failovers, cascading OSPF recalculation load.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-noc-primary">◆</span>
                <span><strong>Device Load Congestion:</strong> Router CPU spikes to 99% under telemetry streams, delaying vital commands.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-noc-primary">◆</span>
                <span><strong>Packet Loss Outages:</strong> Spontaneous packet drop rates exceeding 5% that disrupt real-time tracking streams.</span>
              </li>
            </ul>
          </div>
          
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#070b18] border border-noc-border/80 rounded-lg p-3 glass-panel">
              <span className="text-[10px] text-noc-primary font-mono uppercase tracking-wider block mb-2">Live Telemetry Outage Model</span>
              <img 
                src="/noc_telemetry_example.png" 
                alt="Live Telemetry Graph Spikes" 
                className="w-full h-40 object-cover rounded border border-noc-border/40"
              />
              <p className="mt-2 text-[9px] text-noc-muted font-mono leading-normal">
                XGBoost ML modeling maps lagging rates to classify impending degradation states 45 minutes pre-failure.
              </p>
            </div>
            
            <div className="bg-[#070b18] border border-noc-border/80 rounded-lg p-3 glass-panel">
              <span className="text-[10px] text-noc-primary font-mono uppercase tracking-wider block mb-2">Ground Station Grid Topology</span>
              <img 
                src="/noc_network_topology.png" 
                alt="OSPF Ground Station Network" 
                className="w-full h-40 object-cover rounded border border-noc-border/40"
              />
              <p className="mt-2 text-[9px] text-noc-muted font-mono leading-normal">
                OSPF routing topology mapping showing interconnected tracking stations (ISTRAC, SDSC, MCF) and link attributes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Impact & Benefits Section */}
      <section className="relative z-20 max-w-6xl mx-auto px-6 py-12 border-t border-noc-border/40 w-full">
        <h3 className="font-display font-black text-xl tracking-wide uppercase text-center mb-8">System Capabilities & Impact</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#070b18] border border-noc-border/50 rounded-lg p-5 glass-panel">
            <Server className="w-8 h-8 text-noc-primary mb-3" />
            <h4 className="font-display font-bold text-sm uppercase text-noc-text">Proactive Diagnostics</h4>
            <p className="mt-2 text-xs text-noc-muted font-mono leading-relaxed">
              Isolation Forest models scan metric drifts to label anomalies as SUSPICIOUS or CRITICAL before standard threshold rules trigger.
            </p>
          </div>
          
          <div className="bg-[#070b18] border border-noc-border/50 rounded-lg p-5 glass-panel">
            <Cpu className="w-8 h-8 text-noc-primary mb-3" />
            <h4 className="font-display font-bold text-sm uppercase text-noc-text">Dynamic Self-Healing</h4>
            <p className="mt-2 text-xs text-noc-muted font-mono leading-relaxed">
              Auto-calculates mitigation playbooks generating Cisco IOS commands and Netmiko Python scripts to perform immediate route re-allocation.
            </p>
          </div>
          
          <div className="bg-[#070b18] border border-noc-border/50 rounded-lg p-5 glass-panel">
            <BookOpen className="w-8 h-8 text-noc-primary mb-3" />
            <h4 className="font-display font-bold text-sm uppercase text-noc-text">Air-Gapped Copilot</h4>
            <p className="mt-2 text-xs text-noc-muted font-mono leading-relaxed">
              Offline local vector store indexed with TF-IDF allows operators to query standard operations procedures (SOP) via RAG logic with zero internet.
            </p>
          </div>
        </div>
      </section>

      {/* Future Scope Section */}
      <section className="relative z-20 max-w-6xl mx-auto px-6 py-12 border-t border-noc-border/40 w-full text-center">
        <h3 className="font-display font-black text-xl tracking-wide uppercase text-noc-primary mb-3">Future Integration Roadmap</h3>
        <p className="text-xs text-noc-muted font-mono max-w-2xl mx-auto leading-relaxed">
          Continuous updates will scale the dashboard to automate configuration changes directly into production OSPF gateways using secure API pipelines, while incorporating low-Earth-orbit (LEO) satellite tracking telemetry analytics.
        </p>
      </section>

      {/* Login Form Section */}
      <section id="login-section" className="relative z-20 w-full max-w-sm mx-auto px-6 pb-24 mt-4 flex flex-col justify-center">
        <div className="bg-[#060a16] border border-noc-border rounded-lg p-6 glass-panel">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-noc-primary" />
            <span className="font-display text-xs font-bold uppercase tracking-wider text-noc-text">SECURE OPERATIONS ENCLAVE</span>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] text-noc-muted font-mono uppercase tracking-wider mb-1">OPERATOR ID</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. isro-admin"
                className="w-full bg-[#030611] border border-noc-border rounded p-2 text-xs font-mono text-noc-text outline-none focus:border-noc-primary"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-noc-muted font-mono uppercase tracking-wider mb-1">PASSKEY DECK</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#030611] border border-noc-border rounded p-2 text-xs font-mono text-noc-text outline-none focus:border-noc-primary"
                required
              />
            </div>



            <button
              type="submit"
              className="bg-noc-primary/20 hover:bg-noc-primary/30 text-noc-primary border border-noc-primary/45 py-2 rounded text-xs font-mono font-bold tracking-wider uppercase transition-all hover:shadow-glow-cyan"
            >
              AUTHENTICATE ACCESS
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-noc-border/40 text-[9px] text-noc-muted font-mono flex items-center justify-between">
            <span>SECURE CONSOLE SECURITY LEVEL 4</span>
            <div className="flex items-center gap-1 text-noc-success">
              <span className="h-1 w-1 rounded-full bg-noc-success animate-ping"></span>
              <span>ADC KEYCHAIN ACTIVE</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-noc-border/80 px-6 py-4 bg-[#030611] text-center text-[10px] text-noc-muted font-mono relative z-20">
        © 2026 INDIAN SPACE RESEARCH ORGANISATION · PREDICTIVE NOC COMMAND GATEWAY
      </footer>
    </div>
  );
};
