import React from "react";
import { Mic, Terminal, X, Volume2 } from "lucide-react";

interface ChitthiVoiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  voiceListening: boolean;
  voiceTranscript: string;
  voiceResponse: string;
  onStartMic: () => void;
}

export const ChitthiVoiceDrawer: React.FC<ChitthiVoiceDrawerProps> = ({
  isOpen,
  onClose,
  voiceListening,
  voiceTranscript,
  voiceResponse,
  onStartMic
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-[#020612]/95 border border-[#1e3a5f]/80 rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.8)] backdrop-blur-md overflow-hidden flex flex-col transition-all duration-300">
      {/* Header */}
      <div className="bg-[#050f24] px-3.5 py-2 border-b border-[#1e3a5f]/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-full ${voiceListening ? "bg-amber-500/20 text-amber-400 animate-pulse" : "bg-[#1e3a5f]/30 text-slate-400"}`}>
            <Mic className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">
            Chitthi Voice Deck
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal Content */}
      <div className="p-4 flex flex-col gap-3 font-mono text-[10.5px]">
        {/* Active Status */}
        <div className="flex items-center justify-between border-b border-[#1e3a5f]/20 pb-2">
          <span className="text-slate-500 uppercase text-[9px] tracking-wider">Operational Status</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${voiceListening ? "bg-amber-400 animate-ping" : "bg-cyan-500"}`} />
            <span className={voiceListening ? "text-amber-400 font-bold" : "text-cyan-400"}>
              {voiceListening ? "LISTENING..." : "STANDBY"}
            </span>
          </div>
        </div>

        {/* Live speech transcript */}
        <div className="flex flex-col gap-1.5 bg-[#030714] border border-[#1e3a5f]/30 rounded p-2.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[9px] uppercase">
            <Terminal className="w-3 h-3 text-amber-500" />
            <span>Voice Input (Speech-to-Text)</span>
          </div>
          <p className={`text-[11px] min-h-[1.5rem] italic ${voiceTranscript ? "text-green-400 font-bold" : "text-slate-600"}`}>
            {voiceTranscript ? `"${voiceTranscript}"` : "Waiting for voice trigger..."}
          </p>
        </div>

        {/* Spoken output response */}
        <div className="flex flex-col gap-1.5 bg-[#030714] border border-[#1e3a5f]/30 rounded p-2.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[9px] uppercase">
            <Volume2 className="w-3 h-3 text-cyan-400" />
            <span>Vocal Response (Text-to-Speech)</span>
          </div>
          <p className={`text-[11px] min-h-[1.5rem] ${voiceResponse ? "text-cyan-300" : "text-slate-600"}`}>
            {voiceResponse ? `Chitthi: "${voiceResponse}"` : "No verbal output generated."}
          </p>
        </div>

        {/* Example commands cheatsheet */}
        <div className="border-t border-[#1e3a5f]/20 pt-2 flex flex-col gap-1.5">
          <span className="text-slate-500 uppercase text-[9px] tracking-wider block">
            Vocal Command Cheat Sheet
          </span>
          <div className="grid grid-cols-2 gap-1 text-[9.5px] text-slate-400">
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "go to topology"
            </div>
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "show big board"
            </div>
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "go to forecast"
            </div>
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "mitigate Mumbai"
            </div>
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "toggle auto heal"
            </div>
            <div className="hover:text-white transition-colors cursor-pointer" onClick={() => onStartMic()}>
              • "solar flare active"
            </div>
          </div>
        </div>

        {/* Trigger Button if Standby */}
        {!voiceListening && (
          <button
            onClick={onStartMic}
            className="w-full bg-[#1e3a5f]/30 hover:bg-[#1e3a5f]/60 text-cyan-400 border border-[#1e3a5f]/80 rounded py-1.5 font-bold uppercase tracking-wider text-[10px] transition-colors mt-1 flex items-center justify-center gap-1.5"
          >
            <Mic className="w-3 h-3" />
            <span>Activate Mic</span>
          </button>
        )}
      </div>
    </div>
  );
};
