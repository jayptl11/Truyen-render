import type { AudioProvider } from '../../types/tts';
import { ESPEAK_VOICES, PIPER_VOICES } from './catalog';
import espeakWasm from 'espeak-ng/dist/espeak-ng.wasm?url';

const scope = globalThis as unknown as { navigator: Navigator; location: Location; postMessage: (data: unknown) => void; onmessage: ((event: MessageEvent) => void) | null };
// Keep this dedicated worker single-threaded; no cross-origin isolation needed.
Object.defineProperty(scope.navigator, 'hardwareConcurrency', { value: 1 });
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const runtime = /\.(wasm|data)(?:\?|$)/.test(url);
  let cache: Cache | undefined;
  if (runtime && typeof caches !== 'undefined') {
    try { cache = await caches.open('reader-tts-runtime-v1'); const hit = await cache.match(input); if (hit) return hit; } catch { /* Continue without persistent cache. */ }
  }
  const response = await originalFetch(input, init);
  if (!response.ok) throw new Error(`Không tải được tài nguyên giọng đọc (HTTP ${response.status}).`);
  if (cache) { try { await cache.put(input, response.clone()); } catch { /* Storage may be full or disabled. */ } }
  return response;
};
let espeakBinary: ArrayBuffer | undefined;
scope.onmessage = async (event: MessageEvent<{ id: number; provider: AudioProvider; voice: string; text: string }>) => {
  const { id, provider, voice, text } = event.data;
  const progress = (message: string) => scope.postMessage({ id, progress: message });
  try {
    if (!text.trim() || text.length > 1500) throw new Error('Phần truyện cần đọc không hợp lệ.');
    let blob: Blob;
    if (provider === 'espeak') {
      if (!ESPEAK_VOICES.some(item => item.id === voice)) throw new Error('Giọng eSpeak không hợp lệ.');
      progress('Đang chuẩn bị eSpeak NG…');
      const { default: createEspeak } = await import('espeak-ng');
      if (!espeakBinary) espeakBinary = await (await fetch(espeakWasm)).arrayBuffer();
      const module = await createEspeak({ wasmBinary: espeakBinary,
        arguments: ['-v', voice, '-w', '/speech.wav', '-f', '/story.txt'],
        preRun: [(instance: EspeakModule) => instance.FS.writeFile('/story.txt', text)],
        print: () => {}, printErr: () => {},
      });
      const bytes = module.FS.readFile('/speech.wav');
      blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
    } else if (provider === 'piper') {
      if (!PIPER_VOICES.some(item => item.id === voice)) throw new Error('Giọng Piper không hợp lệ.');
      progress('Đang chuẩn bị giọng Piper…');
      const { TtsSession } = await import('@mintplex-labs/piper-tts-web');
      const session = await TtsSession.create({ voiceId: voice,
        wasmPaths: {
          onnxWasm: new URL('/tts/onnx/', scope.location.origin).href,
          piperData: new URL('/tts/piper/piper_phonemize.data', scope.location.origin).href,
          piperWasm: new URL('/tts/piper/piper_phonemize.wasm', scope.location.origin).href,
        },
        progress: ({ loaded, total }) => progress(total > 0 ? `Đang tải giọng Piper… ${Math.min(100, Math.round(loaded / total * 100))}%` : `Đang tải giọng Piper… ${(loaded / 1048576).toFixed(1)} MB`),
      });
      progress('Đang tạo âm thanh trên thiết bị…');
      blob = await session.predict(text);
    } else throw new Error('Nguồn giọng đọc không hợp lệ.');
    scope.postMessage({ id, blob });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : 'Không tạo được âm thanh trên thiết bị.' });
  }
};
