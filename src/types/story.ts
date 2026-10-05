export type AiProvider = 'gemini' | 'groq' | 'qwen' | 'deepseek' | 'chatgpt';
export type TranslationStyle = 'modern' | 'ancient';
export type ReaderVersion = 'original' | 'translated';
export interface StoryContent {
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
}
export interface Chapter extends StoryContent {
  /** A source URL or a stable manual:<uuid> identifier. Never the input draft URL. */
  url: string;
  title: string;
  translatedContent: string;
  timestamp: number;
  translationType?: TranslationStyle;
  webName: string;
}
export interface BookmarkEntry {
  version?: ReaderVersion;
  url: string;
  title: string;
  chunkIndex: number;
  timestamp: number;
}
export interface ReadingProgress {
  chapterId: string;
  version: ReaderVersion;
  paragraph: number;
}

export interface ChapterReference { url: string; title: string; index: number }
export interface Book {
  id: string; title: string; source: string; author: string; cover: string; description: string;
  chapters: ChapterReference[]; catalogNext: string | null; updated: number;
}
