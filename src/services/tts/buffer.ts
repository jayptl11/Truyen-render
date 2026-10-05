import type { AudioProvider, TtsVoice } from '../../types/tts';
import { retryableSpeechError } from './errors';

export interface SpeechSegment { provider: AudioProvider; voice: TtsVoice; text: string }
type Progress = (message: string) => void;
type Synthesizer = (provider: AudioProvider, text: string, voice: TtsVoice, signal: AbortSignal, progress: Progress) => Promise<Blob>;
interface Job {
  key: string; segment: SpeechSegment; background: boolean; controller: AbortController;
  promise: Promise<Blob>; resolve: (blob: Blob) => void; reject: (error: unknown) => void;
  progress?: Progress; message: string;
}
export function speechSegmentKey(segment: SpeechSegment): string {
  return JSON.stringify([segment.provider, segment.voice.id, segment.voice.language, segment.text]);
}

// One synthesis at a time also protects the shared Piper/eSpeak worker from
// overlapping inference. Keep only a small, memory-bounded cache per chapter.
export class SpeechAudioBuffer {
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  peek(segment: SpeechSegment): Blob | undefined { return this.ready.get(speechSegmentKey(segment)); }
  private synthesize: Synthesizer;
  private ready = new Map<string, Blob>();
  private bytes = 0;
  private pending = new Map<string, Job>();
  private queue: Job[] = [];
  private active: Job | null = null;
  private retryDelays: readonly number[];
  private limits: { entries: number; bytes: number };
  constructor(synthesize: Synthesizer, retryDelays: readonly number[] = [1000, 2000], limits = { entries: 8, bytes: 12 * 1024 * 1024 }) {
    this.synthesize = synthesize; this.retryDelays = retryDelays;
    this.limits = limits;
  }

  get(segment: SpeechSegment, progress: Progress): Promise<Blob> {
    const key = speechSegmentKey(segment);
    const cached = this.ready.get(key);
    if (cached) {
      this.ready.delete(key); this.ready.set(key, cached);
      return Promise.resolve(cached);
    }
    // A seek to unrelated text should not wait behind an old background task.
    if (this.active && this.active.key !== key) this.cancelPending();
    const job = this.request(segment, false);
    job.background = false; job.progress = progress;
    if (job.message) progress(job.message);
    this.queue = [job, ...this.queue.filter(item => item !== job)];
    if (this.active === job) this.queue = this.queue.filter(item => item !== job);
    this.pump();
    return job.promise;
  }

  prefetch(segments: SpeechSegment[]): void {
    const wanted = new Set(segments.map(speechSegmentKey));
    this.queue = this.queue.filter(job => {
      if (!job.background || wanted.has(job.key)) return true;
      this.pending.delete(job.key); job.reject(new DOMException('Cancelled', 'AbortError'));
      return false;
    });
    for (const segment of segments) {
      if (this.ready.has(speechSegmentKey(segment))) continue;
      const job = this.request(segment, true);
      // A speculative failure is retried when that part is actually needed.
      void job.promise.catch(() => {});
    }
    this.pump();
  }

  cancelPending(): void {
    const jobs = [...this.pending.values()];
    this.pending.clear(); this.queue = []; this.active = null;
    for (const job of jobs) {
      job.controller.abort(); job.reject(new DOMException('Cancelled', 'AbortError'));
    }
  }
  clear(): void { this.cancelPending(); this.ready.clear(); this.bytes = 0; }

  private request(segment: SpeechSegment, background: boolean): Job {
    const key = speechSegmentKey(segment);
    const existing = this.pending.get(key);
    if (existing) return existing;
    let resolve!: (blob: Blob) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((done, fail) => { resolve = done; reject = fail; });
    const job: Job = { key, segment, background, controller: new AbortController(), promise, resolve, reject, message: '' };
    this.pending.set(key, job); this.queue.push(job);
    return job;
  }
  private pump(): void {
    if (this.active) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    void this.run(job);
  }
  private async run(job: Job): Promise<void> {
    const { provider, voice, text } = job.segment;
    try {
      const report = (message: string) => {
        if (this.active !== job || job.controller.signal.aborted) return;
        job.message = message; job.progress?.(message);
      };
      let blob: Blob;
      for (let attempt = 0; ; attempt++) {
        job.controller.signal.throwIfAborted();
        // Each retry gets a new deadline. Promotion from prefetch continues the
        // same request; a timeout cannot consume the next attempt's budget.
        const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(provider === 'piper' ? 180000 : provider === 'espeak' ? 60000 : 26000)]);
        try {
          blob = await this.synthesize(provider, text, voice, signal, report);
          signal.throwIfAborted();
          break;
        } catch (error) {
          if (job.controller.signal.aborted || provider !== 'edge' || attempt >= this.retryDelays.length || !retryableSpeechError(error)) throw error;
          report(`Đang kết nối lại Edge… (lần thử ${attempt + 2}/${this.retryDelays.length + 1})`);
          await retryDelay(this.retryDelays[attempt], job.controller.signal);
        }
      }
      if (this.active !== job) return;
      if (!blob.size || !/^audio\//.test(blob.type)) throw new Error('Nguồn giọng đọc không trả về âm thanh hợp lệ.');
      this.ready.set(job.key, blob); this.bytes += blob.size;
      while (this.ready.size > this.limits.entries || this.bytes > this.limits.bytes) {
        const oldest = this.ready.keys().next().value!;
        this.bytes -= this.ready.get(oldest)!.size; this.ready.delete(oldest);
      }
      job.resolve(blob);
      this.listeners.forEach(listener => listener());
    } catch (error) { job.reject(error); }
    finally {
      if (this.active === job) {
        this.pending.delete(job.key); this.active = null; this.pump();
      }
    }
  }
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}
