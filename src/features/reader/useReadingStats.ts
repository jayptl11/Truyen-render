import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from '../../services/storage/local';
export interface ReadingStats { totalChapters: number; totalTime: number; dailyReads: Record<string, number> }
const empty: ReadingStats = { totalChapters: 0, totalTime: 0, dailyReads: {} };
export function useReadingStats(chapterId: string) {
  const [stats, setStats] = useState(() => readJson<ReadingStats>('reader_stats', empty, (value): value is ReadingStats => {
    if (!value || typeof value !== 'object') return false;
    const saved = value as ReadingStats;
    return typeof saved.totalChapters === 'number' && typeof saved.totalTime === 'number' && !!saved.dailyReads && typeof saved.dailyReads === 'object';
  }));
  useEffect(() => {
    if (!chapterId) return;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const elapsed = document.visibilityState === 'hidden' ? 0 : Math.floor((now - last) / 1000);
      last = now;
      if (elapsed <= 0) return;
      setStats(previous => { const next = { ...previous, totalTime: previous.totalTime + elapsed }; writeJson('reader_stats', next); return next; });
    };
    const timer = setInterval(tick, 15000);
    return () => { clearInterval(timer); tick(); };
  }, [chapterId]);
  const complete = useCallback(() => {
    const today = new Date().toLocaleDateString('en-CA');
    setStats(previous => {
      const next = { ...previous, totalChapters: previous.totalChapters + 1,
        dailyReads: { ...previous.dailyReads, [today]: (previous.dailyReads[today] || 0) + 1 } };
      writeJson('reader_stats', next); return next;
    });
  }, []);
  const clear = () => { setStats(empty); writeJson('reader_stats', empty); };
  return { stats, complete, clear };
}
