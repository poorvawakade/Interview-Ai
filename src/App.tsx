import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Languages, 
  Briefcase, 
  History as HistoryIcon, 
  Volume2, 
  ChevronRight,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Timer as TimerIcon,
  Trophy,
  MessageSquare,
  Sparkles,
  Zap
} from 'lucide-react';
import { generateQuestion, analyzeAnswer } from './services/geminiService';
import { LANGUAGES, DOMAINS, DIFFICULTIES, InterviewQuestion, Feedback, Difficulty } from './types';

// --- Components ---

const Avatar = ({ speaking }: { speaking: boolean }) => (
  <div className="relative w-24 h-24 mx-auto mb-4">
    <div className={`absolute inset-0 bg-indigo-500/20 rounded-full animate-pulse ${speaking ? 'scale-125' : 'scale-100'}`} />
    <div className="relative w-full h-full bg-white rounded-full border-4 border-indigo-500 flex items-center justify-center overflow-hidden shadow-lg">
      <User size={48} className="text-indigo-500" />
    </div>
    {speaking && (
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={{ height: [4, 10, 4] }}
            transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
            className="w-1 bg-indigo-500 rounded-full"
          />
        ))}
      </div>
    )}
  </div>
);

const ScoreGauge = ({ score }: { score: number }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          className="text-slate-200"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
        <motion.circle
          className="text-indigo-600"
          strokeWidth="8"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
      </svg>
      <span className="absolute text-xl font-bold text-slate-800">{score}%</span>
    </div>
  );
};

