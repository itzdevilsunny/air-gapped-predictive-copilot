import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Mic, MicOff, Volume2, VolumeX, Send, X, Bot, User, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const Chatbot1: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello, I am Chitthi. I can answer questions about ISRO Predictive NOC and speak the answers aloud if you wish. Speak or type your query!'
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
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
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

      const res = await fetch('http://127.0.0.1:8000/api/chatbot1/chat', {
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

      const data = await res.json();
      const botAnswer = data.answer || "No response received.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: botAnswer }]);
      speakText(botAnswer);
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
                  {m.content}
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
