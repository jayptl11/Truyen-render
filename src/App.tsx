import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Search, AlertCircle, BookOpen, ArrowRight, Sparkles, Key, RotateCw, Trash2, Edit3, Globe, FileText, HelpCircle, X, ChevronRight, ChevronLeft, Infinity as InfinityIcon, CheckCircle2, Layers, Home, Palette, Clock, Sliders, Terminal, Bookmark, Download, Search as SearchIcon, Maximize2, BarChart3 } from 'lucide-react';

// --- SUB-COMPONENT: PARAGRAPH RENDERER ---
const ParagraphItem = memo(({ text, onClick, index, setRef }: any) => {
  // Kiểu dáng đặc biệt cho tiêu đề chương (thường là đoạn đầu tiên)
  const isTitle = index === 0 && (text.toLowerCase().startsWith("chương") || text.length < 100);

  return (
    <p 
        ref={el => setRef(el, index)}
        onClick={() => onClick(index)}
        className={`
            mb-3 md:mb-4 p-2 md:p-3 rounded-lg cursor-pointer border-l-4 transition-all duration-300 text-base md:text-lg leading-relaxed
            bg-transparent border-transparent hover:bg-slate-50 border-l-slate-200
            ${isTitle ? 'font-bold text-xl text-indigo-900 text-center py-4' : ''}
        `}
    >
        {text}
    </p>
  );
});

ParagraphItem.displayName = 'ParagraphItem';

