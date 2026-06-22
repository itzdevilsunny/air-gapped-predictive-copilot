import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, RouterState, CopilotDocument } from '../types';
import { Send, Terminal, Bot, User, BookOpen, RefreshCw, Upload, FolderOpen, X } from 'lucide-react';

interface CopilotChatProps {
  onSendMessage: (query: string, routerId: string | null, history: ChatMessage[]) => Promise<{ answer: string; retrieved_documents: CopilotDocument[]; engine: string }>;
  telemetryData: Record<string, RouterState>;
  currentRouterId: string | null;
}

export const CopilotChat: React.FC<CopilotChatProps> = ({
  onSendMessage,
  telemetryData,
  currentRouterId,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'copilot',
      text: "### Live ISRO Air-Gapped NOC Copilot Initialized\n\nI am connected to the local knowledge databases (MPLS underlay policies, SD-WAN tunnel manuals, Delhi memory leak logs). Ask me any network troubleshooting questions, or query a specific router state (e.g. 'Why is SDSC-SHAR failing?').",
      timestamp: new Date().toISOString(),
      engine: 'Local Expert Rules (Offline Fallback)'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [selectedRouterContext, setSelectedRouterContext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // SOP Library states
  const [showSopsModal, setShowSopsModal] = useState(false);
  const [sopsList, setSopsList] = useState<CopilotDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [copilotStatus, setCopilotStatus] = useState<{ engine: string; knowledge_docs: number } | null>(null);

  const fetchSops = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sops');
      if (res.ok) {
        const data = await res.json();
        setSopsList(data);
      }
    } catch (err) {
      console.error('Error fetching SOPs:', err);
    }
  };

  const fetchCopilotStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/copilot/status');
      if (res.ok) {
        const data = await res.json();
        setCopilotStatus(data);
      }
    } catch (err) {
      console.error('Error fetching copilot status:', err);
    }
  };

  useEffect(() => {
    fetchSops();
    fetchCopilotStatus();
    const interval = setInterval(fetchCopilotStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    setUploadMessage('Ingesting & indexing doc...');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sops/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadMessage('SOP indexed successfully!');
        await fetchSops();
        setTimeout(() => setUploadMessage(''), 3000);
      } else {
        const data = await res.json();
        setUploadMessage(`Error: ${data.detail || 'Upload failed'}`);
      }
    } catch (err) {
      console.error('Failed to upload SOP:', err);
      setUploadMessage('Network error occurred.');
    } finally {
      setUploading(false);
    }
  };

  // Sync router context when active router is selected in parent
  useEffect(() => {
    if (currentRouterId) {
      const timer = setTimeout(() => {
        setSelectedRouterContext(currentRouterId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentRouterId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const userQuery = inputValue;
    setInputValue('');
    setLoading(true);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userQuery,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await onSendMessage(userQuery, selectedRouterContext, messages);
      
      const copilotMsg: ChatMessage = {
        id: `copilot-${Date.now()}`,
        sender: 'copilot',
        text: response.answer,
        timestamp: new Date().toISOString(),
        retrieved_documents: response.retrieved_documents,
        engine: response.engine
      };

      setMessages(prev => [...prev, copilotMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'copilot',
        text: `Error connecting to AI backend: ${(err as Error)?.message || 'Could not process query.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl border border-noc-border/80 flex flex-col h-full bg-[#070b19]/90 relative overflow-hidden scanline">
      {/* Top Banner */}
      <div className="bg-[#030611] border-b border-noc-border/40 p-4 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-noc-primary animate-pulse" />
          <h3 className="font-display text-sm tracking-widest text-noc-primary uppercase">
            AIR-GAPPED OPERATIONS COPILOT
          </h3>
          <button
            type="button"
            id="btn-toggle-sops"
            onClick={() => setShowSopsModal(true)}
            className="ml-3 bg-noc-border/60 hover:bg-noc-border text-noc-text hover:text-noc-primary border border-noc-border px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>SOP LIBRARY ({sopsList.length})</span>
          </button>
          {copilotStatus && (
            <span className="ml-3 bg-noc-card border border-noc-border/50 text-noc-text px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                copilotStatus.engine === 'Gemini 2.5 Flash' 
                  ? 'bg-purple-400 animate-pulse' 
                  : copilotStatus.engine === 'Ollama LLM' 
                    ? 'bg-blue-400' 
                    : 'bg-emerald-400'
              }`} style={{
                boxShadow: copilotStatus.engine === 'Gemini 2.5 Flash' 
                  ? '0 0 6px #c084fc' 
                  : (copilotStatus.engine === 'Ollama LLM' ? '0 0 6px #60a5fa' : '0 0 6px #34d399')
              }} />
              ENGINE: {copilotStatus.engine.toUpperCase()}
            </span>
          )}
        </div>
        
        {/* Router Context Selection */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-noc-muted font-mono uppercase">Node Context:</span>
          <select
            id="select-chat-context"
            value={selectedRouterContext || ''}
            onChange={(e) => setSelectedRouterContext(e.target.value || null)}
            className="bg-[#0c1020] border border-noc-border text-noc-text rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
          >
            <option value="">Global Overview</option>
            {Object.keys(telemetryData).map(rid => (
              <option key={rid} value={rid}>
                {rid} ({telemetryData[rid].telemetry.router_name.split(' ')[0]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 select-text">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[85%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              {/* Profile Icon */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border flex-shrink-0 ${
                isUser ? 'bg-noc-primary/10 border-noc-primary/40 text-noc-primary' : 'bg-noc-card border-noc-border text-noc-warning'
              }`}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message bubble */}
              <div className="flex flex-col gap-1.5">
                <div className={`p-3 rounded-lg border text-xs font-mono leading-relaxed whitespace-pre-wrap ${
                  isUser 
                    ? 'bg-noc-primary/5 border-noc-primary/20 text-noc-primary rounded-tr-none' 
                    : 'bg-[#030611] border-noc-border/50 text-noc-text rounded-tl-none'
                }`}>
                  {msg.text}
                </div>

                {/* Sub-meta tags for AI Engine & Retrieved SOPs */}
                {!isUser && (
                  <div className="flex flex-col gap-1 px-1">
                    {msg.engine && (
                      <span className="text-[8px] text-noc-muted font-mono">
                        Engine: <span className="text-noc-primary">{msg.engine}</span>
                      </span>
                    )}
                    
                    {/* Documents Retreived Accordion */}
                    {msg.retrieved_documents && msg.retrieved_documents.length > 0 && (
                      <div className="mt-1">
                        <span className="text-[8px] font-semibold text-noc-warning flex items-center gap-1">
                          <BookOpen className="w-2.5 h-2.5" />
                          RETRIEVED OFFLINE SOP MANUALS:
                        </span>
                        <div className="flex flex-col gap-1 mt-1">
                          {msg.retrieved_documents.map((doc, dIdx) => (
                            <details 
                              key={doc.id || dIdx} 
                              className="group bg-[#030611]/50 border border-noc-border/20 rounded text-[9px] font-mono text-noc-muted overflow-hidden transition-all duration-200"
                            >
                              <summary className="p-1 cursor-pointer hover:bg-noc-border/10 hover:text-noc-text select-none flex justify-between items-center">
                                <span>{dIdx + 1}. {doc.title}</span>
                                <span className="group-open:rotate-180 transform transition-transform text-[8px]">▼</span>
                              </summary>
                              <div className="p-2 border-t border-noc-border/10 bg-black/30 text-noc-text/80 leading-normal whitespace-pre-wrap select-text">
                                {doc.content}
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex gap-3 self-start max-w-[85%]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center border bg-noc-card border-noc-border text-noc-warning">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-[#030611] border border-noc-border/50 text-noc-muted p-3 rounded-lg rounded-tl-none text-xs font-mono flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-noc-primary" />
              <span>Analyzing live telemetry and SOP documentation indices...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input panel */}
      <form onSubmit={handleSend} className="bg-[#030611] border-t border-noc-border/40 p-3 flex gap-2 flex-shrink-0">
        <input
          type="text"
          id="input-chat-query"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={selectedRouterContext ? `Ask about active faults on ${selectedRouterContext}...` : "Ask about underlay QoS config, SD-WAN link flap SOPs..."}
          className="flex-1 bg-[#0c1020] border border-noc-border text-noc-text rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-noc-primary"
          disabled={loading}
        />
        <button
          type="submit"
          id="btn-send-query"
          disabled={loading || !inputValue.trim()}
          className="bg-noc-primary/20 hover:bg-noc-primary/35 text-noc-primary border border-noc-primary/50 px-4 py-2 rounded flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-glow-cyan"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* SOP Library Overlay */}
      {showSopsModal && (
        <div className="absolute inset-0 bg-[#05070f]/95 backdrop-blur-sm z-30 flex flex-col border border-noc-border/80 rounded-xl overflow-hidden animate-fade-in select-text">
          {/* Header */}
          <div className="bg-[#030611] border-b border-noc-border/50 p-3.5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-noc-primary" />
              <span className="font-display text-xs tracking-wider text-noc-primary uppercase font-bold">
                KNOWLEDGE BASE SOP LIBRARY
              </span>
            </div>
            
            <button
              type="button"
              onClick={() => setShowSopsModal(false)}
              className="text-noc-muted hover:text-noc-text transition-colors"
              title="Close SOP Library"
              aria-label="Close SOP Library"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* SOP Content / List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col md:flex-row gap-4 min-h-0">
            {/* Left side: Upload & File list */}
            <div className="w-full md:w-1/3 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-noc-border/30 pb-3 md:pb-0 md:pr-3 min-h-0">
              {/* Upload Drop Zone / Button */}
              <div className="border border-dashed border-noc-border/80 hover:border-noc-primary/60 rounded-lg p-3 bg-[#030611]/30 hover:bg-[#030611]/60 text-center transition-all duration-200 relative group cursor-pointer">
                <input
                  type="file"
                  accept=".txt,.md"
                  id="input-file-upload"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploading}
                  aria-label="Upload SOP File"
                  title="Upload SOP File"
                />
                <Upload className="w-6 h-6 text-noc-primary/50 group-hover:text-noc-primary mx-auto mb-1 animate-pulse" />
                <span className="text-[10px] font-mono font-semibold text-noc-text block uppercase">Upload SOP File</span>
                <span className="text-[8px] text-noc-muted font-mono block mt-0.5">Supports .txt or .md</span>
              </div>
              
              {uploadMessage && (
                <div className="text-[9px] font-mono text-noc-warning text-center bg-[#030611]/50 border border-noc-border/40 py-1 rounded">
                  {uploadMessage}
                </div>
              )}

              {/* Files List */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 font-mono text-[10px]">
                <span className="text-[9px] text-noc-muted font-bold tracking-wider uppercase block mb-1">Loaded SOP Documents:</span>
                {sopsList.length === 0 ? (
                  <div className="text-noc-muted text-center py-4">No SOP files loaded</div>
                ) : (
                  sopsList.map((doc, idx) => (
                    <details 
                      key={doc.id || idx}
                      className="group bg-[#0c1020]/50 border border-noc-border/20 rounded overflow-hidden mb-1"
                    >
                      <summary className="p-2 cursor-pointer hover:bg-noc-border/20 hover:text-noc-primary flex justify-between items-center select-none font-semibold text-noc-text">
                        <span>{idx + 1}. {doc.title}</span>
                        <span className="group-open:rotate-180 transform transition-transform text-[8px]">▼</span>
                      </summary>
                      <div className="p-2 border-t border-noc-border/10 bg-black/45 text-noc-muted text-[9px] leading-normal whitespace-pre-wrap select-text max-h-32 overflow-y-auto">
                        {doc.content}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </div>
            
            {/* Right side: Detailed operational instructions */}
            <div className="flex-1 bg-[#030611]/40 border border-noc-border/20 rounded-lg p-3 overflow-y-auto text-[10px] leading-relaxed font-mono">
              <h4 className="text-[11px] font-display text-noc-warning font-bold uppercase tracking-wider mb-2 border-b border-noc-border/25 pb-1">
                Air-Gapped RAG Ingestion
              </h4>
              <p className="text-noc-muted mb-2">
                This operations center utilizes local Semantic Document Ingestion. When you query the AI Copilot, the backend tf-idf vector database performs a cosine similarity lookup across all files in the database:
              </p>
              <ul className="list-disc list-inside text-noc-text flex flex-col gap-1 mb-3">
                <li>Primary tracking telemetry mapped to DSCP EF priority.</li>
                <li>Link flapping faults mitigated via secondary routes.</li>
                <li>Delhi daemons buffer memory leaks cleared with route resets.</li>
              </ul>
              <p className="text-noc-muted">
                You can upload any custom SOP or network layout note here. The system will index it, and subsequent copilot prompts will dynamically retrieve the context.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
