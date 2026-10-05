import type { Book, Chapter, ChapterReference } from '../../types/story';
import { storyUrl } from './client';
import { chapterNumber, inferredBookUrl, profileFor, SOURCE_PROFILES, withinBook } from './profiles';
import { assertSourcePage } from './extract';
import { loadSource } from './transport';
export const SOURCES = SOURCE_PROFILES.map(profile => ({ id: profile.id, name: profile.name, origin: `https://${profile.hosts[0]}`, description: 'Nhận diện nội dung chương và danh sách chương có trong HTML. Mức truy cập tùy website.' }));
export function bookIdentity(value: string) {
  try { const url = new URL(value); url.pathname = url.pathname.replace(/\/$/, '') || '/'; url.hash = ''; url.searchParams.sort(); return url.href; } catch { return value; }
}
export function bookId(chapter: Chapter): string {
  try {
    return inferredBookUrl(chapter.url) || chapter.url;
  } catch { /* Manual entries each keep their own identity. */ }
  return chapter.url;
}
export function localBooks(chapters: Chapter[], saved: Book[]): Book[] {
  const books = new Map(saved.map(book => [book.id, { ...book, chapters: [...book.chapters] }]));
  const associated = new Map(saved.flatMap(book => book.chapters.map(chapter => [chapter.url, book.id] as const)));
  for (const chapter of chapters) {
    const id = associated.get(chapter.url) || bookId(chapter);
    let book = books.get(id);
    if (!book) {
      const title = id === chapter.url ? chapter.title : decodeURIComponent(new URL(id).pathname.split('/').filter(Boolean).at(-1) || '').replace(/-/g, ' ');
      book = { id, title, source: chapter.webName, author: '', cover: '', description: '', chapters: [], catalogNext: null, updated: chapter.timestamp };
      books.set(id, book);
    }
    if (!book.chapters.some(reference => reference.url === chapter.url)) {
      const index = chapter.url.startsWith('manual:') ? book.chapters.length + 1 : chapterNumber(chapter.url) || book.chapters.length + 1;
      book.chapters.push({ url: chapter.url, title: chapter.title, index });
    }
    book.updated = Math.max(book.updated, chapter.timestamp);
  }
  return [...books.values()].map(book => ({ ...book, chapters: book.chapters.sort((a, b) => a.index - b.index) })).sort((a, b) => b.updated - a.updated);
}
export async function fetchSourceDocument(value: string, signal?: AbortSignal) {
  return loadSource(value, document => document, signal);
}
export function parseBook(html: string, source: string): Book {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  assertSourcePage(doc);
  const origin = new URL(source);
  const isWebnovel = origin.hostname === 'webnovel.vn';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  let identity = source;
  try { if (canonical && new URL(storyUrl(canonical, source)).origin === origin.origin) identity = storyUrl(canonical, source); } catch { /* Ignore invalid metadata. */ }
  const base = new URL(identity); base.hash = '';
  for (const key of ['page', 'p', 'trang']) base.searchParams.delete(key);
  const catalogUrl = isWebnovel ? `${origin.origin}/${origin.pathname.split('/')[1]}/` : inferredBookUrl(identity) || base.href;
  if (!base.search && !base.pathname.endsWith('/') && !/\.[a-z\d]+$/i.test(base.pathname)) base.pathname += '/';
  const id = isWebnovel ? `${origin.origin}/${origin.pathname.split('/')[1]}/` : inferredBookUrl(identity) || base.href;
  const chapters: ChapterReference[] = [];
  const seen = new Set<string>();
  const selectors = [...(profileFor(source)?.catalog || []), '#chapterList a[href]', '.chapter-list a[href]', '.list-chapter a[href]', '.list-chapters a[href]', '#list-chapter a[href]', '#chapters a[href]', '.chapter-list select option[value]', 'select#chapter option[value]'];
  const links = new Set(doc.querySelectorAll<HTMLAnchorElement>(selectors.join(',')));
  // Other layouts can advertise chapters directly, outside named list wrappers.
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
    try { const url = storyUrl(link.getAttribute('href')!, source); if (chapterNumber(url) !== null && withinBook(url, id)) links.add(link); } catch { /* Ignore non-URL actions. */ }
  });
  for (const link of links) {
    try {
      const raw = link.getAttribute('href') || link.getAttribute('value'); if (!raw || raw.startsWith('#') || /^\d+$/.test(raw)) continue;
      const url = storyUrl(raw, source);
      if (seen.has(url) || url === id || !withinBook(url, id)) continue;
      if (chapterNumber(url) === null && chapterNumber(link.textContent || '') === null) continue;
      seen.add(url);
      const index = Number(link.querySelector('.chapter-item__index')?.textContent?.trim()) || chapterNumber(url) || chapterNumber(link.textContent || '') || chapters.length + 1;
      const text = link.querySelector('.chapter-item__title')?.textContent?.trim() || link.textContent?.replace(/\s+/g, ' ').trim() || `Chương ${index}`;
      chapters.push({ url, title: /^(chương|chapter)\s/i.test(text) ? text : `Chương ${index}: ${text}`, index });
    } catch { /* Non HTTP links are ignored. */ }
  }
  if (!chapters.length) throw new Error('Không tìm thấy mục lục. Dán liên kết trang truyện (không phải một chương), hoặc thêm chương trong Thêm truyện.');
  const title = doc.querySelector('#book-detail-title, .book-title, h3.title, [itemprop="name"], h1')?.textContent?.trim() || doc.title.split('|')[0].trim();
  let author = '';
  for (const element of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(element.textContent || '{}');
      const items = Array.isArray(data) ? data : data['@graph'] || [data];
      const book = items.find((item: { '@type'?: string }) => item['@type'] === 'Book');
      if (book?.author?.name) author = String(book.author.name);
    } catch { /* Metadata is optional. */ }
  }
  if (!author) author = doc.querySelector('[itemprop="author"], .book-author, .author a, a[href*="/tac-gia/"]')?.textContent?.trim() || '';
  const coverValue = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || doc.querySelector('.book-detail__cover img, .book img, .book-img img, .novel-cover img')?.getAttribute('src');
  let cover = ''; try { if (coverValue) cover = storyUrl(coverValue, source); } catch { /* Optional image. */ }
  const active = Number(doc.querySelector('.pagination__link[aria-current="page"], .pagination [aria-current="page"], .pagination .active, .pagination .current')?.textContent) || Number(origin.searchParams.get('page')) || 1;
  const next = doc.querySelector<HTMLAnchorElement>(`.pagination a[data-page="${active + 1}"], .pagination li.next a, .pagination a.next, a.next.page-numbers, a[rel="next"]`);
  let catalogNext = null;
  try { if (next?.getAttribute('href')) { const candidate = storyUrl(next.getAttribute('href')!, source); if (candidate !== source && withinBook(candidate, id) && chapterNumber(candidate) === null) catalogNext = candidate; } } catch { /* End of catalog. */ }
  return { id, catalogUrl, title, source: origin.hostname, author, cover, description: doc.querySelector('.book-detail__summary, .book-description, .desc-text, .book-intro, [itemprop="description"]')?.textContent?.trim() || doc.querySelector('meta[name="description"]')?.getAttribute('content') || '', chapters, catalogNext, updated: Date.now() };
}
export async function fetchBook(url: string, signal?: AbortSignal) { return loadSource(url, document => parseBook(document.html, document.url), signal); }
export function mergeCatalog(previous: Book, incoming: Book): Book {
  const chapters = new Map(previous.chapters.map(chapter => [chapter.url, chapter]));
  incoming.chapters.forEach(chapter => chapters.set(chapter.url, chapter));
  return { ...previous, ...incoming, id: previous.id, chapters: [...chapters.values()].sort((a, b) => a.index - b.index) };
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
