import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Keep the WASM runtime versions paired with the pinned npm packages.
const files = [
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm', 'public/tts/onnx/ort-wasm-simd.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm.wasm', 'public/tts/onnx/ort-wasm.wasm'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm', 'public/tts/piper/piper_phonemize.wasm'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data', 'public/tts/piper/piper_phonemize.data'],
  ['node_modules/espeak-ng/LICENSE', 'public/tts/licenses/espeak-ng.txt'],
];
for (const [source, destination] of files) {
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(source, destination);
}
