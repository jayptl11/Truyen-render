import { errorMessage } from '../errors';
import { StorySourceError } from './extract';
import { storyUrl } from './profiles';
export interface SourceDocument { html: string; url: string }
/** Chapter, catalog and search use the same transport and final redirect URL. */
export async function loadSource<T>(value: string, parse: (document: SourceDocument) => T, signal?: AbortSignal): Promise<T> {
  const url = storyUrl(value);
  const routes = [
    { name: 'Server', url: `/api/story?url=${encodeURIComponent(url)}`, format: 'server', timeout: 23000 },
    { name: 'AllOrigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, format: 'json', timeout: 8000 },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, format: 'text', timeout: 8000 },
  ];
  const errors: string[] = [];
  for (const route of routes) {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(route.timeout);
      const response = await fetch(route.url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      let html: unknown; let source = url;
      if (route.format === 'server') {
        const data = await response.json().catch(() => { throw new Error('API lấy truyện chưa trả về JSON hợp lệ. Kiểm tra deployment Vercel.'); });
        if (!response.ok) throw new StorySourceError(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`, typeof data.code === 'string' ? data.code : 'SOURCE_ERROR');
        html = data.html;
        if (typeof data.sourceUrl === 'string') source = storyUrl(data.sourceUrl);
      } else {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = route.format === 'json' ? (await response.json()).contents : await response.text();
      }
      if (typeof html !== 'string' || !html.trim()) throw new Error('Nguồn trả về nội dung trống.');
      return parse({ html, url: source });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof StorySourceError && ['INVALID_URL', 'PAGE_TOO_LARGE', 'SOURCE_BLOCKED', 'SOURCE_LOGIN_REQUIRED', 'SOURCE_DYNAMIC'].includes(error.code)) throw error;
      const timedOut = typeof error === 'object' && error !== null && 'name' in error && ['TimeoutError', 'AbortError'].includes(String(error.name));
      errors.push(`${route.name}: ${timedOut ? 'hết thời gian chờ' : errorMessage(error).replace(/[.]+$/, '')}`);
    }
  }
  throw new Error(`Không lấy được nội dung truyện: ${errors.join(' / ')}. Bạn có thể dán văn bản trực tiếp.`);
}
