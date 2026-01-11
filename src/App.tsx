import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Search, AlertCircle, BookOpen, ArrowRight, Sparkles, Key, RotateCw, Trash2, Play, Pause, Square, Edit3, Globe, FileText, HelpCircle, X, ChevronRight, ChevronLeft, Infinity as InfinityIcon, Settings, CheckCircle2, History as HistoryIcon, Home, Palette, Clock } from 'lucide-react';

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
  const [translationStyle, setTranslationStyle] = useState<'modern' | 'ancient'>('modern');
  
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
  
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // --- PRELOAD STATES ---
  const [preloadedData, setPreloadedData] = useState<any>(null);
  const [isPreloading, setIsPreloading] = useState(false);

  // --- NEW FEATURES STATES ---
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [fontSize, setFontSize] = useState(18);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  // --- CACHE STATE ---
  const [translatedChapters, setTranslatedChapters] = useState<any[]>([]); // New state for cache
  const [showCache, setShowCache] = useState(false); // To show "Chương đã dịch" list

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
    
    // Load Settings & History
    const savedTheme = localStorage.getItem('reader_theme') as any;
    if (savedTheme) setTheme(savedTheme);
    const savedSize = localStorage.getItem('reader_font_size');
    if (savedSize) setFontSize(parseInt(savedSize));
    const savedHistory = localStorage.getItem('reader_history');
    if (savedHistory) {
        try { setHistory(JSON.parse(savedHistory)); } catch {}
    }
    const savedTranslated = localStorage.getItem('reader_translated_cache');
    if (savedTranslated) {
        try { setTranslatedChapters(JSON.parse(savedTranslated)); } catch {}
    }
  }, []);

  const saveToHistory = (url: string, contentSnippet: string) => {
      if (!url) return;
      // Extract title from content or url
      let title = "Chương không tên";
      const lines = contentSnippet.split('\n');
      if (lines.length > 0) title = lines[0].substring(0, 50);
      else title = url.split('/').pop() || "Link";

      // History now just saves reading progress/link, not necessarily full content if we use cache
      const newItem = { url, title, timestamp: Date.now() }; // Simplified history item
      const newHistory = [newItem, ...history.filter(h => h.url !== url)].slice(0, 50); 
      setHistory(newHistory);
      localStorage.setItem('reader_history', JSON.stringify(newHistory));
  };
  
  const saveToCache = (url: string, content: string, translatedContent: string, nextUrl: string | null, prevUrl: string | null) => {
      if (!url || !translatedContent) return;
      
      let title = "Chương không tên";
      const lines = translatedContent.split('\n');
      if (lines.length > 0) title = lines[0].substring(0, 50);
      
      const newItem = { url, title, content, translatedContent, nextUrl, prevUrl, timestamp: Date.now() };
      
      // Update cache: remove old entry for same URL, add new to top
      const newCache = [newItem, ...translatedChapters.filter(c => c.url !== url)].slice(0, 20); // Limit to 20 chapters to save space
      setTranslatedChapters(newCache);
      localStorage.setItem('reader_translated_cache', JSON.stringify(newCache));
  };


  const changeTheme = (t: 'light' | 'dark' | 'sepia') => {
      setTheme(t);
      localStorage.setItem('reader_theme', t);
  };

  const changeFontSize = (s: number) => {
      setFontSize(s);
      localStorage.setItem('reader_font_size', s.toString());
  };

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

  const setTimer = (m: number) => { setTimeLeft(m * 60); setShowMobileSettings(false); };
  const setChapterLimit = (c: number) => { setAutoStopChapterLimit(c); setChaptersReadCount(0); setShowMobileSettings(false); };
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
      // GEMINI LOGIC
      const validKeys = apiKeys.filter(k => k && k.trim().length > 0);
      if (validKeys.length === 0) throw new Error("Cần nhập ít nhất 1 API Key.");
      
      let lastError;
      const promptText = translationStyle === 'ancient' 
        ? `Bạn là biên tập viên truyện Tiên Hiệp/Kiếm Hiệp/Cổ Trang lão luyện. Hãy viết lại đoạn convert Hán Việt sau sang thuần Việt mượt mà, sử dụng văn phong hào hùng, cổ kính, dùng các từ ngữ phù hợp bối cảnh xưa (huynh đệ, tại hạ, cô nương, v.v...). Giữ nguyên cấu trúc đoạn văn, tuyệt đối không thêm lời dẫn:\n\n`
        : `Bạn là biên tập viên truyện hiện đại chuyên nghiệp. Hãy viết lại đoạn convert Hán Việt sau sang tiếng Việt hiện đại, văn phong tự nhiên, dễ hiểu, phù hợp với truyện đô thị/ngôn tình hiện đại (dùng anh/em/cậu/tớ tùy ngữ cảnh). Giữ nguyên cấu trúc đoạn văn, tuyệt đối không thêm lời dẫn:\n\n`;

      for (const key of validKeys) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText + text }] }] })
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

      // Check cache first
      const cached = translatedChapters.find(c => c.url === nextChapterUrl);
      if (cached) {
          setPreloadedData({
              url: nextChapterUrl,
              content: cached.content,
              translatedContent: cached.translatedContent,
              nextUrl: cached.nextUrl,
              prevUrl: cached.prevUrl
          });
          return;
      }

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
                  // Also save to cache immediately
                  saveToCache(nextChapterUrl, data.content, translated, data.nextUrl, data.prevUrl);
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

      // CHECK CACHE FIRST
      const cached = translatedChapters.find(c => c.url === targetUrl);
      if (cached) {
          setUrl(targetUrl);
          setContent(cached.content);
          setTranslatedContent(cached.translatedContent);
          setNextChapterUrl(cached.nextUrl);
          setPrevChapterUrl(cached.prevUrl);
          processTranslatedText(cached.translatedContent);
          setStep(3);
          setMobileTab('reader');
          saveToHistory(targetUrl, cached.translatedContent); // Log viewing
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
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
          saveToHistory(targetUrl, preloadedData.translatedContent);
          saveToCache(targetUrl, preloadedData.content, preloadedData.translatedContent, preloadedData.nextUrl, preloadedData.prevUrl); // Save to cache confirmed
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
         if (!activeUtterancesRef.current.has(utterance)) return;
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
         if (!activeUtterancesRef.current.has(utterance)) return;
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
    if (isSpeaking && !isPaused) { 
        // Force Pause (actually Cancel + Save State)
        activeUtterancesRef.current.clear();
        window.speechSynthesis.cancel();
        setIsPaused(true); 
    } 
    else if (isPaused) { 
        // Resume from current pos
        setIsPaused(false); 
        speakNextChunk();
    } 
    else { 
        // Start fresh or from existing index (if stopped/reset)
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
    
    // GEMINI LOGIC
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
    if (!content) return; 
    
    if (apiKeys.filter(k => k.trim()).length === 0) {
        setError('Cần nhập API Key.'); setShowApiKeyInput(true); return;
    }

    setTranslating(true); setError(''); stopSpeech(); setChunks([]); setAnalysisType(null);
    try {
      const translated = await fetchTranslation(content);
      setTranslatedContent(translated); processTranslatedText(translated); setStep(3); setMobileTab('reader');
      saveToHistory(url || nextChapterUrl || "", translated);
      saveToCache(url || nextChapterUrl || "", content, translated, nextChapterUrl, prevChapterUrl); // Updated to saveNext/Prev might be tricky here as state relies on fetch
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
    <div className="flex h-[100dvh] w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,300;400;500;600&display=swap'); .font-literata { font-family: 'Literata', serif; }`}</style>
      
      {/* --- MOBILE NAV (BOTTOM) --- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-white border-t border-slate-200 z-50 flex justify-around items-center px-2 pb-safe shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
         <button onClick={() => setMobileTab('input')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${mobileTab === 'input' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <Home size={20} /> <span className="text-[10px] font-bold">Home</span>
         </button>
         <button onClick={() => setMobileTab('reader')} className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${mobileTab === 'reader' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <BookOpen size={20} /> <span className="text-[10px] font-bold">Đọc</span>
             {chunks.length > 0 && <span className="absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
         </button>
         <button onClick={() => setShowHistory(true)} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showHistory ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <HistoryIcon size={20} /> <span className="text-[10px] font-bold">Lịch sử</span>
         </button>
         <button onClick={() => setShowCache(true)} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showCache ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <CheckCircle2 size={20} /> <span className="text-[10px] font-bold">Kho</span>
         </button>
      </div>

      {/* --- SIDEBAR (INPUT & TOOLS) --- */}
      <div className={`
         fixed inset-0 z-40 bg-white md:relative md:w-[400px] lg:w-[450px] md:border-r border-slate-200 shadow-xl flex flex-col transition-transform duration-300 md:translate-x-0
         ${mobileTab === 'input' ? 'translate-x-0' : '-translate-x-full'}
      `}>
          {/* Sidebar Header */}
          <div className="shrink-0 p-4 bg-gradient-to-r from-indigo-700 to-purple-800 text-white shadow-md flex justify-between items-center">
             <div>
                <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight"><Sparkles size={20} className="text-yellow-300"/> AI Reader Preview</h1>
                <p className="text-[10px] text-indigo-200 opacity-80">Convert hán việt sang thuần việt</p>
             </div>
             <div className="flex gap-2">
                <button onClick={() => setShowHistory(true)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="Lịch sử đọc"><HistoryIcon size={18}/></button>
                <button onClick={() => setShowCache(true)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="Kho đã dịch"><CheckCircle2 size={18}/></button>
                <button onClick={() => setShowApiKeyInput(!showApiKeyInput)} className={`p-2 rounded-full transition-colors text-white ${apiKeys.some(k => k) ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100' : 'bg-red-500/20 hover:bg-red-500/30 text-red-100 animate-pulse'}`} title="API Key"><Key size={18}/></button>
             </div>
          </div>

          {/* Sidebar Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 md:custom-scrollbar pb-24 md:pb-4">
             {/* API Key Panel */}
             {showApiKeyInput && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between mb-2"><span className="text-xs font-bold text-yellow-800 uppercase">Cấu hình API Key (Gemini)</span><button onClick={() => setShowApiKeyInput(false)}><X size={14} className="text-yellow-600"/></button></div>
                    <div className="space-y-2">
                        {apiKeys.map((k, i) => (
                            <div key={i} className="relative flex items-center">
                                <span className="absolute left-2 text-[10px] font-bold text-slate-400">#{i+1}</span>
                                <input type="password" value={k} onChange={(e) => updateKey(i, e.target.value)} className="w-full pl-8 pr-8 py-2 text-xs border border-yellow-300 rounded focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 bg-white" placeholder="Dán API Key vào đây..."/>
                                {k && <button onClick={() => updateKey(i, '')} className="absolute right-2 text-slate-400 hover:text-red-500"><Trash2 size={12}/></button>}
                            </div>
                        ))}
                    </div>
                </div>
             )}

             {/* Mode Switcher */}
             <div className="flex flex-col gap-2">
                 <div className="flex p-1 bg-slate-100 rounded-xl shadow-inner">
                     <button onClick={() => setInputMode('url')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'url' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Globe size={16}/> Link Web</button>
                     <button onClick={() => setInputMode('manual')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${inputMode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Edit3 size={16}/> Text Gốc</button>
                 </div>
                 
                 {/* Translation Style Switcher */}
                 <div className="flex p-1 bg-slate-100 rounded-xl shadow-inner">
                     <button onClick={() => setTranslationStyle('ancient')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${translationStyle === 'ancient' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-500 hover:text-slate-700'}`}><FileText size={14}/> Cổ Trang</button>
                     <button onClick={() => setTranslationStyle('modern')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${translationStyle === 'modern' ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-700'}`}><Sparkles size={14}/> Hiện Đại</button>
                 </div>
             </div>

             {/* Input Area */}
             <div className="space-y-3">
                 {inputMode === 'url' ? (
                     <div className="relative group">
                         <div className="absolute top-2.5 left-3 text-slate-400"><Search size={18}/></div>
                         <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dán link chương truyện (metruyencv, wikidich...)" className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-sm"/>
                         <button onClick={() => fetchContent()} disabled={loading} className="absolute right-2 top-1.5 p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors">{loading ? <RotateCw className="animate-spin" size={16}/> : <ArrowRight size={16}/>}</button>
                     </div>
                 ) : (
                     <div className="text-xs text-slate-400 italic text-center px-4">Dán trực tiếp nội dung chương truyện vào ô bên dưới để dịch.</div>
                 )}

                 {error && <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-lg flex gap-2 items-start"><AlertCircle size={14} className="shrink-0 mt-0.5"/> {error}</div>}

                 <div className="relative flex flex-col h-64 md:h-[calc(100vh-420px)] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 ring-offset-2">
                     <div className="flex justify-between items-center p-2 bg-slate-50 border-b border-slate-100">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-2">Nội dung gốc</span>
                         {content.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{content.length} chars</span>}
                     </div>
                     <textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)} 
                        readOnly={inputMode === 'url'}
                        placeholder="Nội dung sẽ hiển thị ở đây..."
                        className="flex-1 w-full p-4 resize-none focus:outline-none text-sm text-slate-600 font-mono leading-relaxed bg-slate-50/50"
                     />
                     <button 
                        onClick={translateContent} 
                        disabled={translating || !content} 
                        className={`absolute bottom-4 right-4 shadow-lg flex items-center gap-2 px-6 py-2 rounded-full font-bold text-white transition-all transform active:scale-95 z-10 
                            ${translating ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-indigo-500/30'}
                        `}
                     >
                        {translating ? <><RotateCw className="animate-spin" size={16}/> Đang dịch...</> : <><Sparkles size={16}/> Dịch Sang Việt</>}
                     </button>
                 </div>
             </div>
          </div>
      </div>

      {/* --- READER MAIN AREA --- */}
      <div className={`
         fixed inset-0 z-30 md:static bg-slate-50 flex flex-col transition-transform duration-300 md:translate-x-0
         ${mobileTab === 'reader' ? 'translate-x-0' : 'translate-x-full'}
      `}>
         {/* Reader Toolbar */}
         <div className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 shrink-0 relative z-20">
             <div className="flex flex-col">
                <span className="font-bold text-slate-700 text-sm line-clamp-1 max-w-[200px] md:max-w-md">Trình đọc AI</span>
                {isAutoMode ? (
                    preloadedData ? 
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={10}/> Sẵn sàng chương sau</span> :
                    <span className="text-[10px] text-orange-500 font-medium flex items-center gap-1"><RotateCw size={10} className="animate-spin"/> Đang tải chương sau...</span>
                ) : (
                    translatedContent && <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={10}/> Đã dịch xong</span>
                )}
            </div>

             <div className="flex items-center gap-2 md:gap-4">
                 {/* Desktop Audio Controls */}
                 <div className="hidden md:flex bg-slate-100 rounded-full p-1 items-center gap-1 border border-slate-200">
                    <button onClick={toggleSpeech} disabled={!chunks.length} className={`p-2 rounded-full transition-colors ${isSpeaking && !isPaused ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white text-slate-600'}`}>{isSpeaking && !isPaused ? <Pause size={18}/> : <Play size={18}/>}</button>
                    <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused} className="p-2 hover:bg-white text-slate-600 rounded-full transition-colors"><Square size={18}/></button>
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <button onClick={() => setIsAutoMode(!isAutoMode)} className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1 ${isAutoMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}><InfinityIcon size={14}/> Auto</button>
                 </div>
                 
                 {/* Theme & Settings Trigger */}
                 <div className="flex items-center gap-2">
                    <button onClick={() => setShowAppearance(!showAppearance)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Giao diện"><Palette size={20}/></button>
                    <button onClick={() => setShowMobileSettings(true)} className="md:hidden p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"><Settings size={20}/></button>
                 </div>
             </div>
         </div>

         {/* Reading Content */}
         <div className={`flex-1 relative overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1a1b26]' : theme === 'sepia' ? 'bg-[#f8f4e5]' : 'bg-white'}`}>
             {/* Text Render */}
             <div 
                ref={containerRef} 
                onScroll={handleScroll}
                className={`
                    w-full h-full overflow-y-auto p-5 md:p-12 pb-32 md:pb-20 scroll-smooth custom-scrollbar
                    ${theme === 'dark' ? 'text-slate-300' : theme === 'sepia' ? 'text-[#5b4636]' : 'text-slate-800'}
                `}
                style={{ fontSize: `${fontSize}px`, fontFamily: "'Literata', serif", lineHeight: "1.8" }}
             >
                {chunks.length > 0 ? (
                    <div className="max-w-3xl mx-auto">
                        {chunks.map((chunk, index) => (
                            <ParagraphItem key={index} index={index} text={chunk} isActive={activeChunkIndex === index} activeCharIndex={activeChunkIndex === index ? activeCharIndex : null} onClick={jumpToChunk} setRef={(el: any) => chunkRefs.current[index] = el} />
                        ))}

                        <div className="mt-16 flex flex-col items-center gap-4 py-8 border-t border-dashed border-slate-300/30">
                            <div className="flex w-full gap-4 max-w-md">
                                {prevChapterUrl && <button onClick={() => loadChapter(prevChapterUrl)} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition-colors flex items-center justify-center gap-2"><ChevronLeft size={16}/> Trước</button>}
                                {nextChapterUrl ? (
                                    <button 
                                        onClick={() => loadChapter(nextChapterUrl)} 
                                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 transform active:scale-95 ${isAutoMode ? 'bg-gradient-to-r from-purple-600 to-indigo-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                    >
                                        {isAutoMode ? 'Đang Auto...' : 'Chương Sau'} <ChevronRight size={16}/>
                                    </button>
                                ) : <div className="flex-1 text-center text-slate-400 italic text-sm py-2">Hết chương</div>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-300 select-none">
                        <BookOpen size={64} className="opacity-20"/>
                        <p className="text-lg font-medium opacity-50">Chọn nội dung để bắt đầu đọc</p>
                    </div>
                )}
             </div>

             {/* Translator loading overlay */}
             {translating && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 animate-pulse" size={24}/>
                    </div>
                    <p className="mt-4 text-indigo-800 font-bold animate-pulse">Đang dịch thuật...</p>
                    <p className="text-xs text-indigo-400 max-w-xs text-center mt-2">AI đang xử lý ngôn ngữ tự nhiên để tạo bản dịch mượt mà nhất.</p>
                </div>
             )}

             {/* AI Analysis Result Panel */}
             {analysisType && (
                 <div className="absolute bottom-0 left-0 right-0 max-h-[70%] bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-2xl z-40 flex flex-col animate-in slide-in-from-bottom-10">
                     <div className="p-3 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                         <span className="font-bold text-indigo-700 flex items-center gap-2"><Sparkles size={16}/> AI Phân Tích</span>
                         <button onClick={() => setAnalysisType(null)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                     </div>
                     <div className="p-5 overflow-y-auto text-sm leading-7 text-slate-700 whitespace-pre-line font-serif">
                         {analyzing ? <div className="flex items-center gap-2 text-slate-500 italic"><RotateCw className="animate-spin" size={16}/> Đang suy nghĩ...</div> : analysisResult}
                     </div>
                 </div>
             )}
         </div>
      </div>

      {/* --- MODALS & MENUS --- */}

      {/* Settings Modal (Mobile & Desktop Unified for simplicity) */}
      {(showMobileSettings || showAppearance) && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center sm:p-4">
              <div onClick={() => { setShowMobileSettings(false); setShowAppearance(false); }} className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"></div>
              <div className="bg-white w-full md:w-96 rounded-t-2xl md:rounded-2xl border-t md:border border-slate-200 shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <span className="font-bold text-lg text-slate-800 flex items-center gap-2"><Settings size={20} className="text-slate-500"/> Cài đặt</span>
                      <button onClick={() => { setShowMobileSettings(false); setShowAppearance(false); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
                      {/* Theme */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Giao diện đọc</label>
                          <div className="grid grid-cols-3 gap-3">
                              <button onClick={() => changeTheme('light')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${theme === 'light' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}>
                                  <div className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm"></div>
                                  <span className="text-xs font-medium">Sáng</span>
                              </button>
                              <button onClick={() => changeTheme('sepia')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${theme === 'sepia' ? 'border-amber-500 bg-[#fff8e1] text-amber-800 ring-1 ring-amber-500' : 'border-slate-200 hover:bg-[#fff8e1]/50 text-slate-600'}`}>
                                  <div className="w-6 h-6 rounded-full bg-[#f8f4e5] border border-amber-200 shadow-sm"></div>
                                  <span className="text-xs font-medium">Vàng</span>
                              </button>
                              <button onClick={() => changeTheme('dark')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${theme === 'dark' ? 'border-indigo-500 bg-[#1e1e24] text-indigo-300 ring-1 ring-indigo-500' : 'border-slate-200 hover:bg-slate-100 text-slate-600'}`}>
                                  <div className="w-6 h-6 rounded-full bg-[#1e1e24] border border-slate-600 shadow-sm"></div>
                                  <span className="text-xs font-medium">Tối</span>
                              </button>
                          </div>
                      </div>

                      {/* Font Size */}
                      <div>
                          <div className="flex justify-between mb-2">
                              <label className="text-xs font-bold text-slate-400 uppercase">Cỡ chữ</label>
                              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 rounded">{fontSize}px</span>
                          </div>
                          <div className="flex items-center gap-3">
                              <span className="text-sm font-literata">Aa</span>
                              <input type="range" min="14" max="32" step="1" value={fontSize} onChange={(e) => changeFontSize(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/>
                              <span className="text-xl font-literata">Aa</span>
                          </div>
                      </div>

                      {/* Audio Settings */}
                      <div className="pt-4 border-t border-slate-100">
                          <div className="flex justify-between items-center mb-3">
                              <label className="text-xs font-bold text-slate-400 uppercase">Giọng đọc & Audio</label>
                              <span className="text-[10px] text-slate-400 max-w-[150px] truncate">{voiceDebugMsg}</span>
                          </div>
                          <div className="space-y-4">
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                  <select className="w-full bg-transparent text-sm focus:outline-none text-slate-700" onChange={handleVoiceChange} value={selectedVoice?.name || ""}>
                                      {voices.length === 0 ? <option>Đang tải giọng...</option> : 
                                       voices.map(v => <option key={v.name} value={v.name}>{formatVoiceName(v.name)} ({v.lang})</option>)}
                                  </select>
                              </div>
                              <div className="flex items-center gap-3">
                                  <span className="text-xs font-bold text-slate-500">Tốc độ</span>
                                  <input type="range" min="0.5" max="2.0" step="0.1" value={speechRate} onChange={handleRateChange} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/>
                                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{speechRate}x</span>
                              </div>
                              
                              <div className="flex gap-2">
                                  <button onClick={toggleSpeech} className="flex-1 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                                      {isSpeaking && !isPaused ? <Pause size={16}/> : <Play size={16}/>} {isSpeaking && !isPaused ? 'Tạm dừng' : 'Đọc Ngay'}
                                  </button>
                                  <button onClick={stopSpeech} className="px-4 py-2 bg-red-100 text-red-600 rounded-lg shadow-sm"><Square size={16}/></button>
                              </div>
                          </div>
                      </div>

                      {/* Auto & Timer */}
                      <div className="pt-4 border-t border-slate-100">
                          <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Tự động</label>
                          <div className="flex flex-col gap-3">
                               <button onClick={() => setIsAutoMode(!isAutoMode)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isAutoMode ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                   <div className="flex items-center gap-3">
                                       <div className={`p-2 rounded-full ${isAutoMode ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}><InfinityIcon size={18}/></div>
                                       <div className="text-left">
                                           <div className={`text-sm font-bold ${isAutoMode ? 'text-indigo-900' : 'text-slate-700'}`}>Tự động chuyển chương</div>
                                           <div className="text-[10px] text-slate-400">Tự động dịch và đọc chương tiếp theo</div>
                                       </div>
                                   </div>
                                   <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isAutoMode ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                       <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isAutoMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                   </div>
                               </button>

                               {/* Timer presets */}
                               <div className="grid grid-cols-4 gap-2">
                                   {[15, 30, 45, 60].map(m => (
                                       <button key={m} onClick={() => setTimer(m)} className="py-2 text-xs font-bold bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg border border-slate-200">{m}p</button>
                                   ))}
                               </div>
                               <div className="grid grid-cols-3 gap-2">
                                    {[1, 5, 10].map(c => (
                                        <button key={c} onClick={() => setChapterLimit(c)} className="py-2 text-xs font-bold bg-slate-50 hover:bg-purple-50 text-slate-600 hover:text-purple-600 rounded-lg border border-slate-200">Stop {c} ch</button>
                                    ))}
                               </div>
                               {(timeLeft || autoStopChapterLimit > 0) && (
                                   <div className="p-3 bg-orange-50 text-orange-800 rounded-xl text-xs font-bold flex justify-between items-center border border-orange-100">
                                       <span>{timeLeft ? `Dừng sau ${formatTime(timeLeft)}` : `Dừng sau ${autoStopChapterLimit - chaptersReadCount} chương`}</span>
                                       <button onClick={() => { setTimeLeft(null); setAutoStopChapterLimit(0); }} className="text-red-500 hover:underline">Hủy</button>
                                   </div>
                               )}
                          </div>
                      </div>
                      
                      {/* AI Utilities */}
                      <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                          <button onClick={() => {analyzeContent('summary'); setShowMobileSettings(false);}} className="flex flex-col items-center gap-2 p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 hover:shadow-sm">
                              <FileText size={20}/> <span className="text-xs font-bold">Tóm tắt chương</span>
                          </button>
                          <button onClick={() => {analyzeContent('explain'); setShowMobileSettings(false);}} className="flex flex-col items-center gap-2 p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-100 hover:shadow-sm">
                              <HelpCircle size={20}/> <span className="text-xs font-bold">Giải nghĩa từ</span>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* History Modal */}
      {showHistory && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2"><HistoryIcon size={20}/> Lịch sử</h3>
                       <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-2">
                       {history.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm italic">Chưa xem truyện nào gần đây.</p> : history.map((h,i) => (
                           <div key={i} onClick={() => { 
                               // History click logic: check cache first (should be logic inside cache check now, but let's explicity call loadChapter if URL exists)
                               if (h.url) {
                                   loadChapter(h.url);
                               }
                               setShowHistory(false); 
                           }} className="p-3 hover:bg-indigo-50 rounded-xl cursor-pointer border-b border-slate-50 last:border-0 group transition-colors flex gap-3">
                               <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">{i+1}</div>
                               <div className="flex-1 min-w-0">
                                   <div className="font-bold text-sm text-slate-700 truncate group-hover:text-indigo-700">{h.title}</div>
                                   <div className="text-[10px] text-slate-400 mt-1">{new Date(h.timestamp).toLocaleString('vi-VN')}</div>
                               </div>
                           </div>
                       ))}
                   </div>
                   {history.length > 0 && <div className="p-3 border-t bg-slate-50 rounded-b-2xl text-center"><button onClick={() => { setHistory([]); localStorage.removeItem('reader_history'); }} className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wide">Xóa tất cả</button></div>}
               </div>
          </div>
      )}

      {/* Translated Cache Modal (New) */}
      {showCache && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-emerald-600"><CheckCircle2 size={20}/> Kho đã dịch</h3>
                       <button onClick={() => setShowCache(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-2">
                       {translatedChapters.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm italic">Chưa có bản dịch nào được lưu.</p> : translatedChapters.map((h,i) => (
                           <div key={i} onClick={() => { 
                               loadChapter(h.url);
                               setShowCache(false); 
                           }} className="p-3 hover:bg-emerald-50 rounded-xl cursor-pointer border-b border-slate-50 last:border-0 group transition-colors flex gap-3">
                               <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold shrink-0"><FileText size={18}/></div>
                               <div className="flex-1 min-w-0">
                                   <div className="font-bold text-sm text-slate-700 truncate group-hover:text-emerald-700">{h.title}</div>
                                   <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Clock size={10}/> {new Date(h.timestamp).toLocaleString('vi-VN')}</div>
                               </div>
                           </div>
                       ))}
                   </div>
                   {translatedChapters.length > 0 && <div className="p-3 border-t bg-slate-50 rounded-b-2xl text-center"><button onClick={() => { setTranslatedChapters([]); localStorage.removeItem('reader_translated_cache'); }} className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wide">Xóa bộ nhớ đệm</button></div>}
               </div>
          </div>
      )}

    </div>
  );
}