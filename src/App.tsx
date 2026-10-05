import { SearchDialog } from './features/reader/SearchDialog';
import { StatsDialog } from './features/reader/StatsDialog';
import { FocusReader } from './features/reader/FocusReader';
import { DiagnosticsDialog } from './features/diagnostics/DiagnosticsDialog';
import { PwaStatus } from './app/PwaStatus';
import { AppShell } from './app/AppShell';
import { SourcePanel } from './features/reader/SourcePanel';
import { ReaderToolbar } from './features/reader/ReaderToolbar';
import { AppearanceDialog } from './features/settings/AppearanceDialog';
import { useBooks } from './features/library/useBooks';
import { localBooks } from './services/storySources/books';
import { downloadChapterAudio } from './services/tts/download';
import { usePlaybackIntegration } from './features/tts/usePlaybackIntegration';
import { CompactPlayer, ExpandedPlayer } from './features/tts/ListeningPlayer';
import { useChapterLibrary } from './features/library/useChapterLibrary';
import { useChapterPreload } from './features/reader/useChapterPreload';
import { useReadingStats } from './features/reader/useReadingStats';
import { useDiagnostics } from './features/diagnostics/useDiagnostics';
import { LibraryDialog } from './features/library/LibraryDialog';
import { BookmarkDialog } from './features/library/BookmarkDialog';
import { ExportDialog } from './features/library/ExportDialog';
import { ReaderSettings } from './features/settings/ReaderSettings';
import { downloadText, printText } from './services/storage/export';
import { useBatchTranslation } from './features/translation/useBatchTranslation';
import { BatchDialog } from './features/translation/BatchDialog';
import { storage } from './services/storage/local';
import { createChapter, readProgress, saveProgress } from './services/storage/chapters';
import { errorMessage } from './services/errors';
import { useTtsReader } from './features/tts/useTtsReader';
import { SpeechControls } from './features/tts/SpeechControls';
import { ReaderView } from './features/reader/ReaderView';
import { ApiKeySettings } from './features/settings/ApiKeySettings';
import { translateText, analyzeText, normalizeAiPriority, DEFAULT_AI_PRIORITY } from './services/ai/client';
import { fetchRawStoryData } from './services/storySources/client';
import type { AiProvider, TranslationStyle, BookmarkEntry } from './types/story';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RotateCw, X } from 'lucide-react';

