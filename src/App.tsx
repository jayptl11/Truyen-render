import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Search, AlertCircle, BookOpen, ArrowRight, Sparkles, Key, RotateCw, Trash2, Play, Pause, Square, Edit3, Globe, RefreshCw, FileText, HelpCircle, X, ChevronRight, ChevronLeft, Infinity as InfinityIcon, Clock, Timer, Settings, ArrowLeft, CheckCircle2, Hash } from 'lucide-react';

// --- SUB-COMPONENT: PARAGRAPH RENDERER ---
const ParagraphItem = memo(({ text, isActive, activeCharIndex, onClick, index, setRef }: any) => {
  const renderContent = () => {
    if (!isActive || activeCharIndex === null || activeCharIndex < 0 || activeCharIndex >= text.length) {
      return text;
    }
    const safeIndex = Math.min(activeCharIndex, text.length);
    const before = text.slice(0, safeIndex);
    const remaining = text.slice(safeIndex);
    const match = remaining.match(/^(\S+)(\s*)/); 
    
    if (!match) return text;
    
    const word = match[1];
    const space = match[2];
    const after = remaining.slice(word.length + space.length);
    
    return (
      <React.Fragment>
        {before}
        <span className="bg-orange-500 text-white rounded px-0.5 shadow-sm transition-colors duration-75">{word}</span>
        {space}
        {after}
      </React.Fragment>
    );
  };

  // Kiểu dáng đặc biệt cho tiêu đề chương (thường là đoạn đầu tiên)
  const isTitle = index === 0 && (text.toLowerCase().startsWith("chương") || text.length < 100);

  return (
    <p 
        ref={el => setRef(el, index)}
        onClick={() => onClick(index)}
        className={`
            mb-3 md:mb-4 p-2 md:p-3 rounded-lg cursor-pointer border-l-4 transition-all duration-300 text-base md:text-lg leading-relaxed
            ${isActive 
                ? 'bg-amber-50 border-amber-500 shadow-md transform scale-[1.01]' 
                : 'bg-transparent border-transparent hover:bg-slate-50 border-l-slate-200'
            }
            ${isTitle ? 'font-bold text-xl text-indigo-900 text-center py-4' : ''}
        `}
        title="Bấm để đọc đoạn này"
    >
        {renderContent()}
    </p>
  );
});

ParagraphItem.displayName = 'ParagraphItem';

