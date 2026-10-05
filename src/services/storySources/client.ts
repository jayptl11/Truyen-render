import type { StoryContent } from '../../types/story';
import { errorMessage } from '../errors';

export function storyUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Chỉ hỗ trợ liên kết HTTP hoặc HTTPS.');
  return url.href;
}

export function parseStoryHtml(html: string, sourceUrl: string): StoryContent {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selectors = ['.truyen', '#chapter-content', '#vung_doc', '.chapter-c', '.reading-content', '#content', '.box-chap', '.content'];
  const story = selectors.map(s => doc.querySelector(s)).find(Boolean);
  if (!story) throw new Error('Không tìm thấy nội dung chương. Bạn có thể dán văn bản trực tiếp.');
  const title = doc.querySelector('.current-chapter, #current-chapter, .current_chapter, .chapter-title, .chal-title, h1')?.textContent?.trim() || '';
  const chapterLink = (direction: 'next' | 'prev') => {
    const rel = doc.querySelector<HTMLAnchorElement>(`a[rel="${direction}"]`);
    const words = direction === 'next' ? ['chương tiếp', 'chương sau', 'next', '>>', '→'] : ['chương trước', 'prev', '<<', '←'];
    const link = rel || Array.from(doc.querySelectorAll('a')).find(a => {
      const text = (a.textContent || '').trim().toLowerCase();
      return words.some(w => text.includes(w)) || a.className.toLowerCase().includes(`chapter-${direction}`);
    });
    const href = link?.getAttribute('href');
    if (!href || href.startsWith('#')) return null;
    try { return storyUrl(href, sourceUrl); } catch { return null; }
  };
  const nextUrl = chapterLink('next');
  const prevUrl = chapterLink('prev');
  story.querySelectorAll('script, style, iframe, nav, button, .adsbygoogle, .chapter-nav').forEach(el => el.remove());
  story.querySelectorAll('h1, .current-chapter, .chapter-title').forEach(el => {
    if (el.textContent?.trim() === title) el.remove();
  });
  story.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  story.querySelectorAll('p, div').forEach(el => el.append('\n'));
  const text = (story.textContent || '').replace(/\r\n/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('Chương không có nội dung đọc được.');
  return { content: title && !text.startsWith(title) ? `${title}\n\n${text}` : text, nextUrl, prevUrl };
}

export async function fetchRawStoryData(value: string, signal?: AbortSignal): Promise<StoryContent> {
  const url = storyUrl(value);
  const proxies = [
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, json: true },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, json: false },
  ];
  const errors: string[] = [];
  for (const proxy of proxies) {
    if (signal?.aborted) throw new DOMException('Đã hủy tải chương.', 'AbortError');
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch(proxy.url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = proxy.json ? (await response.json()).contents : await response.text();
      if (typeof html !== 'string' || !html.trim()) throw new Error('Nguồn trả về nội dung trống.');
      return parseStoryHtml(html, url);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(errorMessage(error));
    }
  }
  throw new Error(`Không lấy được nội dung truyện: ${errors.join(' / ')}. Bạn có thể dán văn bản trực tiếp.`);
}
