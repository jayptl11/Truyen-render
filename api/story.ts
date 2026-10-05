import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchStoryPage, StoryFetchError } from '../server/story.js';

export default async function storyHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET'); res.writeHead(405); res.end(JSON.stringify({ error: 'Chỉ hỗ trợ GET.', code: 'METHOD_NOT_ALLOWED' })); return;
  }
  const source = new URL(req.url || '/', 'http://localhost').searchParams.get('url');
  if (!source) { res.writeHead(400); res.end(JSON.stringify({ error: 'Thiếu liên kết truyện.', code: 'INVALID_URL' })); return; }
  const controller = new AbortController();
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnected);
  try {
    const page = await fetchStoryPage(source, controller.signal);
    if (controller.signal.aborted) return;
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.writeHead(200); res.end(JSON.stringify(page));
  } catch (error) {
    if (controller.signal.aborted) return;
    const failure = error instanceof StoryFetchError ? error : new StoryFetchError('Không lấy được nội dung truyện.');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(failure.status); res.end(JSON.stringify({ error: failure.message, code: failure.code }));
  } finally { res.off('close', disconnected); }
}
