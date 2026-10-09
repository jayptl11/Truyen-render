import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chapter } from '../../types/story';
import { readChapters, saveChapters, upsertChapter } from '../../services/storage/chapters';
import { migrateLibrary, storageFailure, writeRecords } from '../../services/storage/database';
export function useChapterLibrary() {
  const [chapters, setChapters] = useState(readChapters);
  const [ready, setReady] = useState(typeof indexedDB === 'undefined');
  const changed = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const cleared = useRef(false);
  const previous = useRef<Chapter[]>([]);
  useEffect(() => {
    let disposed = false;
    void migrateLibrary().then(saved => {
      if (disposed) return;
      previous.current = saved;
      setChapters(current => {
        const merged = new Map((cleared.current ? [] : saved.filter(item => !removed.current.has(item.url))).map(item => [item.url, item]));
        // Only edits made during loading override IndexedDB, never the legacy backup.
        for (const item of current) if (changed.current.has(item.url)) merged.set(item.url, item);
        return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
      });
      setReady(true);
    }).catch(error => { if (!disposed) { storageFailure(error); setReady(true); } });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (typeof indexedDB === 'undefined') { saveChapters(chapters); return; }
    const current = new Set(chapters.map(item => item.url));
    const deleted = previous.current.filter(item => !current.has(item.url)).map(item => item.url);
    const updates = chapters.filter(item => previous.current.find(old => old.url === item.url) !== item);
    previous.current = chapters;
    void writeRecords('chapters', updates, deleted).catch(storageFailure);
  }, [chapters, ready]);
  const add = useCallback((chapter: Chapter) => { changed.current.add(chapter.url); removed.current.delete(chapter.url); setChapters(previous => upsertChapter(previous, chapter)); }, []);
  const remove = useCallback((ids: string[]) => { ids.forEach(id => removed.current.add(id)); setChapters(previous => previous.filter(chapter => !ids.includes(chapter.url))); }, []);
  const clear = useCallback(() => { cleared.current = true; setChapters([]); }, []);
  return { chapters, add, remove, clear, ready };
}
