import type { Book, Chapter, ChapterReference } from '../../types/story';
import { storyUrl } from './client';
export const SOURCES = [{ id: 'webnovel', name: 'Webnovel.vn', origin: 'https://webnovel.vn', description: 'Truyện, mục lục nhiều trang và nội dung chương.' }];
export function bookId(chapter: Chapter): string {
  try {
    const url = new URL(chapter.url);
    if (url.hostname === 'webnovel.vn' && /\/chuong-[^/]+\/?$/.test(url.pathname)) return `${url.origin}/${url.pathname.split('/')[1]}/`;
  } catch { /* Manual entries each keep their own identity. */ }
  return chapter.url;
}
export function localBooks(chapters: Chapter[], saved: Book[]): Book[] {
  const books = new Map(saved.map(book => [book.id, { ...book, chapters: [...book.chapters] }]));
  for (const chapter of chapters) {
    const id = bookId(chapter);
    let book = books.get(id);
    if (!book) {
      const title = id === chapter.url ? chapter.title : decodeURIComponent(new URL(id).pathname.split('/')[1]).replace(/-/g, ' ');
      book = { id, title, source: chapter.webName, author: '', cover: '', description: '', chapters: [], catalogNext: null, updated: chapter.timestamp };
      books.set(id, book);
    }
    if (!book.chapters.some(reference => reference.url === chapter.url)) {
      const index = Number(chapter.url.match(/\/chuong-(\d+)/)?.[1]) || book.chapters.length + 1;
      book.chapters.push({ url: chapter.url, title: chapter.title, index });
    }
    book.updated = Math.max(book.updated, chapter.timestamp);
  }
  return [...books.values()].map(book => ({ ...book, chapters: book.chapters.sort((a, b) => a.index - b.index) })).sort((a, b) => b.updated - a.updated);
}
export async function fetchSourceDocument(value: string, signal?: AbortSignal) {
  const url = storyUrl(value);
  const response = await fetch(`/api/story?url=${encodeURIComponent(url)}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(23000)]) : AbortSignal.timeout(23000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Không tải được mục lục (HTTP ${response.status}).`);
  if (typeof data.html !== 'string') throw new Error('Nguồn không trả về trang truyện.');
  return { html: data.html, url: typeof data.sourceUrl === 'string' ? storyUrl(data.sourceUrl) : url };
}
export function parseBook(html: string, source: string): Book {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.querySelector('#challenge-form, #challenge-running') || /just a moment|access denied/i.test(doc.title)) throw new Error('Nguồn đang yêu cầu xác minh. Mở trang gốc để kiểm tra.');
  const origin = new URL(source);
  const isWebnovel = origin.hostname === 'webnovel.vn';
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const id = isWebnovel ? `${origin.origin}/${origin.pathname.split('/')[1]}/` : canonical ? storyUrl(canonical, source) : source;
  const chapters: ChapterReference[] = [];
  const seen = new Set<string>();
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('#chapterList a[href], .chapter-list a[href], .list-chapter a[href], .list-chapters a[href]')) {
    try {
      const url = storyUrl(link.getAttribute('href')!, source);
      if (new URL(url).origin !== origin.origin || seen.has(url)) continue;
      seen.add(url);
      const index = Number(link.querySelector('.chapter-item__index')?.textContent?.trim() || url.match(/\/chuong-(\d+)/)?.[1]) || chapters.length + 1;
      const text = link.querySelector('.chapter-item__title')?.textContent?.trim() || link.textContent?.replace(/\s+/g, ' ').trim() || `Chương ${index}`;
      chapters.push({ url, title: /^(chương|chapter)\s/i.test(text) ? text : `Chương ${index}: ${text}`, index });
    } catch { /* Non HTTP links are ignored. */ }
  }
  if (!chapters.length) throw new Error('Không tìm thấy mục lục. Dán liên kết trang truyện (không phải một chương), hoặc thêm chương trong Thêm truyện.');
  const title = doc.querySelector('#book-detail-title, .book-title, .title, h1')?.textContent?.trim() || doc.title.split('|')[0].trim();
  let author = '';
  for (const element of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(element.textContent || '{}');
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      const book = items.find((item: { '@type'?: string }) => item['@type'] === 'Book');
      if (book?.author?.name) author = String(book.author.name);
    } catch { /* Metadata is optional. */ }
  }
  const coverValue = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || doc.querySelector('.book-detail__cover img')?.getAttribute('src');
  let cover = ''; try { if (coverValue) cover = storyUrl(coverValue, source); } catch { /* Optional image. */ }
  const active = Number(doc.querySelector('.pagination__link[aria-current="page"]')?.textContent) || 1;
  const next = doc.querySelector<HTMLAnchorElement>(`.pagination a[data-page="${active + 1}"], a[rel="next"]`);
  let catalogNext = null;
  try { if (next?.getAttribute('href')) { const candidate = new URL(storyUrl(next.getAttribute('href')!, source)); candidate.hash = ''; if (candidate.origin === origin.origin && candidate.href !== source) catalogNext = candidate.href; } } catch { /* End of catalog. */ }
  return { id, title, source: origin.hostname, author, cover, description: doc.querySelector('.book-detail__summary, .book-description, meta[name="description"]')?.textContent?.trim() || doc.querySelector('meta[name="description"]')?.getAttribute('content') || '', chapters, catalogNext, updated: Date.now() };
}
export async function fetchBook(url: string, signal?: AbortSignal) { const document = await fetchSourceDocument(url, signal); return parseBook(document.html, document.url); }
export function mergeCatalog(previous: Book, incoming: Book): Book {
  const chapters = new Map(previous.chapters.map(chapter => [chapter.url, chapter]));
  incoming.chapters.forEach(chapter => chapters.set(chapter.url, chapter));
  return { ...previous, ...incoming, chapters: [...chapters.values()].sort((a, b) => a.index - b.index) };
}
export interface SourceSearchResult { url: string; title: string; cover: string }
export function parseSourceSearch(html: string, source: string): SourceSearchResult[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (/just a moment|access denied/i.test(doc.title)) throw new Error('Nguồn yêu cầu xác minh khi tìm truyện.');
  const results = new Map<string, SourceSearchResult>();
  for (const card of doc.querySelectorAll<HTMLAnchorElement>('a.catx-card[href]')) {
    try {
      const url = storyUrl(card.getAttribute('href')!, source);
      if (new URL(url).origin !== 'https://webnovel.vn') continue;
      const title = card.getAttribute('title') || card.querySelector('h3, h2')?.textContent?.trim() || card.textContent?.trim();
      const image = card.querySelector('img')?.getAttribute('src');
      if (title) results.set(url, { url, title, cover: image ? storyUrl(image, source) : '' });
    } catch { /* Invalid links are not sources. */ }
  }
  return [...results.values()];
}
export async function searchSource(query: string, signal?: AbortSignal) {
  const url = `https://webnovel.vn/tim-kiem/?tukhoa=${encodeURIComponent(query.trim().slice(0, 120))}`;
  const document = await fetchSourceDocument(url, signal);
  return parseSourceSearch(document.html, document.url);
}
