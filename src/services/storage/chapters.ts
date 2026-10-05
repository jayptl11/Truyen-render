import type { Chapter, ReaderVersion, ReadingProgress, StoryContent } from '../../types/story';
import { readJson, writeJson } from './local';

export const CHAPTER_CACHE_KEY = 'reader_translated_cache';
export function readChapters(): Chapter[] {
  const saved = readJson<unknown>(CHAPTER_CACHE_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((entry): entry is Chapter => !!entry && typeof entry === 'object'
    && typeof entry.url === 'string' && typeof entry.content === 'string')
    .map(entry => ({ ...entry, translatedContent: typeof entry.translatedContent === 'string' ? entry.translatedContent : '',
      title: typeof entry.title === 'string' ? entry.title : entry.content.split('\n')[0].slice(0, 100),
      webName: typeof entry.webName === 'string' ? entry.webName : 'Văn bản', timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
      nextUrl: typeof entry.nextUrl === 'string' ? entry.nextUrl : null, prevUrl: typeof entry.prevUrl === 'string' ? entry.prevUrl : null }));
}
export function upsertChapter(chapters: Chapter[], item: Chapter): Chapter[] {
  const previous = chapters.find(chapter => chapter.url === item.url);
  // Refetching original content must not erase an existing translation.
  const merged = previous && previous.content === item.content && !item.translatedContent
    ? { ...item, translatedContent: previous.translatedContent, translationType: previous.translationType }
    : item;
  return [merged, ...chapters.filter(chapter => chapter.url !== item.url)].slice(0, 500);
}
export function createChapter(id: string, data: StoryContent, translation = '', style?: Chapter['translationType']): Chapter {
  let webName = 'Văn bản nhập tay';
  if (!id.startsWith('manual:')) {
    try { webName = new URL(id).hostname || webName; } catch { /* Manual IDs are not URLs. */ }
  }
  return { ...data, url: id, title: (translation || data.content).split('\n')[0].slice(0, 100),
    translatedContent: translation, translationType: style, timestamp: Date.now(), webName };
}
export function saveChapters(chapters: Chapter[]): void { writeJson(CHAPTER_CACHE_KEY, chapters); }
export function readProgress(chapterId: string, version: ReaderVersion): number {
  const items = readJson<Record<string, ReadingProgress>>('reader_progress', {}, (value): value is Record<string, ReadingProgress> => !!value && typeof value === 'object' && !Array.isArray(value));
  const progress = items[`${chapterId}:${version}`];
  return Number.isInteger(progress?.paragraph) && progress.paragraph >= 0 ? progress.paragraph : 0;
}
export function saveProgress(chapterId: string, version: ReaderVersion, paragraph: number): void {
  if (!chapterId || !Number.isInteger(paragraph) || paragraph < 0) return;
  const items = readJson<Record<string, ReadingProgress>>('reader_progress', {}, (value): value is Record<string, ReadingProgress> => !!value && typeof value === 'object' && !Array.isArray(value));
  items[`${chapterId}:${version}`] = { chapterId, version, paragraph };
  writeJson('reader_progress', Object.fromEntries(Object.entries(items).slice(-1000)));
}
