import { useCallback, useEffect, useState } from 'react';
import type { Chapter } from '../../types/story';
import { readChapters, saveChapters, upsertChapter } from '../../services/storage/chapters';
export function useChapterLibrary() {
  const [chapters, setChapters] = useState(readChapters);
  useEffect(() => { saveChapters(chapters); }, [chapters]);
  const add = useCallback((chapter: Chapter) => setChapters(previous => upsertChapter(previous, chapter)), []);
  const remove = useCallback((ids: string[]) => setChapters(previous => previous.filter(chapter => !ids.includes(chapter.url))), []);
  const clear = useCallback(() => setChapters([]), []);
  return { chapters, add, remove, clear };
}
