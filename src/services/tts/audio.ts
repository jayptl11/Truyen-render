import type { AudioProvider, TtsVoice } from '../../types/tts';
import { SpeechRequestError } from './errors';
import { audioCacheId, cachedAudio, storeAudio } from '../storage/audioCache';

let worker: Worker | null = null;
let sequence = 0;
let localQueue: Promise<unknown> = Promise.resolve();
export function releaseLocalTts() { worker?.terminate(); worker = null; }
async function localAudio(provider: AudioProvider, text: string, voice: TtsVoice, signal: AbortSignal, progress: (message: string) => void): Promise<Blob> {
  signal.throwIfAborted();
  if (!worker) worker = new Worker(new URL('./local.worker.ts', import.meta.url), { type: 'module' });
  const active = worker;
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal.removeEventListener('abort', abort); active.removeEventListener('message', message); active.removeEventListener('error', failure); };
    const abort = () => { cleanup(); releaseLocalTts(); reject(signal.reason); };
    const failure = () => { cleanup(); releaseLocalTts(); reject(new Error('Không khởi động được giọng đọc trên thiết bị. Thử eSpeak hoặc Edge.')); };
    const message = (event: MessageEvent) => {
      if (event.data.id !== id) return;
      if (typeof event.data.progress === 'string') { progress(event.data.progress); return; }
      cleanup();
      if (event.data.blob instanceof Blob) resolve(event.data.blob);
      else { releaseLocalTts(); reject(new Error(event.data.error || 'Không tạo được âm thanh.')); }
    };
    active.addEventListener('message', message); active.addEventListener('error', failure); signal.addEventListener('abort', abort, { once: true });
    active.postMessage({ id, provider, text, voice: voice.id });
  });
}
async function generateAudio(provider: AudioProvider, text: string, voice: TtsVoice, signal: AbortSignal, progress: (message: string) => void): Promise<Blob> {
  if (provider !== 'edge' && provider !== 'vieneu') {
    const task = localQueue.catch(() => {}).then(() => { signal.throwIfAborted(); return localAudio(provider, text, voice, signal, progress); });
    localQueue = task; return task;
  }
  const source = provider === 'vieneu' ? 'VieNeu' : 'Edge';
  progress(`Đang chuẩn bị giọng ${source}…`);
  const response = await fetch(provider === 'vieneu' ? '/api/vieneu' : '/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice: voice.id, language: voice.language, text }), signal });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new SpeechRequestError(failure?.error || `Không tạo được giọng ${source} (HTTP ${response.status}).`, response.status);
  }
  return response.blob();
}
export async function synthesizeAudio(provider: AudioProvider, text: string, voice: TtsVoice, signal: AbortSignal, progress: (message: string) => void): Promise<Blob> {
  signal.throwIfAborted();
  const id = typeof indexedDB !== 'undefined' && crypto.subtle ? await audioCacheId(JSON.stringify([provider, voice.id, voice.language, text])) : undefined;
  const saved = id ? await cachedAudio(id) : undefined;
  signal.throwIfAborted();
  if (saved) return saved;
  const blob = await generateAudio(provider, text, voice, signal, progress);
  signal.throwIfAborted();
  if (id && blob.size && /^audio\//.test(blob.type)) void storeAudio(id, blob).catch(() => {});
  return blob;
}
