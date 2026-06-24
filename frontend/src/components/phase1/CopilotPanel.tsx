import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Send, RefreshCw, BookOpen, Cpu, Wifi, ChevronDown, ChevronUp, CornerDownRight } from 'lucide-react';

interface RetrievedDoc {
  id: string;
  title: string;
  category: string;
  relevance_score: number;
  snippet: string;
}

interface CopilotResponse {
  answer: string;
  engine: string;
  ollama_available: boolean;
  ollama_status: string;
  retrieved_documents: RetrievedDoc[];
  target_router: string | null;
  live_telemetry_count: number;
  timestamp: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  docs?: RetrievedDoc[];
  engine?: string;
  router?: string | null;
  timestamp: string;
  loading?: boolean;
}

interface CopilotStatus {
  ollama_available: boolean;
  ollama_status: string;
  engine: string;
  knowledge_docs: number;
  status: string;
}

interface CopilotPanelProps {
  api: string;
}

const QUICK_PROMPTS = [
  { label: 'Network Status', query: 'What is the current network status across all routers?' },
  { label: 'NOC Delhi Issues', query: 'Why is NOC Delhi showing instability?' },
  { label: 'Congestion Fix', query: 'How do I fix MPLS link congestion?' },
  { label: 'High CPU', query: 'What should I do if a router has high CPU and memory?' },
  { label: 'Link Flapping', query: 'How do I stop link flapping on a router?' },
  { label: 'Bangalore Status', query: 'Diagnose ISTRAC Bangalore current state.' },
];

