import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TtsVoice } from '../src/types/tts';

// Public Read Aloud client identifier, also used by msedge-tts; not a user key.
const VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';
let catalog: { voices: TtsVoice[]; expires: number } | null = null;
export class TtsError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
export function escapeSpeechText(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}
export async function edgeVoices(signal?: AbortSignal): Promise<TtsVoice[]> {
  if (catalog && catalog.expires > Date.now()) return catalog.voices;
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(VOICES_URL, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new TtsError(`Không tải được danh sách giọng Edge (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new TtsError('Danh sách giọng Edge không hợp lệ.');
  const voices = data.flatMap((voice): TtsVoice[] => {
    if (!voice || typeof voice.ShortName !== 'string' || typeof voice.Locale !== 'string') return [];
    return [{ id: voice.ShortName, name: typeof voice.FriendlyName === 'string' ? voice.FriendlyName.replace(/^Microsoft\s+/, '').replace(/ Online \(Natural\)/, '') : voice.ShortName,
      language: voice.Locale, gender: voice.Gender === 'Male' ? 'male' : voice.Gender === 'Female' ? 'female' : 'unknown' }];
  });
  if (!voices.length) throw new TtsError('Edge chưa trả về giọng đọc.');
  catalog = { voices, expires: Date.now() + 3600000 };
  return voices;
}
export function validateSpeechInput(input: unknown): { text: string; voice: string; language: string } {
  if (!input || typeof input !== 'object') throw new TtsError('Yêu cầu TTS không hợp lệ.', 400);
  const { text, voice, language } = input as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim() || text.length > 1500 || typeof voice !== 'string' || voice.length > 100
    || !/^[a-z]{2,3}-(?:[A-Za-z0-9]+-){1,3}[A-Za-z0-9]+Neural$/.test(voice)
    || typeof language !== 'string' || !/^[a-z]{2,3}-[A-Za-z0-9-]{2,20}$/.test(language)
    || !voice.startsWith(language + '-')) {
    throw new TtsError('Nội dung, ngôn ngữ hoặc giọng Edge không hợp lệ (tối đa 1500 ký tự mỗi lượt).', 400);
  }
  return { text, voice, language };
}
export async function edgeAudio(input: unknown, signal?: AbortSignal): Promise<Buffer> {
  const { text, voice, language } = validateSpeechInput(input);
  const tts = new MsEdgeTTS();
  const timeout = AbortSignal.timeout(20000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const abort = () => { tts.close(); reject(new TtsError('Đã hủy hoặc hết thời gian tạo giọng đọc Edge.', 504)); };
      combined.addEventListener('abort', abort, { once: true });
      if (combined.aborted) { abort(); return; }
      void (async () => {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { voiceLocale: language });
        if (combined.aborted) { tts.close(); return; }
        const { audioStream } = tts.toStream(escapeSpeechText(text));
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of audioStream) {
          if (combined.aborted) return;
          const buffer = Buffer.from(chunk);
          length += buffer.length;
          if (length > 2 * 1024 * 1024) throw new TtsError('Âm thanh Edge vượt giới hạn dung lượng.', 413);
          chunks.push(buffer);
        }
        if (!length) throw new TtsError('Edge không trả về âm thanh.');
        resolve(Buffer.concat(chunks));
      })().catch(reject).finally(() => combined.removeEventListener('abort', abort));
    });
  } catch (error) {
    if (error instanceof TtsError) throw error;
    throw new TtsError('Không kết nối được đến giọng đọc Edge. Thử lại hoặc chọn giọng trên thiết bị.');
  } finally { tts.close(); }
}
