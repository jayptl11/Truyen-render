import * as ort from 'onnxruntime-web/wasm';
import { HF_BASE, PATH_MAP } from '@mintplex-labs/piper-tts-web';
// This is the phonemizer already shipped by our pinned piper-tts-web 1.0.5.
import { createPiperPhonemize } from '../../../node_modules/@mintplex-labs/piper-tts-web/dist/piper-o91UDS6e.js';
import { piperPhonemeIds } from './piper-phonemes';
import type { PiperConfig } from './piper-phonemes';

type Progress = (message: string) => void;
let model: { id: string; config: PiperConfig; session: ort.InferenceSession } | undefined;
let phonemizer: Awaited<ReturnType<typeof createPiperPhonemize>> | undefined;
let phonemeOutput = '';

async function modelBlob(url: string, progress: Progress): Promise<Blob> {
  const filename = new URL(url).pathname.split('/').at(-1)!;
  let directory: FileSystemDirectoryHandle | undefined;
  try {
    const root = await navigator.storage.getDirectory();
    directory = await root.getDirectoryHandle('piper', { create: true });
    return await (await directory.getFileHandle(filename)).getFile();
  } catch { /* First download, or OPFS unavailable. */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được model Piper (HTTP ${response.status}).`);
  const total = Number(response.headers.get('Content-Length'));
  const reader = response.body?.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = []; let loaded = 0;
  if (!reader) throw new Error('Model Piper trả về nội dung trống.');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new Uint8Array(value)); loaded += value.length;
    progress(total > 0 ? `Đang tải giọng Piper… ${Math.min(100, Math.round(loaded / total * 100))}%` : `Đang tải giọng Piper… ${(loaded / 1048576).toFixed(1)} MB`);
  }
  const blob = new Blob(chunks);
  try {
    if (directory) {
      const writable = await (await directory.getFileHandle(filename, { create: true })).createWritable();
      await writable.write(blob); await writable.close();
    }
  } catch { /* Synthesis can continue without a persistent model cache. */ }
  return blob;
}

async function loadModel(id: string, progress: Progress) {
  if (model?.id === id) return model;
  const path = PATH_MAP[id];
  if (!path) throw new Error('Model Piper không hợp lệ.');
  const config = JSON.parse(await (await modelBlob(`${HF_BASE}/${path}.json`, progress)).text()) as PiperConfig;
  if (!config.phoneme_id_map || !Number.isInteger(config.num_symbols) || config.num_symbols < 1 || !config.audio?.sample_rate) {
    throw new Error('Cấu hình model Piper không hợp lệ.');
  }
  const blob = await modelBlob(`${HF_BASE}/${path}`, progress);
  if (model) { await model.session.release(); model = undefined; }
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = new URL('/tts/onnx/', location.origin).href;
  const session = await ort.InferenceSession.create(await blob.arrayBuffer(), { executionProviders: ['wasm'] });
  model = { id, config, session }; return model;
}

async function phonemize(text: string, language: string): Promise<string[]> {
  if (!phonemizer) {
    const [wasm, data] = await Promise.all([
      fetch('/tts/piper/piper_phonemize.wasm').then(response => response.arrayBuffer()),
      fetch('/tts/piper/piper_phonemize.data').then(response => response.arrayBuffer()),
    ]);
    phonemizer = await createPiperPhonemize({
      wasmBinary: wasm, getPreloadedPackage: () => data,
      print: line => { phonemeOutput = line; }, printErr: () => {},
      locateFile: file => new URL(`/tts/piper/${file}`, location.origin).href,
    });
  }
  phonemeOutput = '';
  const result = phonemizer.callMain(['-l', language, '--input', JSON.stringify([{ text: text.trim() }]), '--espeak_data', '/espeak-ng-data']);
  if (result !== 0 || !phonemeOutput) throw new Error('Không chuyển được văn bản thành âm vị Piper.');
  const output = JSON.parse(phonemeOutput) as { phonemes?: unknown };
  if (!Array.isArray(output.phonemes) || !output.phonemes.every(value => typeof value === 'string')) throw new Error('Âm vị Piper không hợp lệ.');
  return output.phonemes;
}

export function piperWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + pcm.length * 2); const view = new DataView(bytes);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  view.setUint32(4, bytes.byteLength - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true));
  return new Blob([bytes], { type: 'audio/wav' });
}

export async function synthesizePiper(text: string, modelId: string, speakerId: number, progress: Progress): Promise<Blob> {
  progress('Đang chuẩn bị giọng Piper…');
  const { config, session } = await loadModel(modelId, progress);
  if (!Number.isInteger(speakerId) || speakerId < 0 || speakerId >= config.num_speakers) throw new Error('Speaker Piper không hợp lệ.');
  const ids = piperPhonemeIds(await phonemize(text, config.espeak.voice), config);
  progress('Đang tạo âm thanh trên thiết bị…');
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
    scales: new ort.Tensor('float32', Float32Array.of(config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w), [3]),
  };
  if (session.inputNames.includes('sid')) feeds.sid = new ort.Tensor('int64', BigInt64Array.of(BigInt(speakerId)), [1]);
  const { output } = await session.run(feeds);
  if (!(output.data instanceof Float32Array) || !output.data.length) throw new Error('Piper không tạo được âm thanh.');
  return piperWav(output.data, config.audio.sample_rate);
}
