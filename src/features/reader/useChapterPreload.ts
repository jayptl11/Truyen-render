import { useEffect, useRef, useState } from 'react';
import type { Chapter, TranslationStyle } from '../../types/story';
import { fetchRawStoryData } from '../../services/storySources/client';
import { createChapter } from '../../services/storage/chapters';
import { errorMessage } from '../../services/errors';
interface Options {
  enabled: boolean; url: string | null; style: TranslationStyle; translateEnabled: boolean;
  chapters: Chapter[];
  translate: (text: string, style: TranslationStyle, signal?: AbortSignal) => Promise<string>;
  onChapter: (chapter: Chapter) => void;
  onError: (message: string) => void;
}
export function useChapterPreload(options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  const [result, setResult] = useState<Chapter | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!options.enabled || !options.url) return;
    const url = options.url;
    const controller = new AbortController();
    void (async () => {
      const settings = optionsRef.current;
      const cached = settings.chapters.find(chapter => chapter.url === url);
      const data = cached || await fetchRawStoryData(url, controller.signal);
      const translated = settings.translateEnabled
        ? cached?.translatedContent && cached.translationType === settings.style ? cached.translatedContent : await settings.translate(data.content, settings.style, controller.signal)
        : cached?.translatedContent || '';
      if (controller.signal.aborted) return;
      const chapter = createChapter(url, data, translated, settings.style);
      setError(''); setResult(chapter); settings.onChapter(chapter);
    })().catch(error => {
      if (!controller.signal.aborted) { setError(errorMessage(error)); optionsRef.current.onError(`Không tải trước được chương sau: ${errorMessage(error)}. Bạn vẫn có thể chuyển chương thủ công.`); }
    });
    return () => controller.abort();
  }, [options.enabled, options.url, options.style, options.translateEnabled]);
  return { chapter: options.enabled && result?.url === options.url ? result : null, error };
}