function MarkdownRenderer({ text }: { text: string }) {
  // Simple markdown renderer for bold, code blocks, tables, bullets
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={i} style={{ margin: '10px 0' }}>
          {lang && (
            <div style={{
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              padding: '4px 12px',
              fontSize: 10,
              color: '#64748b',
              fontFamily: 'var(--font-mono)',
              borderRadius: '6px 6px 0 0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {lang}
            </div>
          )}
          <pre style={{
            background: '#020617',
            border: '1px solid #1e293b',
            borderRadius: lang ? '0 0 6px 6px' : '6px',
            padding: '12px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#34d399',
            overflowX: 'auto',
            whiteSpace: 'pre',
            margin: 0,
            lineHeight: 1.6
          }}>
            {codeLines.join('\n')}
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(l => !l.match(/^\|[-\s|]+\|$/));
      elements.push(
        <table key={i} style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 11,
          margin: '8px 0',
          fontFamily: 'var(--font-mono)'
        }}>
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split('|').filter(c => c.trim() !== '');
              return (
                <tr key={ri} style={{ borderBottom: '1px solid #1e293b' }}>
                  {cells.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '5px 10px',
                      color: ri === 0 ? '#94a3b8' : '#cbd5e1',
                      fontWeight: ri === 0 ? 600 : 400,
                      background: ri === 0 ? '#0f172a' : 'transparent'
                    }}>
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
      continue;
    }

    // Heading
    if (line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**')) {
      elements.push(
        <div key={i} style={{
          fontWeight: 800,
          color: '#f1f5f9',
          fontSize: 13,
          marginTop: 12,
          marginBottom: 4
        }}>
          {line.slice(2, -2)}
        </div>
      );
      i++;
      continue;
    }

    // Bullet point
    if (line.startsWith('• ') || line.startsWith('- ') || line.match(/^\d+\. /)) {
      const isBullet = line.startsWith('• ') || line.startsWith('- ');
      const text = isBullet ? line.slice(2) : line.replace(/^\d+\. /, '');
      const numMatch = line.match(/^(\d+)\. /);
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'flex-start' }}>
          <span style={{
            color: '#60a5fa',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            flexShrink: 0,
            marginTop: 1
          }}>
            {numMatch ? `${numMatch[1]}.` : '•'}
          </span>
          <span style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>
            {renderInline(text)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // Italic line (e.g. *timestamp:*)
    if (line.startsWith('*') && line.endsWith('*')) {
      elements.push(
        <div key={i} style={{ color: '#64748b', fontSize: 10, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
          {line.slice(1, -1)}
        </div>
      );
      i++;
      continue;
    }

    // Separator
    if (line.trim() === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '8px 0' }} />);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 4 }} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <div key={i} style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.7, margin: '2px 0' }}>
        {renderInline(line)}
      </div>
    );
    i++;
  }

  return <div>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**, `code`, and plain text
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 3,
              padding: '1px 5px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: '#34d399'
            }}>
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function CopilotPanel({ api }: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CopilotStatus | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());
  const [selectedRouter, setSelectedRouter] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch copilot engine status
  const fetchStatus = useCallback(() => {
    fetch(`${api}/api/ph5/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 10000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: (
        '**ISRO Air-Gapped Network Copilot — Ready**\n\n' +
        'I am your on-premise AI assistant for ISRO MPLS network operations. ' +
        'I have access to **live telemetry** from all 6 ground stations and a **knowledge base** of ' +
        '16 ISRO SOPs, incident reports, and troubleshooting guides.\n\n' +
        'Ask me anything about the network — specific router diagnostics, failure analysis, ' +
        'Cisco IOS remediation commands, or general MPLS operations.\n\n' +
        '**Quick start:** Select a prompt below or type your question.'
      ),
      engine: 'System',
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  const sendMessage = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    try {
      const formattedHistory = messages
        .filter(m => m.engine !== 'System' && m.engine !== 'Error' && !m.loading)
        .map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : ''
        }))
        .filter(m => m.content !== '');

      const res = await fetch(`${api}/api/ph5/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          router_context: selectedRouter || null,
          history: formattedHistory,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Query failed');
      }

      const data: CopilotResponse = await res.json();

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        docs: data.retrieved_documents,
        engine: data.engine,
        router: data.target_router,
        timestamp: data.timestamp,
      };

      setMessages(prev => [...prev.slice(0, -1), aiMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: `**Error:** ${err.message || 'Failed to get response from copilot engine.'}`,
        engine: 'Error',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev.slice(0, -1), errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleDocs = (idx: number) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const ROUTERS = [
    { id: '', label: 'Auto-detect router' },
    { id: 'ISTRAC-BGL', label: 'ISTRAC Bangalore' },
    { id: 'SDSC-SHAR', label: 'SDSC Sriharikota' },
    { id: 'MCF-HSN', label: 'MCF Hassan' },
    { id: 'NOC-DEL', label: 'NOC Delhi' },
    { id: 'NOC-MUM', label: 'NOC Mumbai' },
    { id: 'TRACK-PBL', label: 'TRACK Port Blair' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 220px)', minHeight: 600 }}>

      {/* ─── Engine Status Bar ─── */}
      <div style={{
        background: '#0a0f1d',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 6,
            background: '#3b82f615', border: '1px solid #3b82f630',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa'
          }}>
            <MessageCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              Air-Gapped AI Copilot
              <span style={{
                fontSize: 9, fontWeight: 700,
                background: '#3b82f620', color: '#60a5fa',
                border: '1px solid #3b82f640',
                padding: '2px 6px', borderRadius: 4,
                fontFamily: 'var(--font-mono)'
              }}>RAG + VECTOR SEARCH</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              TF-IDF Vector Search • Live Telemetry Injection • {status?.knowledge_docs ?? '—'} Knowledge Documents
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Engine indicator */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Active Engine</div>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: status ? (status.engine === 'Gemini 2.5 Flash'
                ? '#c084fc'
                : (status.engine === 'Ollama LLM' ? '#a78bfa' : '#34d399')) : '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}>
              {!status ? (
                <><RefreshCw size={11} className="spin" /> Syncing...</>
              ) : status.engine === 'Gemini 2.5 Flash' ? (
                <><span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#c084fc',
                  display: 'inline-block',
                  boxShadow: '0 0 8px #c084fc'
                }} /> Gemini 2.5 Flash</>
              ) : status.engine === 'Ollama LLM' ? (
                <><Wifi size={11} /> Ollama LLM</>
              ) : (
                <><Cpu size={11} /> Local Expert Engine</>
              )}
            </div>
          </div>

          {/* Telemetry indicator */}
          <div style={{ borderLeft: '1px solid #1e293b', paddingLeft: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Live Data</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
              6 Routers Connected
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Chat Area ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Chat History */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: '#070c17',
          border: '1px solid #1e293b',
          borderRadius: '8px 8px 0 0',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 6
            }}>
              {/* Role label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>
                {msg.role === 'user' ? (
                  <span>YOU</span>
                ) : (
                  <>
                    <span style={{ color: '#3b82f6' }}>◆</span>
                    <span>COPILOT</span>
                    {msg.engine && msg.engine !== 'System' && (
                      <span style={{
                        background: '#1e293b',
                        padding: '1px 5px',
                        borderRadius: 3,
                        color: '#64748b'
                      }}>{msg.engine}</span>
                    )}
                    {msg.router && (
                      <span style={{
                        background: '#1e3a5f',
                        padding: '1px 5px',
                        borderRadius: 3,
                        color: '#60a5fa'
                      }}>📍 {msg.router}</span>
                    )}
                  </>
                )}
              </div>

              {/* Message bubble */}
              <div style={{
                maxWidth: msg.role === 'user' ? '70%' : '100%',
                width: msg.role === 'assistant' ? '100%' : 'auto',
                background: msg.role === 'user' ? '#1e3a5f' : '#0f172a',
                border: `1px solid ${msg.role === 'user' ? '#2563eb40' : '#1e293b'}`,
                borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                padding: '12px 16px',
              }}>
                {msg.loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12 }}>
                    <RefreshCw size={12} className="spin" />
                    <span>Analyzing telemetry and searching knowledge base...</span>
                  </div>
                ) : msg.role === 'user' ? (
                  <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>{msg.content}</div>
                ) : (
                  <MarkdownRenderer text={msg.content} />
                )}
              </div>

              {/* Retrieved Documents Accordion */}
              {msg.docs && msg.docs.length > 0 && (
                <div style={{ width: '100%' }}>
                  <button
                    onClick={() => toggleDocs(idx)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      color: '#475569', fontSize: 10, fontFamily: 'var(--font-mono)',
                      padding: '4px 0',
                    }}
                  >
                    <BookOpen size={10} />
                    {msg.docs.length} reference{msg.docs.length > 1 ? 's' : ''} retrieved
                    {expandedDocs.has(idx) ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </button>

                  {expandedDocs.has(idx) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {msg.docs.map((doc, di) => (
                        <div key={di} style={{
                          background: '#0a0f1d',
                          border: '1px solid #1e293b',
                          borderRadius: 6,
                          padding: '8px 12px',
                          display: 'flex',
                          gap: 10
                        }}>
                          <CornerDownRight size={12} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{doc.title}</span>
                              <span style={{
                                fontSize: 9, fontFamily: 'var(--font-mono)',
                                background: '#1e3a5f', color: '#60a5fa',
                                padding: '1px 5px', borderRadius: 3
                              }}>{doc.relevance_score}% match</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.5 }}>{doc.snippet}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* ─── Quick Prompts ─── */}
        <div style={{
          background: '#0a0f1d',
          borderLeft: '1px solid #1e293b',
          borderRight: '1px solid #1e293b',
          padding: '8px 14px',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          borderTop: '1px solid #0d1425'
        }}>
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p.query)}
              disabled={loading}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 10,
                color: '#64748b',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f650';
                (e.currentTarget as HTMLButtonElement).style.background = '#1e293b';
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e293b';
                (e.currentTarget as HTMLButtonElement).style.background = '#0f172a';
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ─── Input Area ─── */}
        <div style={{
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderTop: '1px solid #243656',
          borderRadius: '0 0 8px 8px',
          padding: '12px 16px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end'
        }}>
          {/* Router selector */}
          <select
            value={selectedRouter}
            onChange={e => setSelectedRouter(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 6,
              color: '#94a3b8',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              padding: '6px 8px',
              flexShrink: 0,
              height: 36,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {ROUTERS.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask about a router, failure, Cisco command, or network issue... (Enter to send, Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 12,
              fontFamily: 'inherit',
              padding: '8px 12px',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
              minHeight: 36,
              maxHeight: 100,
              overflowY: 'auto',
              transition: 'border-color 0.15s'
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#3b82f650'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#1e293b'; }}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36,
              background: loading || !input.trim() ? '#1e293b' : '#2563eb',
              border: 'none',
              borderRadius: 6,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: loading || !input.trim() ? '#475569' : '#fff',
              flexShrink: 0,
              transition: 'all 0.15s'
            }}
          >
            {loading ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