export default function StoryFetcher() {

  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [translatedContent, setTranslatedContent] = useState('');

  const [activeChapterId, setActiveChapterId] = useState('');
  const [readerVersion, setReaderVersion] = useState<'original' | 'translated'>(() => storage.getItem('reader_last_version') === 'translated' ? 'translated' : 'original');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const textToRead = readerVersion === 'translated' ? translatedContent || content : content;
  const chunks = useMemo(() => textToRead.replace(/\*\*/g, '').replace(/\r\n/g, '\n').split(/\n+/).map(p => p.trim()).filter(Boolean), [textToRead]);
  const contentKey = `${activeChapterId}:${readerVersion}`;
  const initialParagraph = useMemo(() => bookmarkPosition ?? readProgress(activeChapterId, readerVersion), [activeChapterId, readerVersion, bookmarkPosition]);
  const loadController = useRef<AbortController | null>(null);
  const requestEpoch = useRef(0);
  const handingOff = useRef(false);

  const [nextChapterUrl, setNextChapterUrl] = useState<string | null>(null);
  const [prevChapterUrl, setPrevChapterUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');

  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url');
  const [translationStyle, setTranslationStyle] = useState<'modern' | 'ancient'>('ancient');


  const [mobileTab, setMobileTab] = useState<'input' | 'reader'>('input');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisType, setAnalysisType] = useState<'summary' | 'explain' | null>(null);

  const [apiKeys, setApiKeys] = useState<string[]>(['', '', '']);
  const [chatgptKeys, setChatgptKeys] = useState<string[]>(['', '', '']);
  const [groqKeys, setGroqKeys] = useState<string[]>(['', '', '']);
  const [deepseekKeys, setDeepseekKeys] = useState<string[]>(['', '', '']);
  const [qwenKeys, setQwenKeys] = useState<string[]>(['', '', '']);
    const [aiPriority, setAiPriority] = useState<AiProvider[]>(DEFAULT_AI_PRIORITY);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // --- AUTO & TIMER & COUNTER STATES ---
  const [isAutoMode, setIsAutoMode] = useState(false);
  const listenEnabled = useRef(false);
  useEffect(() => { listenEnabled.current = isAutoMode; }, [isAutoMode]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [autoStopChapterLimit, setAutoStopChapterLimit] = useState<number>(0);
  const [chaptersReadCount, setChaptersReadCount] = useState<number>(0);

  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const diagnostics = useDiagnostics();
  const consoleLogs = diagnostics.logs;

  // --- PRELOAD STATES ---


  // --- NEW FEATURES STATES ---
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [fontSize, setFontSize] = useState(18);
  const [showAppearance, setShowAppearance] = useState(false);

  const [showBatchPanel, setShowBatchPanel] = useState(false);

  // --- CACHE STATE ---
  const library = useChapterLibrary();
  const chapters = library.chapters;
  const bookLibrary = useBooks();
  const books = useMemo(() => localBooks(chapters, bookLibrary.books), [chapters, bookLibrary.books]);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showCache, setShowCache] = useState(false);


  // --- NEW FEATURES: BOOKMARK, EXPORT, SEARCH, ZEN, STATS ---
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const reading = useReadingStats(activeChapterId);
  const readingStats = reading.stats;
  const [showStats, setShowStats] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedChaptersForExport, setSelectedChaptersForExport] = useState<string[]>([]);
    const [exportTxtSeparatorStyle, setExportTxtSeparatorStyle] = useState<'none' | 'line'>('none');
  const [selectedChaptersForDelete, setSelectedChaptersForDelete] = useState<string[]>([]);


  const chunkRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
    const hasAnyTranslationKey = useCallback(() => {
            const hasGemini = apiKeys.some(k => k && k.trim().length > 0);
            const hasChatgpt = chatgptKeys.some(k => k && k.trim().length > 0);
            const hasGroq = groqKeys.some(k => k && k.trim().length > 0);
            const hasDeepseek = deepseekKeys.some(k => k && k.trim().length > 0);
            const hasQwen = qwenKeys.some(k => k && k.trim().length > 0);
            return hasGemini || hasChatgpt || hasGroq || hasDeepseek || hasQwen;
    }, [apiKeys, chatgptKeys, groqKeys, deepseekKeys, qwenKeys]);

  // --- INIT ---
  useEffect(() => {
    const loadThreeKeys = (storageKey: string): string[] => {
        const saved = storage.getItem(storageKey);
        if (!saved) return ['', '', ''];
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(value => typeof value === 'string')) return parsed as string[];
        } catch { /* Ignore invalid legacy saved settings. */ }
        return ['', '', ''];
    };

    // Gemini (with legacy migration)
    let loadedGeminiKeys = loadThreeKeys('gemini_api_keys');
    if (loadedGeminiKeys.every(k => !k || !k.trim())) {
        const oldKey = storage.getItem('gemini_api_key');
        if (oldKey) {
            loadedGeminiKeys = [oldKey, '', ''];
            storage.setItem('gemini_api_keys', JSON.stringify(loadedGeminiKeys));
        }
    }

    const loadedGroqKeys = loadThreeKeys('groq_api_keys');
    const loadedQwenKeys = loadThreeKeys('qwen_api_keys');
    const loadedDeepseekKeys = loadThreeKeys('deepseek_api_keys');
    const loadedChatgptKeys = loadThreeKeys('chatgpt_api_keys');

    setApiKeys(loadedGeminiKeys);
    setGroqKeys(loadedGroqKeys);
    setQwenKeys(loadedQwenKeys);
    setDeepseekKeys(loadedDeepseekKeys);
    setChatgptKeys(loadedChatgptKeys);

    // AI settings are opened only when the user chooses translation.

    // Load Settings
    const savedTheme = storage.getItem('reader_theme') as 'light' | 'dark' | 'sepia';
    if (['light', 'dark', 'sepia'].includes(savedTheme)) setTheme(savedTheme);
    const savedSize = storage.getItem('reader_font_size');
    if (savedSize && Number.isFinite(Number(savedSize))) setFontSize(Math.min(32, Math.max(14, Number(savedSize))));
    // Load new features data
    const savedBookmarks = storage.getItem('reader_bookmarks');
    if (savedBookmarks) {
        try { const value: unknown = JSON.parse(savedBookmarks); if (Array.isArray(value)) setBookmarks(value.filter((entry): entry is BookmarkEntry => !!entry && typeof entry.url === 'string' && typeof entry.title === 'string')); } catch { /* Ignore invalid legacy saved settings. */ }
    }


    const savedExportSeparator = storage.getItem('reader_export_txt_separator');
    // Backward compatible: previously we used 'blank' (insert blank lines). Now user wants no separator.
    if (savedExportSeparator === 'line') {
        setExportTxtSeparatorStyle('line');
    } else if (savedExportSeparator === 'blank') {
        setExportTxtSeparatorStyle('none');
    } else if (savedExportSeparator === 'none') {
        setExportTxtSeparatorStyle('none');
    }

    const savedAiPriority = storage.getItem('reader_ai_priority');
    if (savedAiPriority) {
        try {
            const parsed = JSON.parse(savedAiPriority);
            setAiPriority(normalizeAiPriority(parsed));
        } catch { /* Ignore invalid legacy saved settings. */ }
    }

  }, []);

  useEffect(() => {
      storage.setItem('reader_export_txt_separator', exportTxtSeparatorStyle);
  }, [exportTxtSeparatorStyle]);

  useEffect(() => {
      storage.setItem('reader_ai_priority', JSON.stringify(aiPriority));
  }, [aiPriority]);

  const moveAiProvider = (provider: AiProvider, direction: -1 | 1) => {
      setAiPriority(prev => {
          const idx = prev.indexOf(provider);
          if (idx < 0) return prev;
          const nextIdx = idx + direction;
          if (nextIdx < 0 || nextIdx >= prev.length) return prev;
          const next = [...prev];
          const tmp = next[idx];
          next[idx] = next[nextIdx];
          next[nextIdx] = tmp;
          return next;
      });
  };

  const saveToCache = (id: string, original: string, translated: string, nextUrl: string | null, prevUrl: string | null, style?: TranslationStyle) => {
      if (!id || !original) return;
      const item = createChapter(id, { content: original, nextUrl, prevUrl }, translated, style);
      library.add(item);
  };

  // --- BOOKMARK FUNCTIONS ---
  const toggleBookmark = () => {
      if (!activeChapterId) return;
      const currentUrl = activeChapterId;
      const isBookmarked = bookmarks.some(b => b.url === currentUrl);

      if (isBookmarked) {
          // Remove bookmark
          const newBookmarks = bookmarks.filter(b => b.url !== currentUrl);
          setBookmarks(newBookmarks);
          storage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
      } else {
          // Add bookmark
          let title = "Chương không tên";
          if (textToRead) {
              const lines = textToRead.split('\n');
              if (lines.length > 0) title = lines[0].substring(0, 50);
          }
          const newBookmark = {
              url: currentUrl,
              title,
              chunkIndex: speech.status === 'idle' ? readProgress(activeChapterId, readerVersion) : speech.paragraph,
              version: readerVersion,
              timestamp: Date.now()
          };
          const newBookmarks = [newBookmark, ...bookmarks].slice(0, 20);
          setBookmarks(newBookmarks);
          storage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
      }
  };

  const removeBookmark = (url: string) => {
      const newBookmarks = bookmarks.filter(b => b.url !== url);
      setBookmarks(newBookmarks);
      storage.setItem('reader_bookmarks', JSON.stringify(newBookmarks));
  };

  const loadBookmark = async (bookmark: BookmarkEntry) => {
      const version = bookmark.version || readerVersion;
      saveProgress(bookmark.url, version, bookmark.chunkIndex);
      await loadChapter(bookmark.url);
      setReaderVersion(version); setBookmarkPosition(bookmark.chunkIndex);
      setShowBookmarks(false);
  };

  // --- SEARCH FUNCTIONS ---
  const performSearch = () => {
      if (!searchQuery || !textToRead) {
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
      setSelectedChaptersForExport(chapters.map(c => c.url));
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
      setSelectedChaptersForDelete(chapters.map(c => c.url));
  };

  const deleteSelectedChapters = () => {
      if (selectedChaptersForDelete.length === 0) return;

      library.remove(selectedChaptersForDelete);
      setSelectedChaptersForDelete([]);
  };

  const exportText = () => {
      const selected = chapters.filter(chapter => selectedChaptersForExport.includes(chapter.url)).sort((a, b) => a.timestamp - b.timestamp);
      return selected.length ? selected.map(chapter => (readerVersion === 'translated' ? chapter.translatedContent || chapter.content : chapter.content).replace(/\n\n=-=\s*$/, '').trim()).join(exportTxtSeparatorStyle === 'line' ? `\n\n${'='.repeat(50)}\n\n` : '\n\n') : textToRead;
  };
  const exportToTxt = () => {
      const text = exportText(); if (!text) return;
      downloadText(text); setShowExportMenu(false); setSelectedChaptersForExport([]);
  };
  const exportToPdf = () => {
      const text = exportText(); if (!text) return;
      if (!printText(text)) { setError('Trình duyệt chặn cửa sổ in. Hãy cho phép mở cửa sổ mới.'); return; }
      setShowExportMenu(false); setSelectedChaptersForExport([]);
  };

  // Zen mode keyboard shortcut
  useEffect(() => {
      const handleKeyPress = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && zenMode) {
              setZenMode(false);
          } else if (e.key === 'f' && e.ctrlKey && content) {
              e.preventDefault();
              setZenMode(!zenMode);
          }
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
  }, [zenMode, content]);


  const changeTheme = (t: 'light' | 'dark' | 'sepia') => {
      setTheme(t);
      storage.setItem('reader_theme', t);
  };

  const changeFontSize = (s: number) => {
      setFontSize(s);
      storage.setItem('reader_font_size', s.toString());
  };

  const setTimer = (m: number) => { setTimeLeft(m * 60); setShowMobileSettings(false); };
  const setChapterLimit = (c: number) => { setAutoStopChapterLimit(c); setChaptersReadCount(0); setShowMobileSettings(false); };


  const fetchTranslation = (text: string, styleOverride?: TranslationStyle, signal?: AbortSignal) => translateText(text, {
      keys: { gemini: apiKeys, groq: groqKeys, qwen: qwenKeys, deepseek: deepseekKeys, chatgpt: chatgptKeys },
      priority: aiPriority,
      signal,
      style: styleOverride || translationStyle,
  });

  const batch = useBatchTranslation({ chapters: chapters, translate: fetchTranslation,
      hasKeys: hasAnyTranslationKey(), onError: setError, onNeedKeys: () => setShowApiKeyInput(true),
      onChapter: library.add,
  });

  const preload = useChapterPreload({ enabled: isAutoMode && (autoStopChapterLimit === 0 || chaptersReadCount + 1 < autoStopChapterLimit),
      url: nextChapterUrl, style: translationStyle, translateEnabled: autoTranslate, chapters: chapters,
      translate: fetchTranslation,
      onChapter: library.add,
      onError: message => { setError(message); },
  });
  const preloadedData = preload.chapter;

  // --- HANDLERS ---

  const loadChapter = async (targetUrl: string, isAutoNav = false) => {
      setBookmarkPosition(null); handingOff.current = isAutoNav;
      if (isAutoNav && autoStopChapterLimit > 0 && chaptersReadCount + 1 >= autoStopChapterLimit) {
          setIsAutoMode(false); rawSpeech.stop(); return;
      }
      if (isAutoNav) setChaptersReadCount(previous => previous + 1);
      if (isAutoNav) rawSpeech.prepareChapter(); else rawSpeech.stop();
      const cached = chapters.find(chapter => chapter.url === targetUrl) || (preloadedData?.url === targetUrl ? preloadedData : null);
      if (cached) {
          loadController.current?.abort();
          const controller = new AbortController(); loadController.current = controller;
          const epoch = ++requestEpoch.current;
          setLoading(false); setTranslating(false); setError(''); setPendingPlay(false); setAnalysisType(null);
          setActiveChapterId(targetUrl);
          setUrl(targetUrl.startsWith('manual:') ? '' : targetUrl);
          setContent(cached.content); setTranslatedContent(cached.translatedContent);
          setNextChapterUrl(cached.nextUrl); setPrevChapterUrl(cached.prevUrl);
          const useTranslation = autoTranslate || readerVersion === 'translated';
          const nextVersion = useTranslation && cached.translatedContent ? 'translated' : 'original';
          setReaderVersion(nextVersion);
          if (!isAutoNav && targetUrl === activeChapterId && nextVersion === readerVersion) rawSpeech.restorePosition(readProgress(targetUrl, nextVersion));
          setMobileTab('reader');
          if (autoTranslate && (!cached.translatedContent || cached.translationType !== translationStyle)) {
              setTranslating(true);
              try {
                  const translated = await fetchTranslation(cached.content, translationStyle, controller.signal);
                  if (epoch !== requestEpoch.current) return;
                  setTranslatedContent(translated); setReaderVersion('translated');
                  saveToCache(targetUrl, cached.content, translated, cached.nextUrl, cached.prevUrl, translationStyle);
              } catch (error) { if (!controller.signal.aborted) { setError(errorMessage(error)); return; } }
              finally { if (epoch === requestEpoch.current) setTranslating(false); }
          }
          if (isAutoNav && listenEnabled.current && epoch === requestEpoch.current) setPendingPlay(true);
          return;
      }
      if (targetUrl.startsWith('manual:')) { setError('Văn bản này đã bị xóa khỏi thư viện.'); return; }
      await fetchContent(targetUrl, isAutoNav);
  };

  const rawSpeech = useTtsReader({ paragraphs: chunks, contentKey, initialParagraph,
      onParagraph: paragraph => saveProgress(activeChapterId, readerVersion, paragraph),
      onComplete: () => { reading.complete(); if (isAutoMode && nextChapterUrl) void loadChapter(nextChapterUrl, true); },
  });
  const stopSession = rawSpeech.stop;
  const stopListening = useCallback(() => {
      stopSession(); setPendingPlay(false); listenEnabled.current = false; setIsAutoMode(false);
      if (handingOff.current) { requestEpoch.current++; loadController.current?.abort(); setLoading(false); setTranslating(false); }
      handingOff.current = false;
  }, [stopSession]);
  const waitingForChapter = handingOff.current && (loading || translating || pendingPlay);
  const speech = { ...rawSpeech, ...(waitingForChapter ? { status: 'playing' as const, phase: 'preparing' as const, loading: true, loadingMessage: 'Đang chuẩn bị chương tiếp…' } : {}),
      stop: stopListening, toggle: () => { if (waitingForChapter) stopListening(); else rawSpeech.toggle(); } };
  const { paragraph: speechParagraph, play: playSpeech, stop: stopSpeech } = speech;
  usePlaybackIntegration(speech, chunks[0] || '', books.find(book => book.chapters.some(chapter => chapter.url === activeChapterId)),
    prevChapterUrl ? () => { void loadChapter(prevChapterUrl); } : undefined,
    nextChapterUrl ? () => { void loadChapter(nextChapterUrl); } : undefined);
  const queueChapter = speech.queueChapter;
  useEffect(() => {
      const translated = (autoTranslate || readerVersion === 'translated') && !!preloadedData?.translatedContent;
      const text = preloadedData ? translated ? preloadedData.translatedContent : preloadedData.content : '';
      queueChapter(preloadedData ? `${preloadedData.url}:${translated ? 'translated' : 'original'}` : '', text.replace(/\*\*/g, '').split(/\n+/).map(line => line.trim()).filter(Boolean));
  }, [preloadedData, autoTranslate, readerVersion, queueChapter]);

  useEffect(() => {
      if (timeLeft === null) return;
      if (timeLeft <= 0) { stopSpeech(); setIsAutoMode(false); setPendingPlay(false); setTimeLeft(null); return; }
      const timer = setInterval(() => setTimeLeft(previous => previous === null ? null : previous - 1), 1000);
      return () => clearInterval(timer);
  }, [timeLeft, stopSpeech]);
  const handleScroll = () => {
      if (speech.status !== 'idle' || !activeChapterId || !containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      const index = chunkRefs.current.findIndex(element => element && element.getBoundingClientRect().bottom > top + 30);
      if (index >= 0) saveProgress(activeChapterId, readerVersion, index);
  };
  const restored = useRef(false);
  useEffect(() => {
      if (activeChapterId) { storage.setItem('reader_last_chapter', activeChapterId); storage.setItem('reader_last_version', readerVersion); }
  }, [activeChapterId, readerVersion]);
  useEffect(() => {
      if (!library.ready || restored.current) return;
      restored.current = true;
      const id = storage.getItem('reader_last_chapter');
      if (!activeChapterId && id && chapters.some(chapter => chapter.url === id)) void loadChapter(id);
  }, [library.ready, chapters, activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
      chunkRefs.current[speechParagraph]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [speechParagraph, contentKey]);
  useEffect(() => {
      if (pendingPlay && !loading && !translating && chunks.length) {
          setPendingPlay(false); handingOff.current = false; playSpeech(0);
      }
  }, [pendingPlay, loading, translating, chunks, playSpeech]);
  useEffect(() => {
      const handler = (event: Event) => setError((event as CustomEvent<string>).detail);
      window.addEventListener('reader-storage-error', handler);
      return () => { window.removeEventListener('reader-storage-error', handler); loadController.current?.abort(); };
  }, []);

  const analyzeContent = async (type: 'summary' | 'explain') => {
    if (!textToRead) return;
    if (!hasAnyTranslationKey()) { setError('Nhập API key để dùng công cụ AI.'); setShowApiKeyInput(true); setMobileTab('input'); return; }
    const epoch = requestEpoch.current;
    setAnalyzing(true); setAnalysisType(type); setAnalysisResult('');
    try {
      const result = await analyzeText(textToRead, type, { keys: { gemini: apiKeys, groq: groqKeys, qwen: qwenKeys, deepseek: deepseekKeys, chatgpt: chatgptKeys }, priority: aiPriority, style: translationStyle });
      if (epoch === requestEpoch.current) setAnalysisResult(result);
    } catch (error) { if (epoch === requestEpoch.current) setAnalysisResult(errorMessage(error)); }
    finally { setAnalyzing(false); }
  };

  const updateKey = (index: number, val: string) => {
      const newKeys = [...apiKeys];
      newKeys[index] = val;
      setApiKeys(newKeys);
      storage.setItem('gemini_api_keys', JSON.stringify(newKeys));
  };

  const updateGroqKey = (index: number, val: string) => {
      const newKeys = [...groqKeys];
      newKeys[index] = val;
      setGroqKeys(newKeys);
      storage.setItem('groq_api_keys', JSON.stringify(newKeys));
  };

  const updateQwenKey = (index: number, val: string) => {
      const newKeys = [...qwenKeys];
      newKeys[index] = val;
      setQwenKeys(newKeys);
      storage.setItem('qwen_api_keys', JSON.stringify(newKeys));
  };

  const updateDeepseekKey = (index: number, val: string) => {
      const newKeys = [...deepseekKeys];
      newKeys[index] = val;
      setDeepseekKeys(newKeys);
      storage.setItem('deepseek_api_keys', JSON.stringify(newKeys));
  };

  const updateChatgptKey = (index: number, val: string) => {
      const newKeys = [...chatgptKeys];
      newKeys[index] = val;
      setChatgptKeys(newKeys);
      storage.setItem('chatgpt_api_keys', JSON.stringify(newKeys));
  };



  const fetchContent = async (overrideUrl?: string, continueListening = false) => {
    const urlToFetch = overrideUrl || url;
    const fromUrl = !!overrideUrl || inputMode === 'url';
    if (fromUrl && !urlToFetch.trim()) { setError('Vui lòng nhập liên kết chương truyện.'); return; }
    if (!fromUrl && !content.trim()) { setError('Vui lòng dán nội dung.'); return; }
    setBookmarkPosition(null); if (continueListening) rawSpeech.prepareChapter(); else rawSpeech.stop(); loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    const epoch = ++requestEpoch.current;
    setLoading(true); setTranslating(false); setError(''); setPendingPlay(false);
    try {
        const data = fromUrl ? await fetchRawStoryData(urlToFetch, controller.signal)
            : { content, nextUrl: null, prevUrl: null };
        if (epoch !== requestEpoch.current) return;
        const id = fromUrl ? new URL(urlToFetch).href : activeChapterId.startsWith('manual:') ? activeChapterId : `manual:${crypto.randomUUID()}`;
        setActiveChapterId(id); setUrl(fromUrl ? id : '');
        setContent(data.content); setTranslatedContent(''); setReaderVersion('original');
        setNextChapterUrl(data.nextUrl); setPrevChapterUrl(data.prevUrl);
 setAnalysisType(null); setMobileTab('reader');
        if (!continueListening) setChaptersReadCount(0);
        saveToCache(id, data.content, '', data.nextUrl, data.prevUrl);
        if (autoTranslate) {
            setTranslating(true);
            const translated = await fetchTranslation(data.content, translationStyle, controller.signal);
            if (epoch !== requestEpoch.current) return;
            setTranslatedContent(translated); setReaderVersion('translated'); saveToCache(id, data.content, translated, data.nextUrl, data.prevUrl, translationStyle);
        }
        if (continueListening && listenEnabled.current) setPendingPlay(true);
    } catch (error) {
        if (epoch === requestEpoch.current && !controller.signal.aborted) { setError(errorMessage(error)); setPendingPlay(false); }
    } finally {
        if (epoch === requestEpoch.current) { setLoading(false); setTranslating(false); }
    }
  };
  const translateContent = async () => {
    if (!content) return;
    if (!hasAnyTranslationKey()) {
        setError('Nhập API key để dịch. Bạn vẫn có thể đọc và nghe bản gốc.');
        setShowApiKeyInput(true); return;
    }
    speech.stop();
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    const epoch = ++requestEpoch.current;
    const id = activeChapterId || `manual:${crypto.randomUUID()}`;
    setActiveChapterId(id); setTranslating(true); setError(''); setAnalysisType(null);
    try {
        const translated = await fetchTranslation(content, translationStyle, controller.signal);
        if (epoch !== requestEpoch.current) return;
        setTranslatedContent(translated); setReaderVersion('translated'); setMobileTab('reader');
        saveToCache(id, content, translated, nextChapterUrl, prevChapterUrl, translationStyle);
    } catch (error) { if (epoch === requestEpoch.current && !controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (epoch === requestEpoch.current) setTranslating(false); }
  };

  return (
    <AppShell theme={theme} active={mobileTab} onView={setMobileTab} onLibrary={() => setShowCache(true)} onSettings={() => setShowMobileSettings(true)}
      source={<SourcePanel mode={inputMode} onMode={mode => {
          if (mode === 'manual') {
            speech.stop(); requestEpoch.current++; loadController.current?.abort(); setLoading(false); setTranslating(false);
            setActiveChapterId(''); setUrl(''); setPendingPlay(false); setNextChapterUrl(null); setPrevChapterUrl(null);
            setTranslatedContent(''); setReaderVersion('original');
          }
          setInputMode(mode);
        }} url={url} onUrl={setUrl} content={content}
        onContent={text => { speech.stop(); requestEpoch.current++; setTranslating(false); setContent(text); setTranslatedContent(''); setReaderVersion('original'); }}
        loading={loading} translating={translating} error={error} onFetch={() => { void fetchContent(); }} onRead={() => setMobileTab('reader')}
        onTranslate={() => { void translateContent(); }} onCancel={() => { loadController.current?.abort(); setPendingPlay(false); }}
        style={translationStyle} onStyle={setTranslationStyle} onSettings={() => setShowApiKeyInput(!showApiKeyInput)}
        recent={chapters} onChapter={id => { void loadChapter(id); }} onLibrary={() => setShowCache(true)}
        settings={showApiKeyInput && <ApiKeySettings keys={{ gemini: apiKeys, groq: groqKeys, qwen: qwenKeys, deepseek: deepseekKeys, chatgpt: chatgptKeys }}
          priority={aiPriority} onMove={moveAiProvider} onReset={() => setAiPriority(DEFAULT_AI_PRIORITY)} onClose={() => setShowApiKeyInput(false)}
          onKey={(provider, index, value) => ({ gemini: updateKey, groq: updateGroqKey, qwen: updateQwenKey, deepseek: updateDeepseekKey, chatgpt: updateChatgptKey })[provider](index, value)} />}
      />}
      reader={<ReaderView version={readerVersion} hasTranslation={!!translatedContent} onVersion={version => { speech.stop(); setPendingPlay(false); setReaderVersion(version); }}
        paragraphs={chunks} selectedParagraph={speech.paragraph} onSelectParagraph={speech.selectParagraph}
        containerRef={containerRef} paragraphRefs={chunkRefs} fontSize={fontSize} theme={theme} loading={loading}
        previous={prevChapterUrl} next={nextChapterUrl} onNavigate={target => { void loadChapter(target); }} onScroll={handleScroll} onAdd={() => setMobileTab('input')}
        toolbar={<ReaderToolbar title={chunks[0] || ''} hasContent={!!content} bookmarked={bookmarks.some(bookmark => bookmark.url === activeChapterId)}
          status={isAutoMode && nextChapterUrl ? preloadedData ? 'Chương sau đã sẵn sàng' : 'Đang tải trước chương sau' : readerVersion === 'translated' ? 'Đang đọc bản dịch' : content ? 'Đang đọc bản gốc' : ''}
          onBookmark={toggleBookmark} onBookmarks={() => setShowBookmarks(true)} onSearch={() => setShowSearch(true)} onExport={() => setShowExportMenu(true)}
          onFocus={() => setZenMode(true)} onAppearance={() => setShowAppearance(true)} onSettings={() => setShowMobileSettings(true)} />}
        footer={<SpeechControls onExpand={() => setShowPlayer(true)} speech={speech} count={chunks.length} autoNext={isAutoMode} onAutoNext={() => { setIsAutoMode(!isAutoMode); setChaptersReadCount(0); }} />}
      >
        {error && <p role="alert" className="reader-message inline-message">{error}</p>}
             {/* AI Analysis Result Panel */}
             {analysisType && (
                 <div className="analysis-panel">
                     <div className="p-3 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                         <span className="font-bold text-indigo-700 flex items-center gap-2">Phân tích nội dung</span>
                         <button onClick={() => setAnalysisType(null)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                     </div>
                     <div className="p-5 overflow-y-auto text-sm leading-7 text-slate-700 whitespace-pre-line font-serif">
                         {analyzing ? <div className="flex items-center gap-2 text-slate-500 italic"><RotateCw className="animate-spin" size={16}/> Đang suy nghĩ...</div> : analysisResult}
                     </div>
                 </div>
             )}
      </ReaderView>}>

      <PwaStatus/>
      {/* --- MODALS & MENUS --- */}

      {showAppearance && <AppearanceDialog theme={theme} fontSize={fontSize} onTheme={changeTheme} onFontSize={changeFontSize} onClose={() => setShowAppearance(false)} />}

      {showMobileSettings && <ReaderSettings onClose={() => setShowMobileSettings(false)} autoNext={isAutoMode}
        onAutoNext={() => { setIsAutoMode(!isAutoMode); setChaptersReadCount(0); }} autoTranslate={autoTranslate}
        onAutoTranslate={enabled => {
          if (enabled && !hasAnyTranslationKey()) { setShowApiKeyInput(true); setShowMobileSettings(false); setMobileTab('input'); setError('Nhập API key trước khi bật dịch tự động.'); return; }
          setAutoTranslate(enabled);
        }} timeLeft={timeLeft} chapterLimit={autoStopChapterLimit} chapterCount={chaptersReadCount}
        onTimer={setTimer} onLimit={setChapterLimit} onCancelTimer={() => { setTimeLeft(null); setAutoStopChapterLimit(0); }}
        onAnalysis={type => { void analyzeContent(type); setShowMobileSettings(false); }}
        onBatch={() => { setShowMobileSettings(false); setShowBatchPanel(true); }} onStats={() => { setShowMobileSettings(false); setShowStats(true); }}
        onDiagnostics={() => { setShowMobileSettings(false); setShowConsole(true); }}
        onAI={() => { setShowMobileSettings(false); setShowApiKeyInput(true); setMobileTab('input'); }} />}

      {showConsole && <DiagnosticsDialog logs={consoleLogs} onClear={diagnostics.clear} onClose={() => setShowConsole(false)} />}

      {showBatchPanel && <BatchDialog batch={batch} initialUrl={url} hasKeys={hasAnyTranslationKey()} onClose={() => setShowBatchPanel(false)} onConfigure={() => { setShowBatchPanel(false); setShowApiKeyInput(true); setMobileTab('input'); }} />}

      {showCache && <LibraryDialog chapters={chapters} selected={selectedChaptersForDelete}
        books={books} onBook={bookLibrary.save} onRemoveBook={book => { bookLibrary.remove(book.id); library.remove(book.chapters.map(chapter => chapter.url)); }}
        onChapter={library.add} activeChapter={activeChapterId} canDownloadAudio={!!speech.selectedVoice && speech.canCacheAudio}
        onDownloadAudio={async (chapter, signal) => {
          if (!speech.selectedVoice || !speech.canCacheAudio) throw new Error('Chọn Edge, Piper hoặc eSpeak trước khi tải âm thanh.');
          speech.prepareDownload();
          await downloadChapterAudio(chapter, speech.provider as 'edge' | 'piper' | 'espeak', speech.selectedVoice, signal);
        }}
        player={speech.status !== 'idle' && <CompactPlayer speech={speech} title={chunks[0] || ''} onOpen={() => { setShowCache(false); setMobileTab('reader'); }} onExpand={() => { setShowCache(false); setShowPlayer(true); }}/>}

        onToggle={toggleChapterForDelete} onSelectAll={selectAllChaptersForDelete} onDelete={deleteSelectedChapters}
        onClear={() => { if (window.confirm('Xóa toàn bộ thư viện trên thiết bị này?')) { library.clear(); bookLibrary.books.forEach(book => bookLibrary.remove(book.id)); setSelectedChaptersForDelete([]); } }}
        onOpen={id => { void loadChapter(id); setShowCache(false); }} onClose={() => setShowCache(false)} />}
      {mobileTab === 'input' && !showCache && speech.status !== 'idle' && <CompactPlayer speech={speech} title={chunks[0] || ''} floating onOpen={() => setMobileTab('reader')} onExpand={() => setShowPlayer(true)}/>}
      {showPlayer && <ExpandedPlayer speech={speech} title={chunks[0] || ''} count={chunks.length} autoNext={isAutoMode} onAutoNext={() => setIsAutoMode(!isAutoMode)} onClose={() => setShowPlayer(false)} previous={prevChapterUrl ? () => { void loadChapter(prevChapterUrl); } : undefined} next={nextChapterUrl ? () => { void loadChapter(nextChapterUrl); } : undefined} onSettings={() => { setShowPlayer(false); setShowMobileSettings(true); }}/ >}
      {showBookmarks && <BookmarkDialog bookmarks={bookmarks} onLoad={bookmark => { void loadBookmark(bookmark); }} onRemove={removeBookmark}
        onClear={() => { setBookmarks([]); storage.removeItem('reader_bookmarks'); }} onClose={() => setShowBookmarks(false)} />}

      {showSearch && <SearchDialog query={searchQuery} onQuery={setSearchQuery} onSearch={performSearch} results={searchResults} paragraphs={chunks} onResult={jumpToSearchResult} onClose={() => setShowSearch(false)} />}

      {showExportMenu && <ExportDialog chapters={chapters} selected={selectedChaptersForExport} onToggle={toggleChapterSelection}
        onAll={selectAllChapters} onClose={() => setShowExportMenu(false)} hasCurrent={!!textToRead} onTxt={exportToTxt} onPdf={exportToPdf}
        separator={exportTxtSeparatorStyle} onSeparator={setExportTxtSeparatorStyle} />}

      {showStats && <StatsDialog stats={readingStats} onClear={reading.clear} onClose={() => setShowStats(false)} />}
      {zenMode && content && <FocusReader paragraphs={chunks} fontSize={fontSize} onFontSize={changeFontSize} onClose={() => setZenMode(false)}
        footer={<SpeechControls onExpand={() => setShowPlayer(true)} speech={speech} count={chunks.length} autoNext={isAutoMode} onAutoNext={() => { setIsAutoMode(!isAutoMode); setChaptersReadCount(0); }} />} />}

    </AppShell>
  );
}
