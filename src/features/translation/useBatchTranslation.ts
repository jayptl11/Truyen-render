import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chapter, TranslationStyle } from '../../types/story';
import { createChapter } from '../../services/storage/chapters';
import { readJson, storage, writeJson } from '../../services/storage/local';
import { fetchRawStoryData, storyUrl } from '../../services/storySources/client';
import { errorMessage } from '../../services/errors';

export interface BatchState {
  isActive: boolean; startUrl: string; currentUrl: string;
  count: number; translated: number; style: TranslationStyle;
}
export interface BatchProgress { current: number; total: number; currentUrl: string; error?: string }
interface Options {
  chapters: Chapter[];
  translate: (text: string, style: TranslationStyle, signal?: AbortSignal) => Promise<string>;
  onChapter: (chapter: Chapter) => void;
  hasKeys: boolean;
  onError: (message: string) => void;
  onNeedKeys: () => void;
}
function readBatch(): BatchState | null {
  return readJson<BatchState | null>('reader_batch_state', null, (value): value is BatchState | null => {
    if (!value || typeof value !== 'object') return false;
    const s = value as Partial<BatchState>;
    return s.isActive === true && typeof s.startUrl === 'string' && typeof s.currentUrl === 'string'
      && Number.isInteger(s.count) && s.count! > 0 && s.count! <= 500
      && Number.isInteger(s.translated) && s.translated! >= 0 && s.translated! <= s.count!
      && (s.style === 'modern' || s.style === 'ancient');
  });
}
export function useBatchTranslation(options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  const [state, setState] = useState(readBatch);
  const [progress, setProgress] = useState<BatchProgress>(() => ({ current: state?.translated || 0, total: state?.count || 0, currentUrl: state?.currentUrl || '' }));
  const [running, setRunning] = useState(false);
  const [autoResume, setAutoResumeValue] = useState(() => storage.getItem('reader_batch_auto_resume') === '1');
  const controllerRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const resumeAttempted = useRef(false);
  const persist = useCallback((value: BatchState | null) => {
    setState(value);
    if (value) writeJson('reader_batch_state', value); else storage.removeItem('reader_batch_state');
  }, []);
  const start = useCallback(async (startUrl: string, count: number, style: TranslationStyle, resume?: BatchState) => {
    if (runningRef.current) return;
    if (!optionsRef.current.hasKeys) { optionsRef.current.onNeedKeys(); optionsRef.current.onError('Nhập API key để dịch hàng loạt.'); return; }
    try { startUrl = storyUrl(startUrl); } catch { optionsRef.current.onError('Liên kết bắt đầu không hợp lệ.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 500) { optionsRef.current.onError('Số chương phải từ 1 đến 500.'); return; }
    const controller = new AbortController(); controllerRef.current = controller;
    runningRef.current = true; setRunning(true);
    let current: BatchState = resume || { isActive: true, startUrl, currentUrl: startUrl, count, translated: 0, style };
    const seen = new Set<string>();
    persist(current);
    try {
      while (current.translated < current.count && current.currentUrl && !controller.signal.aborted) {
        const url = current.currentUrl;
        if (seen.has(url)) throw new Error('Nguồn truyện lặp lại liên kết chương; đã dừng để tránh dịch trùng.');
        seen.add(url);
        setProgress({ current: current.translated, total: current.count, currentUrl: url });
        const cached = optionsRef.current.chapters.find(c => c.url === url);
        const data = cached || await fetchRawStoryData(url, controller.signal);
        if (controller.signal.aborted) break;
        const translated = cached?.translatedContent && cached.translationType === current.style
          ? cached.translatedContent : await optionsRef.current.translate(data.content, current.style, controller.signal);
        if (controller.signal.aborted) break;
        optionsRef.current.onChapter(createChapter(url, data, translated, current.style));
        current = { ...current, translated: current.translated + 1, currentUrl: data.nextUrl || '' };
        persist(current);
        setProgress({ current: current.translated, total: current.count, currentUrl: current.currentUrl || url });
      }
      if (!controller.signal.aborted) {
        persist(null);
        optionsRef.current.onError(`Đã dịch ${current.translated}/${current.count} chương${!current.currentUrl ? ' · hết chương ở nguồn.' : '.'}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = errorMessage(error);
        setProgress({ current: current.translated, total: current.count, currentUrl: current.currentUrl, error: message });
        optionsRef.current.onError(`Dịch hàng loạt bị dừng: ${message}. Tiến độ đã lưu để tiếp tục.`);
      }
    } finally { runningRef.current = false; setRunning(false); }
  }, [persist]);
  const resume = useCallback(async (value: BatchState | null = state) => {
    if (!value || value.translated >= value.count || !value.currentUrl) { persist(null); return; }
    await start(value.currentUrl, value.count - value.translated, value.style, value);
  }, [state, start, persist]);
  const stop = useCallback(() => { controllerRef.current?.abort(); }, []);
  const clear = useCallback(() => { if (!runningRef.current) persist(null); }, [persist]);
  const setAutoResume = (value: boolean) => { setAutoResumeValue(value); storage.setItem('reader_batch_auto_resume', value ? '1' : '0'); };
  useEffect(() => {
    if (autoResume && options.hasKeys && state && !resumeAttempted.current) {
      resumeAttempted.current = true; void resume(state);
    }
  }, [autoResume, options.hasKeys, state, resume]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  return { state, progress, running, autoResume, setAutoResume, start, resume, stop, clear };
}
