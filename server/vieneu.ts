import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TtsVoice } from '../src/types/tts';

const MODEL = 'vieneu-v3-turbo';
const MAX_AUDIO = 4 * 1024 * 1024;
class VieNeuError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

function serviceUrl(path: string): string {
  const base = process.env.VIENEU_BASE_URL || (!process.env.VERCEL && process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:8000' : '');
  if (!base) throw new VieNeuError('Máy chủ giọng VieNeu chưa được cấu hình.', 503);
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return `${url.href.replace(/\/$/, '')}${path}`;
  } catch { throw new VieNeuError('Cấu hình kết nối máy chủ VieNeu không hợp lệ.', 503); }
}

async function upstream(path: string, signal: AbortSignal, body?: unknown): Promise<Response> {
  const url = serviceUrl(path);
  const headers: Record<string, string> = {};
  if (process.env.VIENEU_API_KEY) headers.Authorization = `Bearer ${process.env.VIENEU_API_KEY}`;
  if (body) headers['Content-Type'] = 'application/json';
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(body ? 24000 : 12000)]);
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: requestSignal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw new VieNeuError('Không xác thực được máy chủ VieNeu. Kiểm tra cấu hình kết nối.', response.status);
      if (response.status === 429) throw new VieNeuError('Máy chủ VieNeu đang bận. Thử lại sau.', 429);
      if ([400, 422].includes(response.status)) throw new VieNeuError('Nội dung hoặc giọng VieNeu không hợp lệ. Tải lại danh sách giọng.', 400);
      throw new VieNeuError('Máy chủ VieNeu chưa sẵn sàng. Thử lại hoặc chọn nguồn khác.', 502);
    }
    return response;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof VieNeuError) throw error;
    if (requestSignal.aborted) throw new VieNeuError('Máy chủ VieNeu phản hồi quá lâu. Thử lại sau.', 504);
    throw new VieNeuError('Không kết nối được máy chủ VieNeu. Kiểm tra dịch vụ rồi thử lại.', 503);
  }
}

export async function vieneuVoices(signal: AbortSignal): Promise<TtsVoice[]> {
  const response = await upstream('/v1/voices', signal);
  const data = await response.json() as { data?: { id?: unknown; name?: unknown; gender?: unknown; language?: unknown }[] };
  if (!Array.isArray(data.data)) throw new VieNeuError('Danh sách giọng VieNeu không hợp lệ.');
  const voices = data.data.filter(voice => typeof voice?.id === 'string' && voice.id.length > 0 && voice.id.length <= 128).map((voice): TtsVoice => ({
    id: voice.id as string, name: typeof voice.name === 'string' ? voice.name : voice.id as string,
    language: typeof voice.language === 'string' ? voice.language : 'vi-VN',
    gender: voice.gender === 'male' || voice.gender === 'female' ? voice.gender : 'unknown',
  }));
  if (!voices.length) throw new VieNeuError('VieNeu chưa có giọng đọc khả dụng.');
  return voices;
}

export async function vieneuAudio(input: unknown, signal: AbortSignal): Promise<Buffer> {
  const value = input as { text?: unknown; voice?: unknown; language?: unknown } | null;
  if (!value || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 240
      || typeof value.voice !== 'string' || !value.voice.trim() || value.voice.length > 128 || value.language !== 'vi-VN') {
    throw new VieNeuError('Nội dung hoặc giọng VieNeu không hợp lệ (tối đa 240 ký tự mỗi phần).', 400);
  }
  const response = await upstream('/v1/audio/speech', signal, { model: MODEL, input: value.text, voice: value.voice, response_format: 'wav' });
  if (!/^audio\/wav(?:;|$)|^audio\/x-wav(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel(); throw new VieNeuError('VieNeu không trả về âm thanh WAV hợp lệ.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new VieNeuError('VieNeu trả về âm thanh trống.');
  const chunks: Buffer[] = []; let bytes = 0;
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    bytes += chunk.length;
    if (bytes > MAX_AUDIO) { await reader.cancel(); throw new VieNeuError('Âm thanh VieNeu vượt giới hạn dung lượng.', 413); }
    chunks.push(Buffer.from(chunk));
  }
  const audio = Buffer.concat(chunks);
  if (audio.length <= 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new VieNeuError('VieNeu trả về WAV trống hoặc không hợp lệ.');
  return audio;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined) {
    const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    if (Buffer.byteLength(text) > 12000) throw new VieNeuError('Yêu cầu quá lớn.', 413);
    try { return JSON.parse(text); } catch { throw new VieNeuError('Nội dung JSON không hợp lệ.', 400); }
  }
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    length += Buffer.byteLength(chunk);
    if (length > 12000) throw new VieNeuError('Yêu cầu quá lớn.', 413);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new VieNeuError('Nội dung JSON không hợp lệ.', 400); }
}

export default async function vieneuHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  try {
    if (req.method === 'GET') {
      const voices = await vieneuVoices(controller.signal);
      if (controller.signal.aborted) return;
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(200); res.end(JSON.stringify({ model: MODEL, voices }));
    } else if (req.method === 'POST') {
      const audio = await vieneuAudio(await readBody(req), controller.signal);
      if (controller.signal.aborted) return;
      res.setHeader('Content-Type', 'audio/wav'); res.writeHead(200); res.end(audio);
    } else { res.setHeader('Allow', 'GET, POST'); throw new VieNeuError('Chỉ hỗ trợ GET hoặc POST.', 405); }
  } catch (error) {
    if (controller.signal.aborted) return;
    const failure = error instanceof VieNeuError ? error : new VieNeuError('Không tải được giọng VieNeu. Thử lại hoặc chọn nguồn khác.');
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(failure.status); res.end(JSON.stringify({ error: failure.message }));
  } finally { res.off('close', close); }
}
