import type { IncomingMessage, ServerResponse } from 'node:http';
import { edgeAudio, edgeVoices, TtsError } from './tts.js';

async function readBody(req: IncomingMessage): Promise<unknown> {
  const body = (req as IncomingMessage & { body?: unknown }).body;
  if (body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(body)) > 12000) throw new TtsError('Yêu cầu quá lớn.', 413);
    if (typeof body !== 'string') return body;
    try { return JSON.parse(body); } catch { throw new TtsError('Nội dung JSON không hợp lệ.', 400); }
  }
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk); length += buffer.length;
    if (length > 12000) throw new TtsError('Yêu cầu quá lớn.', 413);
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new TtsError('Nội dung JSON không hợp lệ.', 400); }
}
export default async function ttsHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  try {
    if (req.method === 'GET') {
      const voices = await edgeVoices(controller.signal);
      if (controller.signal.aborted) return;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.writeHead(200); res.end(JSON.stringify({ voices }));
    } else if (req.method === 'POST') {
      const audio = await edgeAudio(await readBody(req), controller.signal);
      if (controller.signal.aborted) return;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.writeHead(200); res.end(audio);
    } else {
      res.setHeader('Allow', 'GET, POST'); throw new TtsError('Chỉ hỗ trợ GET hoặc POST.', 405);
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    const failure = error instanceof TtsError ? error : new TtsError('Không tải được giọng Edge. Thử lại hoặc chọn giọng trên thiết bị.');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(failure.status); res.end(JSON.stringify({ error: failure.message }));
  } finally { res.off('close', close); }
}