export default function App() {
  const [screen, setScreen] = useState<'selection' | 'interview' | 'history'>('selection');
  const [domain, setDomain] = useState(DOMAINS[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [sessionId, setSessionId] = useState('');
  const [chatHistory, setChatHistory] = useState<{ type: 'ai' | 'user' | 'feedback', content: any }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<{ avgScore: number, totalQs: number } | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setAnswer(transcript);
      };

      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  // Refresh history every 30 seconds if on history screen
  useEffect(() => {
    let interval: any;
    if (screen === 'history') {
      interval = setInterval(loadHistory, 30000);
    }
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    let timer: any;
    if (isTimerActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isTimerActive) {
      setIsTimerActive(false);
      handleSubmitAnswer(); // Auto-submit when time ends
    }
    return () => clearInterval(timer);
  }, [isTimerActive, timeLeft]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAnalyzing]);

  const speak = (text: string, lang: string = 'en-US') => {
    console.log('Speaking:', text, lang);
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1;
      
      utterance.onstart = () => {
        console.log('Speech started');
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        console.log('Speech ended');
        setIsSpeaking(false);
      };
      utterance.onerror = (e) => {
        console.error('Speech error:', e);
        setIsSpeaking(false);
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      console.error('Speech synthesis not supported');
    }
  };

  const startInterview = async () => {
    const id = Math.random().toString(36).substring(7);
    setSessionId(id);
    setScreen('interview');
    setChatHistory([]);
    setAnswer('');
    setTimeLeft(60);
    setIsTimerActive(true);
    setSessionSummary(null);
    
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, domain, language: language.name, difficulty }),
    });

    const q = await generateQuestion(domain, language.name, difficulty, []);
    setCurrentQuestion(q);
    setChatHistory([{ type: 'ai', content: q }]);
    speak(q.english);
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setAnswer('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const calculateSummary = () => {
    const feedbacks = chatHistory.filter(m => m.type === 'feedback').map(m => m.content);
    if (feedbacks.length === 0) return null;
    
    const totalScore = feedbacks.reduce((acc, f) => acc + f.confidenceScore, 0);
    return {
      avgScore: Math.round(totalScore / feedbacks.length),
      totalQs: feedbacks.length
    };
  };

  const handleEndInterview = () => {
    console.log('Ending interview...');
    setIsTimerActive(false);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    const summary = calculateSummary();
    if (summary) {
      console.log('Summary calculated:', summary);
      setSessionSummary(summary);
    } else {
      console.log('No summary, going home');
      setScreen('selection');
    }
    // Refresh history but don't switch screen yet if showing summary
    fetch('/api/history').then(res => res.json()).then(data => setHistory(data));
  };

  const handleSubmitAnswer = async () => {
    const userMsg = answer.trim() || "(Time expired - no response provided)";
    setAnswer('');
    setIsTimerActive(false);
    setChatHistory(prev => [...prev, { type: 'user', content: userMsg }]);
    setIsAnalyzing(true);

    try {
      const analysis = await analyzeAnswer(currentQuestion?.english || "Interview Question", userMsg, language.name, difficulty);
      
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          question: currentQuestion?.english || "Question",
          answer: userMsg,
          analysis
        }),
      });

      setChatHistory(prev => [...prev, { type: 'feedback', content: analysis }]);
      
      if (analysis.followUpQuestion) {
        setTimeout(() => {
          setCurrentQuestion(analysis.followUpQuestion!);
          setChatHistory(prev => [...prev, { type: 'ai', content: analysis.followUpQuestion }]);
          speak(analysis.followUpQuestion!.english);
          setTimeLeft(60);
          setIsTimerActive(true);
        }, 1500);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data);
      setSessionSummary(null);
      setScreen('history');
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInMs = now.getTime() - past.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    
    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60) return `${diffInMins}m ago`;
    const diffInHours = Math.floor(diffInMins / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return past.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
          setScreen('selection');
          setSessionSummary(null);
        }}>
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
            <Sparkles className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase">Interview.AI</h1>
        </div>
        <div className="flex items-center gap-4">
          {screen === 'interview' && !sessionSummary && (
            <>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-sm shadow-sm ${timeLeft < 10 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
                <TimerIcon size={16} />
                {timeLeft}s
              </div>
              <button 
                onClick={handleEndInterview}
                className="px-4 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-full text-xs font-black uppercase tracking-widest transition-all border border-rose-100"
              >
                End Interview
              </button>
            </>
          )}
          <button 
            onClick={loadHistory}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-all hover:bg-slate-100 rounded-full"
          >
            <HistoryIcon size={24} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {sessionSummary ? (
            <motion.div 
              key="summary"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="py-12 space-y-8 text-center"
            >
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-200 space-y-8 max-w-2xl mx-auto">
                <div className="space-y-4">
                  <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
                    <Trophy size={40} />
                  </div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter">SESSION COMPLETE!</h2>
                  <p className="text-slate-500 font-medium">Great job practicing today. Here's how you did:</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="text-4xl font-black text-indigo-600">{sessionSummary.avgScore}%</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Avg. Score</div>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="text-4xl font-black text-slate-900">{sessionSummary.totalQs}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Questions</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={() => {
                      setSessionSummary(null);
                      setScreen('selection');
                    }}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100"
                  >
                    RETURN HOME
                  </button>
                  <button 
                    onClick={() => {
                      setSessionSummary(null);
                      loadHistory();
                    }}
                    className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    VIEW FULL HISTORY
                  </button>
                </div>
              </div>
            </motion.div>
          ) : screen === 'selection' ? (
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12 py-12"
            >
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold tracking-widest uppercase mb-4"
                >
                  AI-Powered Career Growth
                </motion.div>
                <h2 className="text-5xl sm:text-7xl font-black text-slate-900 tracking-tighter leading-[0.9]">
                  CRUSH YOUR <br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">INTERVIEW.</span>
                </h2>
                <p className="text-slate-500 text-xl max-w-2xl mx-auto font-medium">
                  The world's most advanced bilingual interview simulator. Practice in your native tongue, get feedback in real-time.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4 hover:shadow-xl hover:border-indigo-200 transition-all group">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                    <Briefcase size={24} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Domain</label>
                    <select 
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="w-full bg-transparent font-bold text-lg outline-none cursor-pointer"
                    >
                      {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4 hover:shadow-xl hover:border-emerald-200 transition-all group">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <Languages size={24} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Language</label>
                    <select 
                      value={language.code}
                      onChange={(e) => setLanguage(LANGUAGES.find(l => l.code === e.target.value)!)}
                      className="w-full bg-transparent font-bold text-lg outline-none cursor-pointer"
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4 hover:shadow-xl hover:border-rose-200 transition-all group">
                  <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all">
                    <Zap size={24} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Difficulty</label>
                    <select 
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                      className="w-full bg-transparent font-bold text-lg outline-none cursor-pointer"
                    >
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button 
                onClick={startInterview}
                className="w-full bg-slate-900 hover:bg-indigo-600 text-white py-6 rounded-3xl font-black text-2xl shadow-2xl shadow-indigo-200 transition-all flex items-center justify-center gap-4 group"
              >
                START SESSION
                <ChevronRight className="group-hover:translate-x-2 transition-transform" size={32} />
              </button>
            </motion.div>
          ) : screen === 'interview' ? (
            <motion.div 
              key="interview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-[calc(100vh-120px)]"
            >
              <div className="flex-1 overflow-y-auto space-y-6 pb-32 pt-4 px-2 scrollbar-hide">
                {chatHistory.map((msg, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.type === 'ai' && (
                      <div className="flex gap-4 max-w-[85%]">
                        <div className="flex-shrink-0">
                          <Avatar speaking={isSpeaking && idx === chatHistory.length - 1} />
                        </div>
                        <div className="bg-white p-6 rounded-3xl rounded-tl-none shadow-sm border border-slate-200 space-y-3">
                          <p className="text-xl font-bold text-slate-800 leading-tight">{msg.content.english}</p>
                          <p className="text-sm text-indigo-600 font-medium italic">{msg.content.translated}</p>
                          <button 
                            onClick={() => speak(msg.content.english)}
                            className="p-2 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-full transition-colors"
                          >
                            <Volume2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}

                    {msg.type === 'user' && (
                      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-5 rounded-3xl rounded-tr-none shadow-lg max-w-[80%]">
                        <p className="text-lg font-medium">{msg.content}</p>
                      </div>
                    )}

                    {msg.type === 'feedback' && (
                      <div className="w-full max-w-2xl bg-white border-2 border-indigo-100 rounded-3xl p-6 shadow-xl space-y-6 my-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-amber-50 p-2 rounded-xl text-amber-600">
                              <Trophy size={20} />
                            </div>
                            <h4 className="font-black text-slate-900 uppercase tracking-tight">Performance Report</h4>
                          </div>
                          <ScoreGauge score={msg.content.confidenceScore} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Grammar</span>
                            <p className="text-sm text-slate-600 leading-snug">{msg.content.grammar}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Fluency</span>
                            <p className="text-sm text-slate-600 leading-snug">{msg.content.fluency}</p>
                          </div>
                        </div>

                        <div className="bg-indigo-50 p-6 rounded-2xl space-y-4 border border-indigo-100">
                          <div className="flex items-center gap-2 text-indigo-600 font-bold text-[10px] uppercase tracking-widest">
                            <Sparkles size={12} />
                            Pro Suggestion
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm text-slate-800 font-semibold italic">"{msg.content.improvedAnswer}"</p>
                            <p className="text-xs text-indigo-500 font-medium italic border-t border-indigo-100 pt-2">{msg.content.translatedImprovedAnswer}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
                {isAnalyzing && (
                  <div className="flex justify-start gap-4">
                    <Avatar speaking={false} />
                    <div className="bg-white p-6 rounded-3xl rounded-tl-none shadow-sm border border-slate-200 flex gap-2">
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                <div className="max-w-4xl mx-auto relative">
                  <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 p-2 flex items-center gap-2 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                    <button 
                      onClick={toggleRecording}
                      className={`p-4 rounded-2xl transition-all ${
                        isRecording ? 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-200' : 'bg-slate-100 text-slate-400 hover:text-indigo-600'
                      }`}
                    >
                      {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    <input 
                      type="text"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                      placeholder="Type your response..."
                      className="flex-1 bg-transparent outline-none font-bold text-lg px-2"
                    />
                    <button 
                      disabled={!answer.trim() || isAnalyzing}
                      onClick={handleSubmitAnswer}
                      className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg"
                    >
                      <Send size={24} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : screen === 'history' ? (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 py-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setScreen('selection')} className="p-3 hover:bg-slate-200 rounded-2xl transition-colors">
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">HISTORY</h2>
              </div>

              <div className="grid gap-4">
                {history.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                    <HistoryIcon size={64} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-bold text-xl uppercase tracking-widest">No Sessions Found</p>
                  </div>
                ) : (
                  history.map((session) => (
                    <div key={session.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-xl hover:border-indigo-200 transition-all group">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                            session.difficulty === 'Expert' ? 'bg-rose-100 text-rose-600' : 
                            session.difficulty === 'Intermediate' ? 'bg-indigo-100 text-indigo-600' : 
                            'bg-emerald-100 text-emerald-600'
                          }`}>
                            {session.difficulty}
                          </span>
                          <h3 className="font-black text-2xl text-slate-900 tracking-tight">{session.domain}</h3>
                        </div>
                        <p className="text-slate-400 flex items-center gap-2 text-sm font-medium">
                          <Languages size={14} className="text-emerald-500" /> {session.language} • {getTimeAgo(session.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="text-indigo-600 font-black text-xl">{session.question_count} Qs</div>
                        </div>
                        <button 
                          onClick={() => {
                            setDomain(session.domain);
                            setLanguage(LANGUAGES.find(l => l.name === session.language) || LANGUAGES[0]);
                            setDifficulty(session.difficulty || 'Intermediate');
                            startInterview();
                          }}
                          className="bg-slate-100 text-slate-900 p-4 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm"
                        >
                          <ChevronRight size={24} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