export default function StoryFetcher() {
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [translatedContent, setTranslatedContent] = useState('');
  
  const [chunks, setChunks] = useState<string[]>([]);
  const [activeChunkIndex, setActiveChunkIndex] = useState<number | null>(null);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);

  const [nextChapterUrl, setNextChapterUrl] = useState<string | null>(null);
  const [prevChapterUrl, setPrevChapterUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  
  const [mobileTab, setMobileTab] = useState<'input' | 'reader'>('input');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisType, setAnalysisType] = useState<'summary' | 'explain' | null>(null);
  
  const [apiKeys, setApiKeys] = useState<string[]>(['', '', '']);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voiceDebugMsg, setVoiceDebugMsg] = useState('');
  
  // --- AUTO & TIMER & COUNTER STATES ---
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [autoStopChapterLimit, setAutoStopChapterLimit] = useState<number>(0); // 0 = Unlimited
  const [chaptersReadCount, setChaptersReadCount] = useState<number>(0); // Đếm số chương đã đọc trong phiên Auto
  
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // --- PRELOAD STATES ---
  const [preloadedData, setPreloadedData] = useState<any>(null);
  const [isPreloading, setIsPreloading] = useState(false);

  const activeUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set());
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentChunkIndexRef = useRef(0);
  const chunkRefs = useRef<(HTMLParagraphElement | null)[]>([]); 
  const containerRef = useRef<HTMLDivElement>(null); 
  const autoModeRef = useRef(isAutoMode);
  
  useEffect(() => { autoModeRef.current = isAutoMode; }, [isAutoMode]);

  // --- INIT ---
  useEffect(() => {
    const savedKeys = localStorage.getItem('gemini_api_keys');
    if (savedKeys) {
        try {
             const parsed = JSON.parse(savedKeys);
             if (Array.isArray(parsed) && parsed.length === 3) setApiKeys(parsed);
             else setApiKeys(['', '', '']);
        } catch { setApiKeys(['', '', '']); }
        setShowApiKeyInput(false);
    } else {
         const oldKey = localStorage.getItem('gemini_api_key');
         if (oldKey) { setApiKeys([oldKey, '', '']); localStorage.setItem('gemini_api_keys', JSON.stringify([oldKey, '', ''])); }
         else setShowApiKeyInput(true);
    }
  }, []);

  // --- VOICE LOADING LOGIC ---
  const loadVoices = useCallback(() => {
    if (!window.speechSynthesis) {
        setVoiceDebugMsg("Trình duyệt không hỗ trợ đọc.");
        return;
    }

    const availableVoices = window.speechSynthesis.getVoices();
    setVoices(availableVoices);
    
    const vnVoices = availableVoices.filter(v => 
        v.lang.toLowerCase().includes('vi') || 
        v.lang.toLowerCase().includes('vn') ||
        v.name.toLowerCase().includes('vietnam')
    );
    
    setVoiceDebugMsg(`Tìm thấy ${availableVoices.length} giọng (${vnVoices.length} tiếng Việt).`);

    const hoaiMyVoice = vnVoices.find(v => v.name.includes('HoaiMy') || v.name.includes('Hoai My'));
    const msFemale = vnVoices.find(v => v.name.includes('Microsoft') && (v.name.includes('Female') || v.name.includes('Nữ')));
    const defaultVoice = hoaiMyVoice 
                      || msFemale 
                      || vnVoices.find(v => v.name.includes('Microsoft')) 
                      || vnVoices.find(v => v.name.includes('Google')) 
                      || vnVoices[0];
    
    if (!selectedVoice && defaultVoice) {
        setSelectedVoice(defaultVoice);
    } else if (selectedVoice && !availableVoices.find(v => v.name === selectedVoice.name)) {
        if (defaultVoice) setSelectedVoice(defaultVoice);
    }
  }, [selectedVoice]);

  const wakeUpSpeechEngine = () => {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      loadVoices();
  };

  useEffect(() => { 
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices; 
    const intervalId = setInterval(loadVoices, 500);
    const timeoutId = setTimeout(() => clearInterval(intervalId), 3000);
    wakeUpSpeechEngine();
    return () => { 
        window.speechSynthesis.cancel(); 
        window.speechSynthesis.onvoiceschanged = null;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
    }; 
  }, [loadVoices]);

  // Timer Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timeLeft !== null && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(p => (p === null || p <= 1) ? (stopSpeech(), setIsAutoMode(false), null) : p - 1), 1000);
    } else if (timeLeft === 0) { stopSpeech(); setIsAutoMode(false); setTimeLeft(null); }
    return () => clearInterval(interval);
  }, [timeLeft]);

  const setTimer = (m: number) => { setTimeLeft(m * 60); setShowTimerMenu(false); setShowMobileSettings(false); };
  const setChapterLimit = (c: number) => { setAutoStopChapterLimit(c); setChaptersReadCount(0); setShowTimerMenu(false); setShowMobileSettings(false); };
  const formatTime = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  // --- HELPER FUNCTIONS FOR FETCHING ---
  const fetchRawStoryData = async (targetUrl: string) => {
      let rawHtml = '';
      try { const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`); const d = await r.json(); if (d.contents) rawHtml = d.contents; } catch (e) { console.log("Proxy 1 fail"); }
      if (!rawHtml || rawHtml.length < 100) { try { const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`); rawHtml = await r.text(); } catch (e) { console.log("Proxy 2 fail"); } }
      if (!rawHtml) throw new Error('Không tải được web.');

      const parser = new DOMParser(); 
      const doc = parser.parseFromString(rawHtml, 'text/html');
      
      const findLink = (k: string[], c: string[]) => Array.from(doc.querySelectorAll('a')).find(a => { const t = (a.textContent||"").toLowerCase(); const cl = (a.getAttribute('class')||"").toLowerCase(); return k.some(x => t.includes(x)) || c.some(x => cl.includes(x)); });
      const nextAnchor = findLink(['chương tiếp', 'tiếp', 'next', '>>', '→'], ['next', 'fa-arrow-right', 'chapter-next']);
      const prevAnchor = findLink(['chương trước', 'trước', 'prev', '<<', '←'], ['prev', 'fa-arrow-left', 'chapter-prev']);
      
      let nextUrl = null;
      let prevUrl = null;
      if (nextAnchor) { const h = nextAnchor.getAttribute('href'); if (h && !h.startsWith('javascript') && !h.startsWith('#')) nextUrl = new URL(h, targetUrl).href; }
      if (prevAnchor) { const h = prevAnchor.getAttribute('href'); if (h && !h.startsWith('javascript') && !h.startsWith('#')) prevUrl = new URL(h, targetUrl).href; }

      // --- TRÍCH XUẤT TIÊU ĐỀ CHƯƠNG ---
      let chapterTitle = "";
      const titleSelectors = [
          '.current-chapter',
          '#current-chapter',
          '.current_chapter', 
          '#chapter-text',
          'h1', 
          '.chapter-title', 
          '.title', 
          '.chal-title', 
          '#chapter-big-container h2', 
          '.box-chap', 
          '.reading-content h2'
      ];
      
      for (const s of titleSelectors) {
          const el = doc.querySelector(s);
          if (el && el.textContent && el.textContent.trim().length > 0) { 
              chapterTitle = el.textContent.trim();
              if (s.includes('current')) break; 
          }
      }

      const selectors = ['.truyen', '#content', '.content', '.chapter-c', '.box-chap', '#chapter-content', '#vung_doc'];
      let storyDiv = null; for (const s of selectors) { storyDiv = doc.querySelector(s); if (storyDiv) break; }
      let contentText = "";
      if (storyDiv) {
          if (chapterTitle) {
             const h1 = storyDiv.querySelector('h1');
             if (h1 && h1.textContent?.includes(chapterTitle.substring(0, 10))) h1.remove();
             const currentChapDiv = storyDiv.querySelector('.current-chapter');
             if (currentChapDiv) currentChapDiv.remove();
          }
          storyDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n')); storyDiv.querySelectorAll('p').forEach(p => p.after('\n')); storyDiv.querySelectorAll('script, style, iframe, .adsbygoogle').forEach(el => el.remove());
          let text = storyDiv.textContent || ""; const txt = document.createElement("textarea"); txt.innerHTML = text; contentText = txt.value.replace(/\n\s*\n/g, '\n\n').trim();
      } else { throw new Error('Không tìm thấy nội dung.'); }

      const fullContent = chapterTitle ? `${chapterTitle}\n\n${contentText}` : contentText;

      return { content: fullContent, nextUrl, prevUrl };
  };

  const fetchTranslation = async (text: string) => {
      const validKeys = apiKeys.filter(k => k && k.trim().length > 0);
      if (validKeys.length === 0) throw new Error("Cần nhập ít nhất 1 API Key.");
      
      let lastError;
      for (const key of validKeys) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Bạn là biên tập viên. Viết lại convert Hán Việt sang thuần Việt, giữ nguyên cấu trúc đoạn văn, không thêm lời dẫn:\n\n` + text }] }] })
            });
            if (response.status === 429) { console.warn(`Key ...${key.slice(-4)} hết quota (429), thử key khác...`); continue; }
            if (!response.ok) throw new Error(`Lỗi API: ${response.status}`);
            const result = await response.json();
            let translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            return translatedText ? translatedText.replace(/^(Đây là bản dịch|Dưới đây là|Bản dịch:).{0,50}\n/i, '').trim() : "";
        } catch (e: any) {
            lastError = e;
            if (e.message && e.message.includes('429')) continue;
        }
      }
      throw lastError || new Error("Tất cả API Key đều lỗi hoặc hết hạn mức (429).");
  };

  // --- PRELOAD LOGIC ---
  useEffect(() => {
      if (isAutoMode && nextChapterUrl && step === 3 && !isPreloading && (!preloadedData || preloadedData.url !== nextChapterUrl)) {
          if (autoStopChapterLimit > 0 && chaptersReadCount >= autoStopChapterLimit) return;
          doPreload();
      }
  }, [isAutoMode, nextChapterUrl, step, preloadedData, isPreloading, autoStopChapterLimit, chaptersReadCount]);

  const doPreload = async () => {
      if (!nextChapterUrl || apiKeys.filter(k => k.trim()).length === 0) return;
      setIsPreloading(true);
      try {
          const data = await fetchRawStoryData(nextChapterUrl);
          if (data.content) {
              const translated = await fetchTranslation(data.content);
              if (translated) {
                  setPreloadedData({
                      url: nextChapterUrl,
                      content: data.content,
                      translatedContent: translated,
                      nextUrl: data.nextUrl,
                      prevUrl: data.prevUrl
                  });
              }
          }
      } catch (e) {
          console.error("Preload error:", e);
      } finally {
          setIsPreloading(false);
      }
  };

  // --- HANDLERS ---
  
  const stopSpeech = useCallback(() => { 
    window.speechSynthesis.cancel(); 
    activeUtterancesRef.current.clear();
    setIsSpeaking(false); setIsPaused(false); setActiveChunkIndex(null); setActiveCharIndex(null); currentChunkIndexRef.current = 0; 
  }, []);

  const loadChapter = async (targetUrl: string, isAutoNav = false) => {
      stopSpeech();
      
      if (isAutoNav && autoStopChapterLimit > 0 && chaptersReadCount >= autoStopChapterLimit) {
          setIsAutoMode(false);
          setError(`Đã dừng tự động sau khi đọc xong ${autoStopChapterLimit} chương.`);
          return;
      }

      if (isAutoNav) {
          setChaptersReadCount(prev => prev + 1);
      }

      if (preloadedData && preloadedData.url === targetUrl) {
          setUrl(targetUrl);
          setContent(preloadedData.content);
          setTranslatedContent(preloadedData.translatedContent);
          setNextChapterUrl(preloadedData.nextUrl);
          setPrevChapterUrl(preloadedData.prevUrl);
          processTranslatedText(preloadedData.translatedContent);
          setStep(3);
          setMobileTab('reader');
          setPreloadedData(null); 
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return; 
      }

      fetchContent(targetUrl);
  };

  const prepareUtterance = useCallback((index: number) => {
    if (index >= chunks.length || index < 0) return null;

    const chunkText = chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => {
         setActiveChunkIndex(index);
         setActiveCharIndex(0);
         currentChunkIndexRef.current = index;
         speechRef.current = utterance;
    };

    utterance.onboundary = (event) => {
         if (event.name === 'word') setActiveCharIndex(event.charIndex);
    };

    utterance.onend = () => {
         activeUtterancesRef.current.delete(utterance);
         setActiveCharIndex(null);
         
         // Queue 2 chunks ahead to keep buffer full
         scheduleNext(index + 2);

         if (index === chunks.length - 1) {
            if (autoModeRef.current && nextChapterUrl) {
                // Wait a bit before loading next chapter to let user hear end
                setTimeout(() => loadChapter(nextChapterUrl, true), 500);
            } else {
                setIsSpeaking(false);
                setIsPaused(false);
            }
         }
    };

    utterance.onerror = (e) => {
         activeUtterancesRef.current.delete(utterance);
         if (e.error !== 'interrupted' && e.error !== 'canceled') {
             console.error('Speech error', e);
             // Skip error?
             scheduleNext(index + 1);
         }
    };

    activeUtterancesRef.current.add(utterance);
    return utterance;
  }, [chunks, speechRate, selectedVoice, nextChapterUrl, loadChapter]); // Removed dependencies that might cause recreating too often if strictly not needed, but here they are needed.

  const scheduleNext = useCallback((index: number) => {
      const u = prepareUtterance(index);
      if (u) {
          window.speechSynthesis.speak(u);
      }
  }, [prepareUtterance]);

  const speakNextChunk = useCallback(() => {
     // Replaced by startSpeakingSequence but keeping name valid for now if referenced elsewhere, 
     // but basically this function is now "Start Sequence"
     window.speechSynthesis.cancel();
     activeUtterancesRef.current.clear();
     
     const startIdx = currentChunkIndexRef.current >= chunks.length ? 0 : currentChunkIndexRef.current;
     
     const u1 = prepareUtterance(startIdx);
     if (u1) window.speechSynthesis.speak(u1);

     const u2 = prepareUtterance(startIdx + 1);
     if (u2) window.speechSynthesis.speak(u2);
     
  }, [prepareUtterance, chunks]); // Simplify dependencies

  const toggleSpeech = useCallback(() => {
    if (voices.length === 0) wakeUpSpeechEngine();
    if (!chunks.length) return;
    if (isSpeaking && !isPaused) { window.speechSynthesis.pause(); setIsPaused(true); } 
    else if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); } 
    else { 
        window.speechSynthesis.cancel(); 
        setIsSpeaking(true); setIsPaused(false); 
        if (currentChunkIndexRef.current >= chunks.length) currentChunkIndexRef.current = 0; 
        speakNextChunk(); 
    }
  }, [chunks, isSpeaking, isPaused, speakNextChunk, voices]);

  const jumpToChunk = useCallback((index: number) => { 
    window.speechSynthesis.cancel(); 
    activeUtterancesRef.current.clear();

    currentChunkIndexRef.current = index; 
    setActiveChunkIndex(index); 
    setActiveCharIndex(null); 
    setIsSpeaking(true); setIsPaused(false); 
    
    // Use timeout to ensure cancel takes effect before queuing
    setTimeout(() => speakNextChunk(), 50); 
  }, [speakNextChunk]);

  const handleScroll = useCallback(() => {
      if (isSpeaking || !containerRef.current) return;
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const containerHeight = containerRef.current.clientHeight;
      const centerLine = containerTop + containerHeight / 3;
      let closestIndex = -1; let minDistance = Infinity;
      chunks.forEach((_, index) => {
          const el = chunkRefs.current[index];
          if (el) {
              const rect = el.getBoundingClientRect();
              const distance = Math.abs(rect.top - centerLine);
              if (distance < minDistance) { minDistance = distance; closestIndex = index; }
          }
      });
      if (closestIndex !== -1 && closestIndex !== currentChunkIndexRef.current) { currentChunkIndexRef.current = closestIndex; }
  }, [chunks, isSpeaking]);

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newRate = parseFloat(e.target.value); setSpeechRate(newRate); if (isSpeaking && !isPaused) { window.speechSynthesis.cancel(); setTimeout(() => speakNextChunk(), 50); }};
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => { const v = voices.find(val => val.name === e.target.value); if (v) { setSelectedVoice(v); if (isSpeaking && !isPaused) { window.speechSynthesis.cancel(); setTimeout(() => speakNextChunk(), 50); }}};

  const analyzeContent = async (type: 'summary' | 'explain') => {
    if (!translatedContent && !content) return;
    const textToAnalyze = translatedContent || content; 
    const validKeys = apiKeys.filter(k => k.trim());
    if (validKeys.length === 0) { setError('Cần nhập API Key.'); setShowApiKeyInput(true); return; }
    setAnalyzing(true); setAnalysisType(type); setAnalysisResult('');
    
    let lastError;
    let success = false;
    for (const key of validKeys) {
        try {
            let prompt = type === 'summary' ? `Bạn là trợ lý văn học. Tóm tắt 3-5 ý chính của đoạn này:` : `Giải thích thuật ngữ Tiên Hiệp/Hán Việt khó hiểu:`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt + "\n\n" + textToAnalyze }] }] }) });
            if (response.status === 429) continue;
            if (!response.ok) throw new Error(`Lỗi API: ${response.status}`);
            const result = await response.json();
            setAnalysisResult(result.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có kết quả.');
            success = true;
            break;
        } catch (err: any) { lastError = err; if (err.message && err.message.includes('429')) continue; }
    }
    if (!success) setAnalysisResult(`Lỗi: ${lastError?.message || 'Không thể gọi AI'}`);
    setAnalyzing(false);
  };

  const updateKey = (index: number, val: string) => {
      const newKeys = [...apiKeys];
      newKeys[index] = val;
      setApiKeys(newKeys);
      localStorage.setItem('gemini_api_keys', JSON.stringify(newKeys));
  };
  // const clearKey removed, used updateKey(i, '')

  const fetchContent = async (overrideUrl?: string) => {
    const urlToFetch = overrideUrl || url;
    if (!urlToFetch && inputMode === 'url') return;
    if (inputMode === 'manual' && !content) { setError('Vui lòng dán nội dung.'); return; }
    setLoading(true); setError(''); setContent(''); setTranslatedContent(''); setChunks([]); setAnalysisType(null); setStep(1); stopSpeech(); setNextChapterUrl(null); setPrevChapterUrl(null); setPreloadedData(null); setChaptersReadCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
        if (inputMode === 'url') {
            const data = await fetchRawStoryData(urlToFetch);
            setContent(data.content);
            setNextChapterUrl(data.nextUrl);
            setPrevChapterUrl(data.prevUrl);
            setStep(2);
        } else { setContent(content); setStep(2); }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const translateContent = async () => {
    if (!content) return; if (apiKeys.filter(k => k.trim()).length === 0) { setError('Cần nhập API Key.'); setShowApiKeyInput(true); return; }
    setTranslating(true); setError(''); stopSpeech(); setChunks([]); setAnalysisType(null);
    try {
      const translated = await fetchTranslation(content);
      setTranslatedContent(translated); processTranslatedText(translated); setStep(3); setMobileTab('reader');
    } catch (err: any) { setError(err.message || 'Lỗi khi gọi AI.'); } finally { setTranslating(false); }
  };

  const processTranslatedText = (text: string) => { if (!text) return; const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0); setChunks(paragraphs); };
  const formatVoiceName = (name: string) => { if (name.includes('HoaiMy')) return '✨ Hoài My'; if (name.includes('NamMinh')) return 'Nam Minh'; return name.replace('Microsoft Server Speech Text to Speech Voice (vi-VN, ', '').replace('Microsoft ', '').replace(')', ''); };

  // --- AUTO TRIGGERS ---
  useEffect(() => {
    if (isAutoMode && step === 2 && content && !translating && !translatedContent) { const t = setTimeout(() => translateContent(), 500); return () => clearTimeout(t); }
  }, [step, content, isAutoMode, translating, translatedContent]);

  useEffect(() => {
    if (isAutoMode && step === 3 && chunks.length > 0 && !isSpeaking && !isPaused) { const t = setTimeout(() => { currentChunkIndexRef.current = 0; speakNextChunk(); setIsSpeaking(true); }, 1000); return () => clearTimeout(t); }
  }, [step, chunks, isAutoMode, isSpeaking, isPaused, speakNextChunk]);

  useEffect(() => {
    if (activeChunkIndex !== null && chunkRefs.current[activeChunkIndex]) { chunkRefs.current[activeChunkIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, [activeChunkIndex]);

  return (
    <div className="flex flex-col h-[100dvh] sm:h-full bg-slate-50 font-sans text-slate-800">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,300;400;500;600&display=swap'); .font-literata { font-family: 'Literata', serif; }`}</style>
      <div className="w-full h-full sm:max-w-6xl sm:mx-auto sm:bg-white sm:shadow-xl sm:rounded-xl overflow-hidden sm:border border-slate-200 sm:m-4 flex flex-col">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-3 sm:p-4 text-white flex flex-row items-center justify-between shadow-md shrink-0 z-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg"><BookOpen size={20} className="text-white"/></div>
            <div><h1 className="text-lg sm:text-xl font-bold tracking-wide">AI Dịch Truyện <span className="text-xs font-normal opacity-70">ver 1.1</span></h1><p className="text-[10px] sm:text-xs text-blue-200 hidden sm:block">Convert &rarr; Thuần Việt</p></div>
          </div>
          <div className="flex items-center gap-2">
             {mobileTab === 'reader' && (
                 <button onClick={() => setMobileTab('input')} className="lg:hidden flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors border border-white/10">
                    <ArrowLeft size={14}/> <span className="hidden xs:inline">Nhập Link</span>
                 </button>
             )}
             
             {mobileTab === 'input' && translatedContent && (
                 <button onClick={() => setMobileTab('reader')} className="lg:hidden flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 rounded-full transition-colors text-emerald-100 border border-emerald-500/30">
                    <span className="hidden xs:inline">Đọc tiếp</span> <BookOpen size={14}/> <ArrowRight size={12}/>
                 </button>
             )}

             <button onClick={() => setShowApiKeyInput(!showApiKeyInput)} className={`text-xs flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors ${apiKeys.some(k => k) ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'}`}>
                <Key size={14} /> {apiKeys.filter(k => k).length} Key
             </button>
          </div>
        </div>
        {showApiKeyInput && (
            <div className="bg-yellow-50 border-b border-yellow-100 p-3 shrink-0">
                <div className="max-w-3xl mx-auto flex flex-col gap-2 text-sm">
                    <span className="text-yellow-800 font-medium flex items-center gap-2"><Key size={16}/> Nhập 3 Key (Hệ thống sẽ thử lần lượt nếu bị giới hạn 429):</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {apiKeys.map((k, i) => (
                            <div key={i} className="relative">
                                <input 
                                    type="password" 
                                    placeholder={`API Key ${i + 1}...`} 
                                    value={k} 
                                    onChange={(e) => updateKey(i, e.target.value)} 
                                    className="w-full px-3 py-2 border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-xs" 
                                />
                                {k && <button onClick={() => updateKey(i, '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        <div className="flex-1 overflow-hidden flex flex-col p-2 sm:p-6 gap-4">
          <div className={`${mobileTab === 'reader' ? 'hidden lg:flex' : 'flex'} flex-col gap-2 h-full lg:w-1/2`}>
             <div className="flex-col gap-2 shrink-0">
                <div className="flex gap-2 border-b border-slate-200 mb-2"><button onClick={() => setInputMode('url')} className={`pb-2 text-sm font-medium flex items-center gap-2 flex-1 justify-center ${inputMode === 'url' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}><Globe size={16}/> Lấy Link</button><button onClick={() => setInputMode('manual')} className={`pb-2 text-sm font-medium flex items-center gap-2 flex-1 justify-center ${inputMode === 'manual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}><Edit3 size={16}/> Thủ công</button></div>
                <div className="flex gap-2">{inputMode === 'url' ? (<React.Fragment><div className="relative flex-1 group"><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dán link truyện..." className="block w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 shadow-sm" /></div><button onClick={() => fetchContent()} disabled={loading || !url} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg font-medium flex items-center justify-center gap-2 disabled:bg-slate-300 shadow-sm min-w-[50px]">{loading ? <RotateCw className="animate-spin" size={20}/> : <Search size={20}/>}</button></React.Fragment>) : (<div className="w-full text-sm text-slate-500 italic py-2 text-center">Dán nội dung vào khung bên dưới</div>)}</div>
             </div>
             {error && <div className="shrink-0 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm flex gap-2 border border-red-100"><AlertCircle size={16} className="shrink-0 mt-0.5"/> {error}</div>}
             <div className="flex-1 flex flex-col min-h-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center rounded-t-lg"><span className="font-semibold text-slate-700 text-sm flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-400"></div> Bản Gốc</span><span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{content.length} ký tự</span></div>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} readOnly={inputMode === 'url'} className="flex-1 w-full p-4 resize-none focus:outline-none text-slate-600 font-mono text-sm leading-relaxed bg-slate-50/30" placeholder="Nội dung truyện sẽ hiện ở đây..." />
                <div className="p-3 border-t border-slate-100 lg:hidden"><button onClick={translateContent} disabled={translating || !content} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform">{translating ? <React.Fragment><RotateCw className="animate-spin" size={20}/> Đang xử lý...</React.Fragment> : <React.Fragment><Sparkles size={20}/> Dịch Ngay</React.Fragment>}</button></div>
             </div>
          </div>
          <div className="hidden lg:flex flex-col items-center justify-center gap-2 shrink-0"><button onClick={translateContent} disabled={translating || !content} className="group flex items-center justify-center gap-2 bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-700 text-white px-3 py-8 rounded-full font-bold shadow-lg active:scale-95 lg:w-12 lg:writing-mode-vertical-rl transition-all hover:shadow-indigo-500/50" title="Dịch sang thuần Việt">{translating ? <Sparkles className="animate-spin" size={20} /> : <Sparkles size={20} />} <span className="mt-2 text-xs opacity-80 font-normal">DỊCH</span></button></div>
          <div className={`${mobileTab === 'input' ? 'hidden lg:flex' : 'flex'} flex-col h-full lg:w-1/2 min-h-0 bg-white lg:rounded-lg rounded-none border-0 lg:border border-slate-200 lg:shadow-sm relative`}>
              <div className="p-2 border-b border-slate-100 bg-indigo-50/50 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                   <button onClick={() => setShowMobileSettings(!showMobileSettings)} className="lg:hidden p-2 bg-white rounded-full text-slate-600 shadow-sm border border-slate-200"><Settings size={18}/></button>

                   {isAutoMode && nextChapterUrl && (
                        preloadedData ? 
                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-white px-2 py-1.5 rounded-full border border-emerald-200 shadow-sm animate-in fade-in whitespace-nowrap"><CheckCircle2 size={12}/> <span className="hidden xs:inline">Sẵn sàng</span></div> :
                        <div className="flex items-center gap-1 text-[10px] font-medium text-purple-600 bg-white px-2 py-1.5 rounded-full border border-purple-200 shadow-sm whitespace-nowrap"><RotateCw size={12} className="animate-spin"/> <span className="hidden xs:inline">Đang tải...</span></div>
                   )}

                   <div className="hidden lg:flex items-center gap-2">
                       <button onClick={() => setIsAutoMode(!isAutoMode)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${isAutoMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-md animate-pulse' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}><InfinityIcon size={14} /> {isAutoMode ? 'Auto' : 'Auto'}</button>
                       <div className="relative"><button onClick={() => setShowTimerMenu(!showTimerMenu)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${timeLeft || autoStopChapterLimit ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-slate-500 border-slate-300'}`}>{timeLeft ? <React.Fragment><Timer size={14} className="animate-pulse"/> {formatTime(timeLeft)}</React.Fragment> : autoStopChapterLimit ? <React.Fragment><Hash size={14}/> {autoStopChapterLimit - chaptersReadCount} ch</React.Fragment> : <React.Fragment><Clock size={14}/> Hẹn giờ</React.Fragment>}</button>{showTimerMenu && (<div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-lg z-50 w-40 py-1 flex flex-col"><div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase">Hẹn giờ tắt</div>{[15, 30, 60].map(m => (<button key={m} onClick={() => setTimer(m)} className="px-4 py-2 text-left text-sm hover:bg-slate-50 text-slate-700">{m} phút</button>))}<div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase border-t border-slate-100 mt-1">Dừng theo chương</div>{[1, 5, 10].map(c => (<button key={c} onClick={() => setChapterLimit(c)} className="px-4 py-2 text-left text-sm hover:bg-slate-50 text-slate-700">{c} chương</button>))}{(timeLeft || autoStopChapterLimit > 0) && (<button onClick={() => { setTimeLeft(null); setAutoStopChapterLimit(0); setShowTimerMenu(false); }} className="px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 border-t border-slate-100 font-bold">Tắt hẹn giờ</button>)}</div>)}</div>
                   </div>
                </div>
                <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-full border border-indigo-100 shadow-sm ml-auto">
                   {/* Removed old preloadedData indicator */}
                   <button onClick={toggleSpeech} disabled={!chunks.length} className="p-2 hover:bg-indigo-100 text-indigo-700 rounded-full transition-colors">{isSpeaking && !isPaused ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button>
                   <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused} className="p-2 hover:bg-red-100 text-red-600 rounded-full transition-colors"><Square size={20} fill="currentColor"/></button>
                </div>
              </div>
              {showMobileSettings && (<div className="lg:hidden absolute top-[50px] left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-30 p-4 animate-in slide-in-from-top-5 grid grid-cols-2 gap-3"><div className="col-span-2 text-xs font-bold text-slate-400 uppercase">Cài đặt đọc</div><button onClick={() => setIsAutoMode(!isAutoMode)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${isAutoMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}><InfinityIcon size={16} /> Chế độ Auto {isAutoMode ? 'BẬT' : 'TẮT'}</button><button onClick={() => setShowTimerMenu(!showTimerMenu)} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${timeLeft || autoStopChapterLimit ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{timeLeft ? <React.Fragment><Timer size={16}/> {formatTime(timeLeft)}</React.Fragment> : autoStopChapterLimit ? <React.Fragment><Hash size={16}/> Dừng sau {autoStopChapterLimit} chương</React.Fragment> : <React.Fragment><Clock size={16}/> Hẹn giờ tắt</React.Fragment>}</button>{showTimerMenu && <div className="col-span-2 grid grid-cols-3 gap-2 pb-2"><div className="col-span-3 text-[10px] text-slate-400 font-bold uppercase">Hẹn giờ (phút)</div>{[15, 30, 60].map(m => (<button key={m} onClick={() => setTimer(m)} className="px-2 py-1 bg-slate-100 rounded text-xs">{m}p</button>))}<div className="col-span-3 text-[10px] text-slate-400 font-bold uppercase mt-2">Dừng sau (chương)</div>{[1, 5, 10].map(c => (<button key={c} onClick={() => setChapterLimit(c)} className="px-2 py-1 bg-slate-100 rounded text-xs">{c} chương</button>))}{(timeLeft || autoStopChapterLimit > 0) && <button onClick={() => {setTimeLeft(null); setAutoStopChapterLimit(0); setShowTimerMenu(false); setShowMobileSettings(false);}} className="col-span-3 px-3 py-2 bg-red-100 text-red-600 rounded text-xs font-bold mt-2">Tắt Hẹn Giờ</button>}</div>}<div className="col-span-2 mt-2 text-xs font-bold text-slate-400 uppercase flex justify-between items-center"><span>Giọng đọc & Tốc độ</span><span className="text-[10px] text-slate-400 font-normal">{voiceDebugMsg}</span></div><div className="col-span-2 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200"><select className="flex-1 text-sm bg-transparent focus:outline-none text-slate-700 py-1" onChange={handleVoiceChange} value={selectedVoice?.name || ""}>{voices.length === 0 && <option>Đang tải giọng...</option>}{voices.length > 0 && voices.filter(v => v.lang.includes('vi') || v.lang.includes('VN')).length === 0 && <option>Không tìm thấy giọng Việt</option>}{voices.map(v => <option key={v.name} value={v.name}>{formatVoiceName(v.name)}</option>)}</select><button onClick={wakeUpSpeechEngine} className="p-2 bg-white rounded shadow-sm border border-slate-300 active:bg-slate-100" title="Thử tải lại giọng"><RefreshCw size={14}/></button></div><div className="col-span-2 flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200"><span className="text-xs font-bold text-slate-500 w-8">{speechRate}x</span><input type="range" min="0.5" max="2.0" step="0.1" value={speechRate} onChange={handleRateChange} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/></div><div className="col-span-2 mt-2 text-xs font-bold text-slate-400 uppercase">Tiện ích AI</div><button onClick={() => {analyzeContent('summary'); setShowMobileSettings(false);}} className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm"><FileText size={16}/> Tóm tắt chương</button><button onClick={() => {analyzeContent('explain'); setShowMobileSettings(false);}} className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm"><HelpCircle size={16}/> Giải thích từ khó</button></div>)}
              <div className="flex-1 relative bg-[#fffdf5] overflow-hidden">
                 {analysisType && (<div className="absolute inset-x-0 bottom-0 bg-white border-t border-slate-200 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)] z-20 flex flex-col max-h-[60%] animate-in slide-in-from-bottom-10 rounded-t-2xl"><div className="flex justify-between p-3 bg-slate-50 border-b rounded-t-2xl"><span className="font-bold text-sm text-slate-700 flex items-center gap-2"><Sparkles size={16} className="text-purple-500"/> AI Phân Tích</span><button onClick={() => setAnalysisType(null)} className="p-1 bg-slate-200 rounded-full"><X size={16}/></button></div><div className="p-5 overflow-y-auto text-sm leading-loose text-slate-700 whitespace-pre-line font-medium">{analyzing ? <span className="flex items-center gap-2 text-slate-500"><RotateCw className="animate-spin" size={16}/> Đang suy nghĩ...</span> : analysisResult}</div></div>)}
                 {translating && <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 backdrop-blur-sm"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div><p className="text-sm font-medium text-indigo-600 animate-pulse">Đang dịch & chuẩn bị đọc...</p></div>}
                 <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto p-4 md:p-8 font-literata text-lg leading-loose text-slate-800 pb-32 scroll-smooth">
                    {chunks.length > 0 ? (
                        <React.Fragment>
                            {chunks.map((chunk, index) => (
                                <ParagraphItem key={index} index={index} text={chunk} isActive={activeChunkIndex === index} activeCharIndex={activeChunkIndex === index ? activeCharIndex : null} onClick={jumpToChunk} setRef={(el: any) => chunkRefs.current[index] = el} />
                            ))}
                            <div className="mt-12 flex flex-col gap-3 pt-6 border-t border-slate-200 border-dashed pb-10">
                                <div className="flex justify-between items-center w-full">
                                    {prevChapterUrl ? <button onClick={() => loadChapter(prevChapterUrl)} className="text-slate-600 hover:text-blue-600 flex items-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors font-medium text-sm"><ChevronLeft size={18}/> Chương trước</button> : <div/>}
                                    {nextChapterUrl ? (<button onClick={() => loadChapter(nextChapterUrl)} className={`flex-1 ml-4 px-4 py-3 rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transform transition hover:scale-[1.02] active:scale-95 ${isAutoMode ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white animate-pulse' : 'bg-indigo-600 text-white'}`}>{isAutoMode ? 'Auto chuyển...' : 'Chương tiếp'} <ChevronRight size={18}/></button>) : <span className="text-slate-400 italic text-sm">Hết chương</span>}
                                </div>
                            </div>
                        </React.Fragment>
                    ) : (<div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2"><BookOpen size={48} className="opacity-20"/><span className="italic">Chưa có nội dung...</span></div>)}
                 </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}