export default function StoryFetcher() {
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [translatedContent, setTranslatedContent] = useState('');
  
  const [chunks, setChunks] = useState<string[]>([]);

  const [nextChapterUrl, setNextChapterUrl] = useState<string | null>(null);
  const [prevChapterUrl, setPrevChapterUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  const [translationStyle, setTranslationStyle] = useState<'modern' | 'ancient'>('ancient');
  const [autoTranslationStyle, setAutoTranslationStyle] = useState<'modern' | 'ancient' | null>(null);
  
  const [mobileTab, setMobileTab] = useState<'input' | 'reader'>('input');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisType, setAnalysisType] = useState<'summary' | 'explain' | null>(null);
  
  const [apiKeys, setApiKeys] = useState<string[]>(['', '', '']);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
  // --- AUTO & TIMER & COUNTER STATES ---
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [autoStopChapterLimit, setAutoStopChapterLimit] = useState<number>(0);
  const [chaptersReadCount, setChaptersReadCount] = useState<number>(0);
  
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<Array<{type: 'log'|'error'|'warn'|'info', message: string, timestamp: string}>>([]);

  // --- PRELOAD STATES ---
  const [preloadedData, setPreloadedData] = useState<any>(null);
  const [isPreloading, setIsPreloading] = useState(false);

  // --- NEW FEATURES STATES ---
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [fontSize, setFontSize] = useState(18);
  const [showAppearance, setShowAppearance] = useState(false);
  
  // --- BATCH TRANSLATION STATES ---
  const [batchChapterCount, setBatchChapterCount] = useState<number>(10);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number, currentUrl: string}>({current: 0, total: 0, currentUrl: ''});
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [batchStartUrl, setBatchStartUrl] = useState<string>(''); // URL to start batch translation from
  const [batchTranslationStyle, setBatchTranslationStyle] = useState<'modern' | 'ancient'>('ancient');
  
  // --- CACHE STATE ---
  const [translatedChapters, setTranslatedChapters] = useState<any[]>([]);
  const [showCache, setShowCache] = useState(false);
  const batchTranslationRef = useRef<{shouldStop: boolean}>({shouldStop: false});

  // --- NEW FEATURES: BOOKMARK, EXPORT, SEARCH, ZEN, STATS ---
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [readingStats, setReadingStats] = useState<{totalChapters: number, totalTime: number, dailyReads: {[key: string]: number}}>({totalChapters: 0, totalTime: 0, dailyReads: {}});
  const [showStats, setShowStats] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedChaptersForExport, setSelectedChaptersForExport] = useState<string[]>([]);
  const [selectedChaptersForDelete, setSelectedChaptersForDelete] = useState<string[]>([]);
  const [chapterStartTime, setChapterStartTime] = useState<number | null>(null);
  
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
    
    // Load Settings
    const savedTheme = localStorage.getItem('reader_theme') as any;
    if (savedTheme) setTheme(savedTheme);
    const savedSize = localStorage.getItem('reader_font_size');
    if (savedSize) setFontSize(parseInt(savedSize));
    const savedTranslated = localStorage.getItem('reader_translated_cache');
    if (savedTranslated) {
        try { setTranslatedChapters(JSON.parse(savedTranslated)); } catch {}
    }
    
    // Load new features data
    const savedBookmarks = localStorage.getItem('reader_bookmarks');
    if (savedBookmarks) {
        try { setBookmarks(JSON.parse(savedBookmarks)); } catch {}
    }
    const savedStats = localStorage.getItem('reader_stats');
    if (savedStats) {
        try { setReadingStats(JSON.parse(savedStats)); } catch {}
    }
  }, []);

  // --- BATCH TRANSLATION FUNCTIONS ---
  const startBatchTranslation = async (startUrl: string, count: number) => {
      if (!startUrl || count <= 0) {
          setError('Vui lòng nhập URL và số chương hợp lệ');
          return;
      }

      if (apiKeys.filter(k => k.trim()).length === 0) {
          setError('Cần nhập API Key trước khi dịch hàng loạt');
          setShowApiKeyInput(true);
          return;
      }

      setIsBatchTranslating(true);
      batchTranslationRef.current.shouldStop = false;
      setBatchProgress({current: 0, total: count, currentUrl: startUrl});
      setShowBatchPanel(true);

      let currentUrl = startUrl;
      let translated = 0;
      const newChapters: any[] = []; // Collect new chapters to save all at once

      for (let i = 0; i < count; i++) {
          if (batchTranslationRef.current.shouldStop) {
              console.log('Batch translation stopped by user');
              break;
          }

          if (!currentUrl) {
              console.log('No more chapters to translate');
              break;
          }

          try {
              // Check cache first (in both state and newChapters array)
              const existingCache = translatedChapters.find(c => c.url === currentUrl);
              const newCache = newChapters.find(c => c.url === currentUrl);
              const cached = existingCache || newCache;
              
              if (cached) {
                  console.log(`Chapter ${i + 1} already cached: ${cached.title}`);
                  
                  // Check if there's a next URL
                  if (!cached.nextUrl) {
                      console.log(`No more chapters after cached chapter ${i + 1}`);
                      translated++;
                      setBatchProgress({current: translated, total: count, currentUrl: currentUrl});
                      break;
                  }
                  
                  currentUrl = cached.nextUrl;
                  translated++;
                  setBatchProgress({current: translated, total: count, currentUrl: currentUrl});
                  continue;
              }

              console.log(`Translating chapter ${i + 1}/${count}: ${currentUrl}`);
              setBatchProgress({current: translated, total: count, currentUrl});

              // Fetch content
              const data = await fetchRawStoryData(currentUrl);
              
              // Translate
              const translatedText = await fetchTranslation(data.content, batchTranslationStyle);
              
              // Prepare chapter data
              let title = "Chương không tên";
              const lines = translatedText.split('\n');
              if (lines.length > 0) title = lines[0].substring(0, 50);
              
              let webName = "Không rõ";
              try {
                  const urlObj = new URL(currentUrl);
                  webName = urlObj.hostname.replace('www.', '');
              } catch {}
              
              const newItem = { 
                  url: currentUrl, 
                  title, 
                  content: data.content, 
                  translatedContent: translatedText, 
                  nextUrl: data.nextUrl, 
                  prevUrl: data.prevUrl, 
                  timestamp: Date.now(), 
                  translationType: batchTranslationStyle, 
                  webName 
              };
              
              // Add to collection
              newChapters.push(newItem);
              
              translated++;
              
              // Check if there's a next URL
              if (!data.nextUrl) {
                  console.log(`No more chapters after chapter ${i + 1}`);
                  break;
              }
              
              currentUrl = data.nextUrl;
              setBatchProgress({current: translated, total: count, currentUrl: currentUrl});

              // Small delay to avoid overwhelming API
              await new Promise(resolve => setTimeout(resolve, 500));

          } catch (err: any) {
              console.error(`Error translating chapter ${i + 1}:`, err);
              setError(`Lỗi tại chương ${i + 1}: ${err.message || 'Không rõ'}. Đã dịch được ${translated} chương.`);
              break;
          }
      }

      // Save all new chapters to cache at once
      if (newChapters.length > 0) {
          const updatedCache = [...newChapters, ...translatedChapters.filter(c => !newChapters.some(nc => nc.url === c.url))].slice(0, 500);
          setTranslatedChapters(updatedCache);
          localStorage.setItem('reader_translated_cache', JSON.stringify(updatedCache));
          console.log(`Saved ${newChapters.length} new chapters to cache`);
      }

      setIsBatchTranslating(false);
      if (translated > 0) {
          setError(`✅ Hoàn tất! Đã dịch ${translated}/${count} chương.`);
      }
  };

  const stopBatchTranslation = () => {
      batchTranslationRef.current.shouldStop = true;
      setIsBatchTranslating(false);
  };
  
  // Console log capture
  useEffect(() => {
      const addLog = (type: 'log'|'error'|'warn'|'info', ...args: any[]) => {
          try {
              const message = args.map(arg => {
                  if (arg instanceof Error) {
                      return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
                  }
                  if (typeof arg === 'object' && arg !== null) {
                      try {
                          return JSON.stringify(arg, null, 2);
                      } catch {
                          return String(arg);
                      }
                  }
                  return String(arg);
              }).join(' ');
              const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
              setConsoleLogs(prev => [...prev.slice(-99), { type, message, timestamp }]);
          } catch (err) {
              // Fallback if capture fails
              setConsoleLogs(prev => [...prev.slice(-99), { 
                  type: 'error', 
                  message: 'Failed to capture log', 
                  timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false })
              }]);
          }
      };

      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      const originalInfo = console.info;

      console.log = (...args) => { originalLog(...args); addLog('log', ...args); };
      console.error = (...args) => { originalError(...args); addLog('error', ...args); };
      console.warn = (...args) => { originalWarn(...args); addLog('warn', ...args); };
      console.info = (...args) => { originalInfo(...args); addLog('info', ...args); };

      // Capture runtime errors
      const handleError = (event: ErrorEvent) => {
          addLog('error', `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
      };

      // Capture unhandled promise rejections (fetch errors, async errors)
      const handleRejection = (event: PromiseRejectionEvent) => {
          if (event.reason instanceof Error) {
              addLog('error', `Unhandled Promise Rejection: ${event.reason.message}`, event.reason.stack);
          } else {
              addLog('error', 'Unhandled Promise Rejection:', event.reason);
          }
      };

      // Capture fetch errors by wrapping fetch
      const originalFetch = window.fetch;
      window.fetch = async (...args: Parameters<typeof fetch>) => {
          try {
              const response = await originalFetch(...args);
              if (!response.ok) {
                  const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : String(args[0]));
                  addLog('error', `HTTP ${response.status} ${response.statusText}: ${url}`);
              }
              return response;
          } catch (error) {
              const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : String(args[0]));
              addLog('error', `Fetch failed: ${url}`, error);
              throw error;
          }
      };

      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleRejection);

      return () => {
          console.log = originalLog;
          console.error = originalError;
          console.warn = originalWarn;
          console.info = originalInfo;
          window.fetch = originalFetch;
          window.removeEventListener('error', handleError);
          window.removeEventListener('unhandledrejection', handleRejection);
      };
  }, []);
  
  const saveToCache = (url: string, content: string, translatedContent: string, nextUrl: string | null, prevUrl: string | null, translationType?: 'modern' | 'ancient') => {
      if (!url || !translatedContent) return;
      
      let title = "Chương không tên";
      const lines = translatedContent.split('\n');
      if (lines.length > 0) title = lines[0].substring(0, 50);
      
      // Extract domain from URL
      let webName = "Không rõ";
      try {
          const urlObj = new URL(url);
          webName = urlObj.hostname.replace('www.', '');
      } catch {}
      
      const newItem = { url, title, content, translatedContent, nextUrl, prevUrl, timestamp: Date.now(), translationType: translationType || translationStyle, webName };
      
      // Update cache: remove old entry for same URL, add new to top
      const newCache = [newItem, ...translatedChapters.filter(c => c.url !== url)].slice(0, 500); // Limit to 500 chapters
      setTranslatedChapters(newCache);
      localStorage.setItem('reader_translated_cache', JSON.stringify(newCache));
  };

  // --- BOOKMARK FUNCTIONS ---
  const toggleBookmark = () => {
      if (!url && !nextChapterUrl) return;
      const currentUrl = url || nextChapterUrl || '';
      const isBookmarked = bookmarks.some(b => b.url === currentUrl);
      
      if (isBookmarked) {
          // Remove bookmark
          const newBookmarks = bookmarks.filter(b => b.url !== currentUrl);
          setBookmarks(newBookmarks);
          localStorage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
      } else {
          // Add bookmark
          let title = "Chương không tên";
          if (translatedContent) {
              const lines = translatedContent.split('\n');
              if (lines.length > 0) title = lines[0].substring(0, 50);
          }
          const newBookmark = {
              url: currentUrl,
              title,
              chunkIndex: 0, // No longer tracking chunk position for TTS
              timestamp: Date.now()
          };
          const newBookmarks = [newBookmark, ...bookmarks].slice(0, 20);
          setBookmarks(newBookmarks);
          localStorage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
      }
  };

  const removeBookmark = (url: string) => {
      const newBookmarks = bookmarks.filter(b => b.url !== url);
      setBookmarks(newBookmarks);
      localStorage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
  };

  const loadBookmark = async (bookmark: any) => {
      await loadChapter(bookmark.url);
      setShowBookmarks(false);
  };

  // --- SEARCH FUNCTIONS ---
  const performSearch = () => {
      if (!searchQuery || !translatedContent) {
          setSearchResults([]);
          return;
      }
      const results: number[] = [];
      const query = searchQuery.toLowerCase();
      chunks.forEach((chunk, index) => {
          if (chunk.toLowerCase().includes(query)) {
              results.push(index);
          }
      });
      setSearchResults(results);
  };

  const jumpToSearchResult = (index: number) => {
      if (chunkRefs.current[index]) {
          chunkRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  };

  // --- EXPORT FUNCTIONS ---
  const toggleChapterSelection = (chapterUrl: string) => {
      setSelectedChaptersForExport(prev => 
          prev.includes(chapterUrl) 
              ? prev.filter(url => url !== chapterUrl)
              : [...prev, chapterUrl]
      );
  };

  const selectAllChapters = () => {
      setSelectedChaptersForExport(translatedChapters.map(c => c.url));
  };

  // --- CACHE DELETE FUNCTIONS ---
  const toggleChapterForDelete = (chapterUrl: string) => {
      setSelectedChaptersForDelete(prev => 
          prev.includes(chapterUrl) 
              ? prev.filter(url => url !== chapterUrl)
              : [...prev, chapterUrl]
      );
  };

  const selectAllChaptersForDelete = () => {
      setSelectedChaptersForDelete(translatedChapters.map(c => c.url));
  };

  const deleteSelectedChapters = () => {
      if (selectedChaptersForDelete.length === 0) return;
      
      const updatedChapters = translatedChapters.filter(c => !selectedChaptersForDelete.includes(c.url));
      setTranslatedChapters(updatedChapters);
      localStorage.setItem('reader_translated_cache', JSON.stringify(updatedChapters));
      setSelectedChaptersForDelete([]);
  };

  const exportToTxt = () => {
      let contentToExport = '';
      
      if (selectedChaptersForExport.length > 0) {
          // Xuất nhiều chương được chọn
          const chaptersToExport = translatedChapters
              .filter(c => selectedChaptersForExport.includes(c.url))
              .reverse(); // Reverse để giữ thứ tự đúng
          
          contentToExport = chaptersToExport.map((chapter, index) => {
              const separator = index > 0 ? '\n\n' + '='.repeat(50) + '\n\n' : '';
              return separator + chapter.translatedContent;
          }).join('');
      } else if (translatedContent) {
          // Xuất chương hiện tại
          contentToExport = translatedContent;
      } else {
          return;
      }
      
      // Thêm UTF-8 BOM để đảm bảo hiển thị đúng tiếng Việt
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + contentToExport], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = selectedChaptersForExport.length > 1 
          ? `truyen_${selectedChaptersForExport.length}_chuong_${Date.now()}.txt`
          : `truyen_${Date.now()}.txt`;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      setSelectedChaptersForExport([]);
  };

  const exportToPdf = async () => {
      let contentToExport = '';
      
      if (selectedChaptersForExport.length > 0) {
          // Xuất nhiều chương
          const chaptersToExport = translatedChapters
              .filter(c => selectedChaptersForExport.includes(c.url))
              .reverse();
          
          contentToExport = chaptersToExport.map((chapter, index) => {
              const separator = index > 0 ? '<div style="page-break-before: always;"></div>' : '';
              const paragraphs = chapter.translatedContent.split('\n\n').map((p: string) => `<p>${p}</p>`).join('');
              return separator + paragraphs;
          }).join('');
      } else if (translatedContent) {
          contentToExport = translatedContent.split('\n\n').map(p => `<p>${p}</p>`).join('');
      } else {
          return;
      }
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(`
              <html>
                  <head>
                      <title>Xuất PDF</title>
                      <style>
                          body { font-family: 'Times New Roman', serif; padding: 2cm; line-height: 1.8; }
                          p { margin-bottom: 1em; text-align: justify; }
                          @media print {
                              body { padding: 1cm; }
                          }
                      </style>
                  </head>
                  <body>
                      ${contentToExport}
                  </body>
              </html>
          `);
          printWindow.document.close();
          setTimeout(() => {
              printWindow.print();
          }, 500);
      }
      setShowExportMenu(false);
      setSelectedChaptersForExport([]);
  };

  // --- STATS FUNCTIONS ---
  const updateReadingStats = () => {
      const today = new Date().toISOString().split('T')[0];
      const newStats = {
          totalChapters: readingStats.totalChapters + 1,
          totalTime: readingStats.totalTime + (chapterStartTime ? Math.floor((Date.now() - chapterStartTime) / 1000) : 0),
          dailyReads: {
              ...readingStats.dailyReads,
              [today]: (readingStats.dailyReads[today] || 0) + 1
          }
      };
      setReadingStats(newStats);
      localStorage.setItem('reader_stats', JSON.stringify(newStats));
  };

  // Track reading time
  useEffect(() => {
      if (step === 3 && translatedContent && !chapterStartTime) {
          setChapterStartTime(Date.now());
      }
  }, [step, translatedContent]);

  // Update stats when moving to next chapter
  useEffect(() => {
      if (chapterStartTime && step === 1) {
          updateReadingStats();
          setChapterStartTime(null);
      }
  }, [step]);

  // Zen mode keyboard shortcut
  useEffect(() => {
      const handleKeyPress = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && zenMode) {
              setZenMode(false);
          } else if (e.key === 'f' && e.ctrlKey && step === 3) {
              e.preventDefault();
              setZenMode(!zenMode);
          }
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
  }, [zenMode, step]);


  const changeTheme = (t: 'light' | 'dark' | 'sepia') => {
      setTheme(t);
      localStorage.setItem('reader_theme', t);
  };

  const changeFontSize = (s: number) => {
      setFontSize(s);
      localStorage.setItem('reader_font_size', s.toString());
  };

  // --- VOICE LOADING LOGIC REMOVED ---
  // TTS functionality has been removed

  // Timer Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timeLeft !== null && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(p => (p === null || p <= 1) ? (setIsAutoMode(false), null) : p - 1), 1000);
    } else if (timeLeft === 0) { setIsAutoMode(false); setTimeLeft(null); }
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

  const fetchTranslation = async (text: string, styleOverride?: 'modern' | 'ancient') => {
      // GEMINI LOGIC
      const validKeys = apiKeys.filter(k => k && k.trim().length > 0);
      if (validKeys.length === 0) throw new Error("Cần nhập ít nhất 1 API Key.");
      
      // Sử dụng styleOverride nếu có, nếu không thì dùng autoTranslationStyle hoặc translationStyle
      const styleToUse = styleOverride || (isAutoMode && autoTranslationStyle ? autoTranslationStyle : translationStyle);
      
      let lastError;
      const promptText = styleToUse === 'ancient' 
        ? `Bạn là biên tập viên truyện Tiên Hiệp/Kiếm Hiệp/Cổ Trang. Hãy viết lại đoạn convert Hán Việt sau sang tiếng Việt mượt mà theo phong cách cổ trang nhưng DỄ ĐỌC, câu chữ rõ ràng, tự nhiên.

    Yêu cầu:
    - Ưu tiên diễn đạt hiện đại vừa phải, mạch lạc, tránh dùng từ cổ quá nặng/khó hiểu.
    - Giữ đúng nội dung, không bịa thêm, không thêm lời dẫn.
    - Giữ nguyên cấu trúc đoạn văn (xuống dòng như bản gốc).
    - Tránh các từ quá hiện đại kiểu “anh ấy”, “cô ấy”, “làng này/làng nọ” nếu bối cảnh cổ trang.
    - Xưng hô gợi cổ trang nhưng đơn giản: “hắn/y/nàng”, “lão giả”, “thiếu niên”, “các ngươi”, “bọn họ”, “ta/ngươi” (tùy ngữ cảnh). Chỉ dùng “tại hạ/bần đạo/cô nương” khi thật hợp cảnh.

    Văn bản cần viết lại:\n\n`
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
                        // Sanitize common markdown artifacts (e.g., **Chương ...**) to keep reading UI clean.
                        return translatedText
                            ? translatedText
                                    .replace(/^(Đây là bản dịch|Dưới đây là|Bản dịch:).{0,50}\n/i, '')
                                    .replace(/\*\*/g, '')
                                    .trim() + '\n\n=-='
                            : "";
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
                  const styleToUse = isAutoMode && autoTranslationStyle ? autoTranslationStyle : translationStyle;
                  saveToCache(nextChapterUrl, data.content, translated, data.nextUrl, data.prevUrl, styleToUse);
              }
          }
      } catch (e) {
          console.error("Preload error:", e);
      } finally {
          setIsPreloading(false);
      }
  };

  // --- HANDLERS ---
  
  const loadChapter = async (targetUrl: string, isAutoNav = false) => {
      
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
          const styleToUse = isAutoMode && autoTranslationStyle ? autoTranslationStyle : translationStyle;
          saveToCache(targetUrl, preloadedData.content, preloadedData.translatedContent, preloadedData.nextUrl, preloadedData.prevUrl, styleToUse); // Save to cache confirmed
          setPreloadedData(null); 
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return; 
      }

      fetchContent(targetUrl);
  };

  const handleScroll = useCallback(() => {
      if (!containerRef.current) return;
      // Scroll tracking for future features (currently not used for TTS)
  }, []);



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
    setLoading(true); setError(''); setContent(''); setTranslatedContent(''); setChunks([]); setAnalysisType(null); setStep(1); setNextChapterUrl(null); setPrevChapterUrl(null); setPreloadedData(null); setChaptersReadCount(0);
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

    setTranslating(true); setError(''); setChunks([]); setAnalysisType(null);
    try {
      const translated = await fetchTranslation(content);
      setTranslatedContent(translated); processTranslatedText(translated); setStep(3); setMobileTab('reader');
      const styleToUse = isAutoMode && autoTranslationStyle ? autoTranslationStyle : translationStyle;
      saveToCache(url || nextChapterUrl || "", content, translated, nextChapterUrl, prevChapterUrl, styleToUse);
    } catch (err: any) { setError(err.message || 'Lỗi khi gọi AI.'); } finally { setTranslating(false); }
  };

    const processTranslatedText = useCallback((text: string) => {
        if (!text) return;

        // Sanitize text
        const cleaned = text.replace(/\*\*/g, '').replace(/\r\n/g, '\n');

        // Simple paragraph splitting for display
        const paragraphs = cleaned
            .split(/\n{2,}|\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        setChunks(paragraphs);
    }, []);

  // --- AUTO TRIGGERS ---
  useEffect(() => {
    if (isAutoMode && step === 2 && content && !translating && !translatedContent) { 
      const t = setTimeout(() => translateContent(), 500); 
      return () => clearTimeout(t); 
    }
  }, [step, content, isAutoMode, translating, translatedContent]);

  // TTS auto-scroll removed as TTS is disabled

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
         <button onClick={() => setShowBookmarks(true)} className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showBookmarks ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <Bookmark size={20} /> 
             <span className="text-[10px] font-bold">Bookmark</span>
             {bookmarks.length > 0 && <span className="absolute top-2 right-4 w-2 h-2 bg-yellow-500 rounded-full border border-white"></span>}
         </button>
         <button onClick={() => setShowExportMenu(true)} disabled={!translatedContent && translatedChapters.length === 0} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showExportMenu ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'} disabled:opacity-30`}>
             <Download size={20} /> <span className="text-[10px] font-bold">Tải</span>
         </button>
         <button onClick={() => setShowBatchPanel(true)} className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showBatchPanel ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <Layers size={20} /> 
             <span className="text-[10px] font-bold">Dịch hàng loạt</span>
             {isBatchTranslating && <span className="absolute top-2 right-4 w-2 h-2 bg-green-500 rounded-full border border-white animate-pulse"></span>}
         </button>
         <button onClick={() => setShowCache(true)} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showCache ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <CheckCircle2 size={20} /> <span className="text-[10px] font-bold">Kho</span>
         </button>
         <button onClick={() => setShowConsole(true)} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors w-16 ${showConsole ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-slate-600'}`}>
             <Terminal size={20} /> <span className="text-[10px] font-bold">Log</span>
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
                 <div className="flex p-1 bg-slate-100 rounded-xl shadow-inner relative">
                     <button 
                         onClick={() => !isAutoMode && setTranslationStyle('ancient')} 
                         disabled={isAutoMode}
                         className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${translationStyle === 'ancient' ? 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-500 hover:text-slate-700'} ${isAutoMode ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <FileText size={14}/> Cổ Trang
                     </button>
                     <button 
                         onClick={() => !isAutoMode && setTranslationStyle('modern')} 
                         disabled={isAutoMode}
                         className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${translationStyle === 'modern' ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-700'} ${isAutoMode ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <Sparkles size={14}/> Hiện Đại
                     </button>
                     {isAutoMode && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="text-[9px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">Auto đang bật</span>
                     </div>}
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

             <div className="flex items-center gap-2 md:gap-3">
                 {/* Auto Mode Toggle - Prominent position */}
                 <button onClick={() => setIsAutoMode(!isAutoMode)} className={`hidden md:flex px-4 py-2 text-sm font-bold rounded-full transition-all items-center gap-2 shadow-md ${isAutoMode ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/30' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`} title="Tự động dịch và chuyển chương tiếp theo"><InfinityIcon size={16}/> {isAutoMode ? 'Auto ON' : 'Auto OFF'}</button>
                 
                 <div className="w-px h-6 bg-slate-300 hidden md:block"></div>
                 
                 {/* Theme & Settings Trigger */}
                 <div className="flex items-center gap-2">
                    {step === 3 && translatedContent && (
                        <>
                            <button 
                                onClick={toggleBookmark} 
                                className={`p-2 rounded-full transition-colors ${
                                    bookmarks.some(b => b.url === (url || nextChapterUrl)) 
                                        ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200' 
                                        : 'hover:bg-slate-100 text-slate-600'
                                }`} 
                                title={bookmarks.some(b => b.url === (url || nextChapterUrl)) ? "Bỏ đánh dấu" : "Đánh dấu"}
                            >
                                <Bookmark size={20} className={bookmarks.some(b => b.url === (url || nextChapterUrl)) ? 'fill-yellow-600' : ''}/>
                            </button>
                            <button onClick={() => setShowSearch(true)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Tìm kiếm"><SearchIcon size={20}/></button>
                            <button onClick={() => setShowExportMenu(true)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Xuất file"><Download size={20}/></button>
                            <button onClick={() => setZenMode(true)} className="hidden md:block p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Chế độ tập trung (Ctrl+F)"><Maximize2 size={20}/></button>
                        </>
                    )}
                    <button onClick={() => setShowAppearance(!showAppearance)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Giao diện"><Palette size={20}/></button>
                    <button onClick={() => setShowMobileSettings(!showMobileSettings)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Cài đặt"><Sliders size={20}/></button>
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
                            <ParagraphItem key={index} index={index} text={chunk} onClick={() => {}} setRef={(el: any) => chunkRefs.current[index] = el} />
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

      {/* Appearance Modal (Theme & Font) */}
      {showAppearance && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center sm:p-4">
              <div onClick={() => setShowAppearance(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"></div>
              <div className="bg-white w-full md:w-96 rounded-t-2xl md:rounded-2xl border-t md:border border-slate-200 shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-pink-50">
                      <span className="font-bold text-lg text-slate-800 flex items-center gap-2"><Palette size={20} className="text-purple-500"/> Giao diện</span>
                      <button onClick={() => setShowAppearance(false)} className="p-1 hover:bg-white/60 rounded-full"><X size={20}/></button>
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
                  </div>
              </div>
          </div>
      )}

      {/* Settings Modal (TTS, Auto, Timer) */}
      {showMobileSettings && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center sm:p-4">
              <div onClick={() => setShowMobileSettings(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"></div>
              <div className="bg-white w-full md:w-[450px] rounded-t-2xl md:rounded-2xl border-t md:border border-slate-200 shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                      <span className="font-bold text-lg text-slate-800 flex items-center gap-2"><Sliders size={20} className="text-indigo-500"/> Cài đặt đọc</span>
                      <button onClick={() => setShowMobileSettings(false)} className="p-1 hover:bg-white/60 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">

                      {/* Auto & Timer */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Tự động</label>
                          <div className="flex flex-col gap-3">
                               <button onClick={() => {
                                   const newAutoMode = !isAutoMode;
                                   setIsAutoMode(newAutoMode);
                                   if (newAutoMode) {
                                       // Khi bật auto, lưu lại thể loại dịch hiện tại
                                       setAutoTranslationStyle(translationStyle);
                                   } else {
                                       // Khi tắt auto, reset
                                       setAutoTranslationStyle(null);
                                   }
                               }} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isAutoMode ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                   <div className="flex items-center gap-3">
                                       <div className={`p-2 rounded-full ${isAutoMode ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}><InfinityIcon size={18}/></div>
                                       <div className="text-left">
                                           <div className={`text-sm font-bold ${isAutoMode ? 'text-indigo-900' : 'text-slate-700'}`}>Tự động chuyển chương</div>
                                           <div className="text-[10px] text-slate-400">Tự động dịch chương tiếp theo</div>
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

      {/* Console Viewer Bottom Sheet */}
      {showConsole && (
          <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowConsole(false)}>
              <div onClick={(e) => e.stopPropagation()} className="absolute bottom-0 left-0 right-0 max-h-[70%] bg-slate-900 border-t border-slate-700 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] rounded-t-2xl z-40 flex flex-col animate-in slide-in-from-bottom-10">
                  <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <span className="font-bold text-base text-slate-100 flex items-center gap-2 font-mono">
                          <Terminal size={18} className="text-green-400"/> Console <span className="text-slate-500 text-xs">({consoleLogs.length})</span>
                      </span>
                      <div className="flex items-center gap-2">
                          <button 
                              onClick={() => {
                                  console.log('Test log message');
                                  console.error('Test error message');
                                  console.warn('Test warning message');
                                  console.info('Test info message');
                              }} 
                              className="px-3 py-1 text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                          >
                              Test
                          </button>
                          <button 
                              onClick={() => setConsoleLogs([])} 
                              className="px-3 py-1 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                          >
                              Clear
                          </button>
                          <button onClick={() => setShowConsole(false)} className="p-1 hover:bg-slate-700 rounded-full text-slate-400"><X size={18}/></button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
                      {consoleLogs.length === 0 ? (
                          <div className="text-slate-500 text-center py-8 italic">No logs yet...</div>
                      ) : (
                          consoleLogs.map((log, i) => (
                              <div 
                                  key={i} 
                                  className={`p-2 rounded border-l-2 ${
                                      log.type === 'error' ? 'bg-red-950/30 border-red-500 text-red-300' :
                                      log.type === 'warn' ? 'bg-yellow-950/30 border-yellow-500 text-yellow-300' :
                                      log.type === 'info' ? 'bg-blue-950/30 border-blue-500 text-blue-300' :
                                      'bg-slate-800/50 border-slate-600 text-slate-300'
                                  }`}
                              >
                                  <div className="flex items-start gap-2">
                                      <span className="text-slate-500 text-[10px] shrink-0 mt-0.5">{log.timestamp}</span>
                                      <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${
                                          log.type === 'error' ? 'text-red-400' :
                                          log.type === 'warn' ? 'text-yellow-400' :
                                          log.type === 'info' ? 'text-blue-400' :
                                          'text-slate-400'
                                      }`}>
                                          [{log.type.toUpperCase()}]
                                      </span>
                                      <pre className="flex-1 whitespace-pre-wrap break-words">{log.message}</pre>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Batch Translation Panel */}
      {showBatchPanel && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers size={20} className="text-indigo-600"/> Dịch hàng loạt</h3>
                       <button onClick={() => setShowBatchPanel(false)} className="p-1 hover:bg-white/80 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-4">
                       {/* Input section */}
                       <div className="space-y-4 mb-6">
                           <div>
                               <label className="block text-sm font-bold text-slate-700 mb-2">URL chương đầu tiên</label>
                               <input 
                                   type="text" 
                                   value={batchStartUrl} 
                                   onChange={(e) => setBatchStartUrl(e.target.value)}
                                   placeholder="Nhập URL chương bắt đầu..."
                                   className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                                   disabled={isBatchTranslating}
                               />
                           </div>
                           <div>
                               <label className="block text-sm font-bold text-slate-700 mb-2">Số chương cần dịch</label>
                               <input 
                                   type="number" 
                                   min="1" 
                                   max="500" 
                                   value={batchChapterCount}
                                   onChange={(e) => setBatchChapterCount(Math.max(1, Math.min(500, Number(e.target.value))))}
                                   placeholder="Nhập số chương (1-500)"
                                   className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                                   disabled={isBatchTranslating}
                               />
                               <div className="text-xs text-slate-400 mt-1">
                                   Tối thiểu 1, tối đa 500 chương
                               </div>
                           </div>
                           <div>
                               <label className="block text-sm font-bold text-slate-700 mb-2">Thể loại dịch</label>
                               <div className="flex gap-2">
                                   <button
                                       onClick={() => setBatchTranslationStyle('ancient')}
                                       disabled={isBatchTranslating}
                                       className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-colors ${
                                           batchTranslationStyle === 'ancient'
                                               ? 'bg-amber-500 text-white'
                                               : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                       } disabled:opacity-50`}
                                   >
                                       🏛️ Cổ Trang
                                   </button>
                                   <button
                                       onClick={() => setBatchTranslationStyle('modern')}
                                       disabled={isBatchTranslating}
                                       className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-colors ${
                                           batchTranslationStyle === 'modern'
                                               ? 'bg-purple-500 text-white'
                                               : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                       } disabled:opacity-50`}
                                   >
                                       🏙️ Hiện Đại
                                   </button>
                               </div>
                           </div>
                       </div>

                       {/* Control buttons */}
                       <div className="flex gap-2 mb-6">
                           {!isBatchTranslating ? (
                               <button 
                                   onClick={() => startBatchTranslation(batchStartUrl, batchChapterCount)}
                                   disabled={!batchStartUrl.trim()}
                                   className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                               >
                                   <Layers size={18} /> Bắt đầu dịch
                               </button>
                           ) : (
                               <button 
                                   onClick={stopBatchTranslation}
                                   className="flex-1 bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 shadow-lg"
                               >
                                   <X size={18} /> Dừng lại
                               </button>
                           )}
                       </div>

                       {/* Progress display */}
                       {isBatchTranslating && batchProgress && (
                           <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
                               <div className="flex items-center justify-between mb-2">
                                   <span className="text-sm font-bold text-slate-700">Đang xử lý...</span>
                                   <span className="text-sm font-bold text-indigo-600">{batchProgress.current}/{batchProgress.total}</span>
                               </div>
                               <div className="w-full bg-slate-200 rounded-full h-2.5 mb-3">
                                   <div 
                                       className="bg-gradient-to-r from-indigo-600 to-purple-600 h-2.5 rounded-full transition-all duration-300"
                                       style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                   ></div>
                               </div>
                               <div className="text-xs text-slate-600 truncate">
                                   <span className="font-semibold">URL hiện tại:</span> {batchProgress.currentUrl}
                               </div>
                           </div>
                       )}

                       {/* Translated cache list */}
                       {!isBatchTranslating && translatedChapters.length > 0 && (
                           <div className="mt-4">
                               <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                   <CheckCircle2 size={16} className="text-green-600"/> 
                                   Đã dịch ({translatedChapters.length} chương)
                               </h4>
                               <div className="space-y-2 max-h-60 overflow-y-auto">
                                   {translatedChapters.slice(0, 10).map((chapter, idx) => (
                                       <div 
                                           key={idx}
                                           onClick={() => {
                                               loadChapter(chapter.url);
                                               setShowBatchPanel(false);
                                           }}
                                           className="p-2 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition-all group"
                                       >
                                           <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-indigo-700">{chapter.title}</div>
                                           <div className="text-[10px] text-slate-400 mt-1">{new Date(chapter.timestamp).toLocaleString('vi-VN')}</div>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}
                   </div>
               </div>
          </div>
      )}

      {/* Translated Cache Modal (New) */}
      {showCache && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-emerald-600"><CheckCircle2 size={20}/> Kho đã dịch</h3>
                       <button onClick={() => { setShowCache(false); setSelectedChaptersForDelete([]); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   
                   {/* Selection controls */}
                   {translatedChapters.length > 0 && (
                       <div className="p-3 border-b bg-slate-50/50 flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-600">
                               {selectedChaptersForDelete.length > 0 
                                   ? `Đã chọn ${selectedChaptersForDelete.length} chương` 
                                   : 'Chọn chương để xóa'}
                           </span>
                           <div className="flex gap-2">
                               <button 
                                   onClick={selectAllChaptersForDelete}
                                   className="text-xs px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold"
                               >
                                   Chọn tất cả
                               </button>
                               <button 
                                   onClick={() => setSelectedChaptersForDelete([])}
                                   className="text-xs px-3 py-1 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-full font-bold"
                               >
                                   Bỏ chọn
                               </button>
                           </div>
                       </div>
                   )}
                   
                   <div className="flex-1 overflow-y-auto p-2">
                       {translatedChapters.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm italic">Chưa có bản dịch nào được lưu.</p> : translatedChapters.map((h,i) => {
                           const isBookmarked = bookmarks.some(b => b.url === h.url);
                           const isSelected = selectedChaptersForDelete.includes(h.url);
                           return (
                           <div key={i} className={`p-3 rounded-xl border-b border-slate-50 last:border-0 group transition-colors flex gap-3 ${isSelected ? 'bg-red-50 border-red-200' : 'hover:bg-emerald-50'}`}>
                               <input 
                                   type="checkbox"
                                   checked={isSelected}
                                   onChange={() => toggleChapterForDelete(h.url)}
                                   onClick={(e) => e.stopPropagation()}
                                   className="w-4 h-4 mt-1 text-red-600 rounded focus:ring-2 focus:ring-red-500 cursor-pointer"
                               />
                               <div 
                                   onClick={() => { 
                                       if (!isSelected) {
                                           loadChapter(h.url);
                                           setShowCache(false); 
                                       }
                                   }} 
                                   className={`flex gap-3 flex-1 min-w-0 ${!isSelected ? 'cursor-pointer' : 'cursor-default'}`}
                               >
                                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0 relative ${isBookmarked ? 'bg-yellow-100' : 'bg-emerald-100'}`}>
                                       <FileText size={18} className={isBookmarked ? 'text-yellow-600' : 'text-emerald-600'}/>
                                       {isBookmarked && <Bookmark size={12} className="absolute -top-1 -right-1 fill-yellow-400 text-yellow-400"/>}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                       <div className={`font-bold text-sm text-slate-700 truncate ${!isSelected && 'group-hover:text-emerald-700'}`}>{h.title}</div>
                                       <div className="flex items-center gap-2 mt-1 flex-wrap">
                                           {h.webName && <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">{h.webName}</span>}
                                           {h.translationType && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${h.translationType === 'ancient' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                                               {h.translationType === 'ancient' ? 'Cổ Trang' : 'Hiện Đại'}
                                           </span>}
                                       </div>
                                       <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><Clock size={10}/> {new Date(h.timestamp).toLocaleString('vi-VN')}</div>
                                   </div>
                               </div>
                           </div>
                       );
                       })}
                   </div>
                   {translatedChapters.length > 0 && (
                       <div className="p-3 border-t bg-slate-50 rounded-b-2xl flex gap-2 justify-center">
                           {selectedChaptersForDelete.length > 0 && (
                               <button 
                                   onClick={deleteSelectedChapters} 
                                   className="text-xs text-white bg-red-500 hover:bg-red-600 px-4 py-2 rounded-full font-bold uppercase tracking-wide transition-colors"
                               >
                                   Xóa {selectedChaptersForDelete.length} chương
                               </button>
                           )}
                           <button 
                               onClick={() => { 
                                   setTranslatedChapters([]); 
                                   localStorage.removeItem('reader_translated_cache'); 
                                   setSelectedChaptersForDelete([]);
                               }} 
                               className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wide px-4 py-2"
                           >
                               Xóa tất cả
                           </button>
                       </div>
                   )}
               </div>
          </div>
      )}

      {/* Bookmarks Modal */}
      {showBookmarks && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-indigo-600"><Bookmark size={20}/> Bookmark</h3>
                       <button onClick={() => setShowBookmarks(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-2">
                       {bookmarks.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm italic">Chưa có bookmark nào.</p> : bookmarks.map((b,i) => (
                           <div key={i} className="p-3 hover:bg-indigo-50 rounded-xl border-b border-slate-50 last:border-0 group transition-colors flex gap-3">
                               <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0"><Bookmark size={18}/></div>
                               <div className="flex-1 min-w-0" onClick={() => loadBookmark(b)}>
                                   <div className="font-bold text-sm text-slate-700 truncate group-hover:text-indigo-700 cursor-pointer">{b.title}</div>
                                   <div className="text-[10px] text-slate-400 mt-1">Đoạn {b.chunkIndex + 1} • {new Date(b.timestamp).toLocaleString('vi-VN')}</div>
                               </div>
                               <button onClick={() => removeBookmark(b.url)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors">
                                   <Trash2 size={16}/>
                               </button>
                           </div>
                       ))}
                   </div>
                   {bookmarks.length > 0 && <div className="p-3 border-t bg-slate-50 rounded-b-2xl text-center"><button onClick={() => { setBookmarks([]); localStorage.removeItem('reader_bookmarks'); }} className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wide">Xóa tất cả</button></div>}
               </div>
          </div>
      )}

      {/* Search Modal */}
      {showSearch && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-blue-600"><SearchIcon size={20}/> Tìm kiếm</h3>
                       <button onClick={() => setShowSearch(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="p-4 border-b">
                       <div className="relative">
                           <input 
                               type="text" 
                               value={searchQuery} 
                               onChange={(e) => setSearchQuery(e.target.value)}
                               onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                               placeholder="Nhập từ khóa cần tìm..."
                               className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                           />
                           <button onClick={performSearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg">
                               <SearchIcon size={16}/>
                           </button>
                       </div>
                   </div>
                   <div className="flex-1 overflow-y-auto p-2">
                       {searchResults.length === 0 ? (
                           <p className="text-center text-slate-400 py-8 text-sm italic">
                               {searchQuery ? 'Không tìm thấy kết quả nào' : 'Nhập từ khóa và nhấn Enter'}
                           </p>
                       ) : (
                           <div className="space-y-1">
                               <p className="text-xs text-slate-500 px-3 py-2">Tìm thấy {searchResults.length} kết quả</p>
                               {searchResults.map((idx) => (
                                   <div 
                                       key={idx} 
                                       onClick={() => { jumpToSearchResult(idx); setShowSearch(false); }}
                                       className="p-3 hover:bg-blue-50 rounded-xl cursor-pointer border-b border-slate-50 last:border-0 group transition-colors"
                                   >
                                       <div className="text-xs text-slate-500 mb-1">Đoạn {idx + 1}</div>
                                       <div className="text-sm text-slate-700 line-clamp-2">{chunks[idx]}</div>
                                   </div>
                               ))}
                           </div>
                       )}
                   </div>
               </div>
          </div>
      )}

      {/* Export Menu Modal */}
      {showExportMenu && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-green-600"><Download size={20}/> Xuất file</h3>
                       <button onClick={() => { setShowExportMenu(false); setSelectedChaptersForExport([]); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   
                   {/* Chapter Selection */}
                   {translatedChapters.length > 0 && (
                       <div className="p-4 border-b bg-slate-50/50">
                           <div className="flex items-center justify-between mb-3">
                               <span className="text-sm font-bold text-slate-700">
                                   Tất cả chương đã dịch ({translatedChapters.length}):
                               </span>
                               <div className="flex gap-2">
                                   <button 
                                       onClick={selectAllChapters}
                                       className="text-xs px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full font-bold"
                                   >
                                       Chọn tất cả
                                   </button>
                                   <button 
                                       onClick={() => setSelectedChaptersForExport([])}
                                       className="text-xs px-3 py-1 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-full font-bold"
                                   >
                                       Bỏ chọn
                                   </button>
                               </div>
                           </div>
                           <div className="max-h-96 overflow-y-auto space-y-1 custom-scrollbar border border-slate-200 rounded-lg p-2 bg-white">
                               {translatedChapters.slice().reverse().map((chapter) => (
                                   <label 
                                       key={chapter.url} 
                                       className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors"
                                   >
                                       <input 
                                           type="checkbox"
                                           checked={selectedChaptersForExport.includes(chapter.url)}
                                           onChange={() => toggleChapterSelection(chapter.url)}
                                           className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                                       />
                                       <div className="flex-1 min-w-0">
                                           <div className="text-sm font-medium text-slate-700 truncate">{chapter.title}</div>
                                           <div className="text-[10px] text-slate-400">{chapter.webName}</div>
                                       </div>
                                   </label>
                               ))}
                           </div>
                           {selectedChaptersForExport.length > 0 && (
                               <div className="mt-3 p-2 bg-indigo-50 rounded-lg text-center">
                                   <span className="text-xs font-bold text-indigo-700">
                                       Đã chọn {selectedChaptersForExport.length} chương
                                   </span>
                               </div>
                           )}
                       </div>
                   )}
                   
                   <div className="p-4 space-y-3">
                       {translatedChapters.length === 0 && !translatedContent && (
                           <p className="text-center text-slate-400 py-4 text-sm italic">Chưa có chương nào để xuất</p>
                       )}
                       
                       {(translatedChapters.length > 0 || translatedContent) && (
                           <>
                               <button 
                                   onClick={exportToTxt}
                                   disabled={translatedChapters.length > 0 && selectedChaptersForExport.length === 0 && !translatedContent}
                                   className="w-full p-4 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                               >
                                   <FileText size={24} className="text-blue-600"/>
                                   <div className="text-left flex-1">
                                       <div className="font-bold text-blue-900">Xuất file TXT</div>
                                       <div className="text-xs text-blue-600">
                                           {selectedChaptersForExport.length > 0 
                                               ? `${selectedChaptersForExport.length} chương đã chọn`
                                               : translatedContent ? 'Chương hiện tại' : 'Chọn chương để xuất'}
                                       </div>
                                   </div>
                               </button>
                               <button 
                                   onClick={exportToPdf}
                                   disabled={translatedChapters.length > 0 && selectedChaptersForExport.length === 0 && !translatedContent}
                                   className="w-full p-4 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                               >
                                   <FileText size={24} className="text-red-600"/>
                                   <div className="text-left flex-1">
                                       <div className="font-bold text-red-900">Xuất file PDF</div>
                                       <div className="text-xs text-red-600">
                                           {selectedChaptersForExport.length > 0 
                                               ? `${selectedChaptersForExport.length} chương đã chọn`
                                               : translatedContent ? 'Chương hiện tại' : 'Chọn chương để xuất'}
                                       </div>
                                   </div>
                               </button>
                           </>
                       )}
                   </div>
               </div>
          </div>
      )}

      {/* Statistics Modal */}
      {showStats && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
                   <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2 text-purple-600"><BarChart3 size={20}/> Thống kê đọc</h3>
                       <button onClick={() => setShowStats(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                   </div>
                   <div className="p-6 space-y-6">
                       <div className="grid grid-cols-2 gap-4">
                           <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                               <div className="text-2xl font-bold text-purple-900">{readingStats.totalChapters}</div>
                               <div className="text-xs text-purple-600 mt-1">Tổng chương đã đọc</div>
                           </div>
                           <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                               <div className="text-2xl font-bold text-blue-900">{Math.floor(readingStats.totalTime / 60)}</div>
                               <div className="text-xs text-blue-600 mt-1">Tổng thời gian (phút)</div>
                           </div>
                       </div>
                       
                       <div>
                           <h4 className="text-sm font-bold text-slate-700 mb-3">Hoạt động 7 ngày gần nhất</h4>
                           <div className="space-y-2">
                               {Object.entries(readingStats.dailyReads).slice(-7).reverse().map(([date, count]) => (
                                   <div key={date} className="flex items-center gap-3">
                                       <span className="text-xs text-slate-500 w-24">{new Date(date).toLocaleDateString('vi-VN')}</span>
                                       <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                                           <div 
                                               className="bg-gradient-to-r from-purple-400 to-purple-600 h-full rounded-full flex items-center justify-end pr-2"
                                               style={{ width: `${Math.min(100, (count as number) * 20)}%` }}
                                           >
                                               <span className="text-[10px] text-white font-bold">{count}</span>
                                           </div>
                                       </div>
                                   </div>
                               ))}
                               {Object.keys(readingStats.dailyReads).length === 0 && (
                                   <p className="text-center text-slate-400 py-4 text-sm italic">Chưa có dữ liệu</p>
                               )}
                           </div>
                       </div>
                       
                       <button 
                           onClick={() => {
                               setReadingStats({totalChapters: 0, totalTime: 0, dailyReads: {}});
                               localStorage.removeItem('reader_stats');
                           }}
                           className="w-full py-2 text-xs text-red-500 hover:text-red-700 font-bold"
                       >
                           Xóa tất cả thống kê
                       </button>
                   </div>
               </div>
          </div>
      )}

      {/* Zen Mode Overlay */}
      {zenMode && step === 3 && (
          <div className="fixed inset-0 z-[70] bg-slate-900 flex flex-col animate-in fade-in">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                  <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                      <span className="text-xl">A-</span>
                  </button>
                  <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                      <span className="text-xl">A+</span>
                  </button>
                  <button onClick={() => setZenMode(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                      <X size={20}/>
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 md:p-16">
                  <div className="max-w-4xl mx-auto text-slate-200" style={{ fontSize: `${fontSize}px`, fontFamily: "'Literata', serif", lineHeight: "1.9" }}>
                      {chunks.map((chunk, index) => (
                          <p key={index} className="mb-6 text-justify">{chunk}</p>
                      ))}
                  </div>
              </div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-xs">
                  Nhấn ESC để thoát chế độ tập trung
              </div>
          </div>
      )}

    </div>
  );
}