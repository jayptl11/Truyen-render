import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { TtsVoice } from '../src/types/tts';

export class TtsError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
let catalog: { voices: TtsVoice[]; expires: number } | null = null;
interface Result { voices?: TtsVoice[]; audio?: string; error?: string; status?: number }

function pythonRequest(request: unknown, signal?: AbortSignal): Promise<Result> {
  const python = process.env.PYTHON_BIN || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'server.tts_cli'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let length = 0; let settled = false;
    const finish = (error?: Error, result?: Result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { child.kill(); reject(error); } else resolve(result!);
    };
    const abort = () => finish(new TtsError('Đã hủy yêu cầu giọng Edge.', 499));
    const timer = setTimeout(() => finish(new TtsError('Edge phản hồi quá lâu. Thử lại hoặc chọn nguồn giọng khác.', 504)), 24000);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish(new TtsError('Không chạy được Python. Tạo .venv và cài requirements.txt để dùng Edge.', 503)));
    child.stdin.on('error', () => finish(new TtsError('Không kết nối được tiến trình Python.', 503)));
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > 3 * 1024 * 1024) finish(new TtsError('Âm thanh Edge vượt giới hạn dung lượng.', 413));
      else chunks.push(chunk);
    });
    child.on('close', () => {
      if (settled) return;
      try {
        const result: Result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result.error) finish(new TtsError(result.error, result.status || 502));
        else finish(undefined, result);
      } catch { finish(new TtsError('Python không trả về dữ liệu Edge hợp lệ. Kiểm tra requirements.txt.')); }
    });
    if (signal?.aborted) { abort(); return; }
    child.stdin.end(JSON.stringify(request));
  });
}
export async function edgeVoices(signal?: AbortSignal): Promise<TtsVoice[]> {
  if (catalog && catalog.expires > Date.now()) return catalog.voices;
  const result = await pythonRequest({ action: 'voices' }, signal);
  if (!result.voices?.length) throw new TtsError('Edge chưa trả về giọng đọc.');
  catalog = { voices: result.voices, expires: Date.now() + 3600000 };
  return result.voices;
}
export async function edgeAudio(input: unknown, signal?: AbortSignal): Promise<Buffer> {
  const result = await pythonRequest({ action: 'audio', input }, signal);
  if (!result.audio) throw new TtsError('Edge không trả về âm thanh.');
  return Buffer.from(result.audio, 'base64');
}
