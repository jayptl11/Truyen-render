import type { StoryContent } from '../../types/story';
import { chapterNumber, fold, profileFor, sameBookLink, storyUrl } from './profiles';
export class StorySourceError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
export function assertSourcePage(doc: Document) {
  if (doc.querySelector('#challenge-running, #challenge-form, .cf-browser-verification, #cf-chl-widget') || /just a moment|attention required|access denied|checking your browser/i.test(doc.title)) {
    throw new StorySourceError('Website nguồn yêu cầu xác minh hoặc đang chặn tải tự động. Mở trang gốc để kiểm tra.', 'SOURCE_BLOCKED');
  }
}
const contentSelectors = ['#chapter-content', '.chapter-content', '#chapter_content', '.chapter_content', '#chapter-c', '.chapter-c', '.reading-content', '#reading-content', '#vung_doc', '.box-chap', '#content-chapter', '.content-chapter', '#truyen-content', '.truyen-content', '.truyenText', '#noidung', '.read-content', '.reader-content', '.reading-detail', '.chapter-body', '.chapter-text', '#content_chap', '#js-truyencv-content', '#inner_chap_content_1', '.chap-content', '[itemprop="articleBody"]', '.entry-content', '.truyen'];
const noise = 'script, style, iframe, nav, header, footer, aside, button, form, noscript, template, select, .adsbygoogle, .chapter-nav, .chapter-navigation, .chap-nav, .ads, .advertisement, .ads-responsive, .comments, #comments, .comment-list, .related-posts, .related-stories, .share-buttons, .social-share, [hidden], [aria-hidden="true"]';
const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\t ]+\n/g, '\n').replace(/\n[\t ]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
export function readableText(element: Element, title = '', navigation: (string | null)[] = [], source = '') {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(noise).forEach(node => node.remove());
  clone.querySelectorAll('[style]').forEach(node => { if (/(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|em|rem|pt)?\b)/i.test(node.getAttribute('style') || '')) node.remove(); });
  // Remove dense menus/catalogs, including anonymous wrappers on generic sites.
  clone.querySelectorAll('ul, ol, section, div').forEach(node => {
    const text = node.textContent?.trim() || '';
    const anchors = [...node.querySelectorAll('a')];
    const linked = anchors.reduce((sum, anchor) => sum + (anchor.textContent?.trim().length || 0), 0);
    if (anchors.length >= 3 && linked / Math.max(1, text.length) > 0.65) node.remove();
  });
  clone.querySelectorAll('a[href]').forEach(node => {
    try { if (navigation.includes(storyUrl(node.getAttribute('href')!, source))) node.remove(); } catch { /* Preserve ordinary prose. */ }
  });
  clone.querySelectorAll('h1, h2, h3, .current-chapter, .chapter-title').forEach(node => { if (title && fold(node.textContent || '') === fold(title)) node.remove(); });
  clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  clone.querySelectorAll('p, div, section, article, blockquote, li, h1, h2, h3').forEach(node => node.append('\n'));
  return normalize(clone.textContent || '');
}
function chapterLink(doc: Document, direction: 'next' | 'prev', source: string) {
  const selectors = `a[rel~="${direction}"], a#${direction}_chap, a#${direction}-chapter, a#${direction}_chapter, a#${direction}chapter, a#${direction}, a.btn-${direction}, a.chapter-${direction}`;
  const explicit = new Set(doc.querySelectorAll<HTMLAnchorElement>(selectors));
  const words = direction === 'next' ? /^(?:chuong (?:tiep(?: theo)?|sau)|(?:next(?: chapter)?|tiep(?: theo)?))(?:\s|$)|^(?:>>|»|→|›)$/ : /^(?:chuong truoc|(?:previous|prev)(?: chapter)?|quay lai)(?:\s|$)|^(?:<<|«|←|‹)$/;
  const anchors = [...explicit, ...doc.querySelectorAll<HTMLAnchorElement>('a[href]')];
  for (const link of anchors) {
    if (link.matches('[aria-disabled="true"], [disabled], .disabled') || link.closest('.disabled, [hidden]')) continue;
    const label = fold([link.textContent, link.getAttribute('title'), link.getAttribute('aria-label')].filter(Boolean).join(' ')).replace(/^[«»‹›←→<>\s]+(?=\w)/, '');
    if (!explicit.has(link) && (label.length > 100 || !words.test(label))) continue;
    const href = link.getAttribute('href'); if (!href || href.startsWith('#')) continue;
    try { const url = storyUrl(href, source); if (sameBookLink(url, source)) return url; } catch { /* Try the next navigation candidate. */ }
  }
  const current = chapterNumber(source);
  if (current === null) return null;
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('.chapter-list a[href], .list-chapter a[href], #chapterList a[href]')) {
    try {
      const url = storyUrl(link.getAttribute('href')!, source);
      if (sameBookLink(url, source) && chapterNumber(url) === current + (direction === 'next' ? 1 : -1)) return url;
    } catch { /* Invalid catalog link. */ }
  }
  return null;
}
function titleFrom(doc: Document) {
  const explicit = doc.querySelector('.current-chapter, #current-chapter, .current_chapter, .chapter-title, .chapter_title, .chal-title, .entry-title, h2.title');
  if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  const chapterHeading = [...doc.querySelectorAll('h1, h2, h3')].find(node => /^(chuong|chapter)\s*\d/i.test(fold(node.textContent || '')));
  return chapterHeading?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || '';
}
interface Candidate { text: string; score: number; title: string; nextUrl?: string | null; prevUrl?: string | null }
function embeddedChapter(doc: Document, source: string): Candidate | undefined {
  let best: Candidate | undefined; let inspected = 0;
  const walk = (value: unknown, context: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 10 || ++inspected > 2000) return;
    const item = value as Record<string, unknown>;
    const isArticle = ['Article', 'NewsArticle', 'Chapter'].includes(String(item['@type'])) && !/hasPart|chapters|chapterList/i.test(context);
    const content = isArticle ? item.articleBody || item.text : /(?:^|\/)(?:chapter|currentChapter|current_chapter|chuong)(?:\/data)?$/i.test(context) ? item.content || item.body || item.text : item.chapterContent;
    if (typeof content === 'string' && content.trim()) {
      const title = String(item.chapterTitle || item.chapterName || item.title || item.name || titleFrom(doc));
      const parsed = new DOMParser().parseFromString(content, 'text/html');
      const text = readableText(parsed.body, title);
      const navigation = (direction: 'next' | 'prev') => {
        const reference = item[`${direction}Chapter`];
        const value = item[`${direction}Url`] || item[`${direction}ChapterUrl`] || (reference && typeof reference === 'object' ? (reference as Record<string, unknown>).url : undefined);
        try { if (typeof value === 'string') { const url = storyUrl(value, source); if (sameBookLink(url, source)) return url; } } catch { /* Optional navigation. */ }
        return null;
      };
      if (text && (!best || text.length > best.text.length)) best = { text, title, score: 1000 + Math.log1p(text.length) * 100, nextUrl: navigation('next'), prevUrl: navigation('prev') };
    }
    for (const [key, child] of Object.entries(item)) if (child && typeof child === 'object') walk(child, `${context}/${key}`, depth + 1);
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__')) {
    try { walk(JSON.parse(script.textContent || ''), '', 0); } catch { /* Never evaluate arbitrary source scripts. */ }
  }
  return best;
}
export function parseStoryHtml(html: string, source: string): StoryContent {
  const doc = new DOMParser().parseFromString(html, 'text/html'); assertSourcePage(doc);
  const title = titleFrom(doc); const nextUrl = chapterLink(doc, 'next', source); const prevUrl = chapterLink(doc, 'prev', source);
  const selectors = [...new Set([...(profileFor(source)?.content || []), ...contentSelectors])];
  const candidates = new Map<Element, boolean>();
  selectors.forEach(selector => doc.querySelectorAll(selector).forEach(node => candidates.set(node, true)));
  doc.querySelectorAll('article, main, #content, .content, #reading, #reader').forEach(node => { if (!candidates.has(node)) candidates.set(node, false); });
  let best: Candidate | undefined;
  for (const [node, specific] of candidates) {
    if (node.closest('nav, aside, header, footer, [hidden], [aria-hidden="true"]')) continue;
    const original = node.textContent?.trim() || '';
    const linked = [...node.querySelectorAll('a')].reduce((sum, anchor) => sum + (anchor.textContent?.trim().length || 0), 0);
    const density = linked / Math.max(1, original.length);
    const text = readableText(node, title, [nextUrl, prevUrl], source);
    if (text.length < 500 && /dang nhap de (?:doc|xem)|mua chuong|unlock (?:this )?chapter|login to (?:read|continue)/.test(fold(text))) continue;
    const sentences = (text.match(/[.!?。！？…]/g) || []).length;
    const lines = text.split(/\n+/).length;
    if (!text || density > 0.7 || (!specific && (text.length < 180 || (sentences < 2 && lines < 3) || density > 0.35))) continue;
    const score = (specific ? 1200 : 0) + Math.log1p(text.length) * 100 + Math.min(sentences, 40) * 5 - density * 1000;
    if (!best || score > best.score) best = { text, score, title };
  }
  if (!best) best = embeddedChapter(doc, source);
  if (!best) {
    const pageText = fold(doc.body.textContent || '');
    if (/dang nhap de (?:doc|xem)|mua chuong|chuong vip|unlock (?:this )?chapter|login to (?:read|continue)/.test(pageText)) throw new StorySourceError('Chương yêu cầu đăng nhập hoặc mua quyền đọc trên website nguồn. Bộ lấy truyện chưa hỗ trợ phiên đăng nhập.', 'SOURCE_LOGIN_REQUIRED');
    if (doc.querySelector('#__NEXT_DATA__, #__NUXT_DATA__, #__nuxt, #__next, #app, #root') && doc.querySelector('script')) throw new StorySourceError('Trang tải nội dung bằng JavaScript nhưng không có văn bản chương trong HTML. Nguồn này cần bộ tích hợp riêng; bạn có thể dán văn bản để nghe ngay.', 'SOURCE_DYNAMIC');
    throw new StorySourceError('Không tìm thấy nội dung chương trong HTML. Kiểm tra đây là link chương, không phải mục lục; cấu trúc nguồn có thể đã thay đổi.', 'CONTENT_NOT_FOUND');
  }
  return { content: best.title && !best.text.startsWith(best.title) ? `${best.title}\n\n${best.text}` : best.text, nextUrl: nextUrl || best.nextUrl || null, prevUrl: prevUrl || best.prevUrl || null };
}
