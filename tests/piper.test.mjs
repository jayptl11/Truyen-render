import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const code = buildSync({ entryPoints: ['src/services/tts/piper-phonemes.ts'], bundle: true, format: 'esm', write: false }).outputFiles[0].text;
const { piperPhonemeIds } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const config = id => JSON.parse(readFileSync(`tests/fixtures/piper/${id}.json`, 'utf8'));

test('real Vietnamese phonemes use the selected model alphabet, preventing Gather out-of-bounds without stripping tones from VAIS', async () => {
  const require = createRequire(import.meta.url);
  const create = require('../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js');
  const data = readFileSync('node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data');
  let output;
  const module = await create({
    wasmBinary: readFileSync('node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm'),
    getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    print: line => { output = JSON.parse(line); }, printErr: () => {},
  });
  for (const text of ['Chương 12. Trời nắng, người lữ khách đi qua đường nhỏ.', 'Hôm nay là ngày 9 tháng 10. Xin chào các bạn!']) {
    module.callMain(['-l', 'vi', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
    assert.ok(output.phoneme_ids.some(id => id >= 130), 'reproduce newer phonemizer tone IDs');
    for (const id of ['vi_VN-25hours_single-low', 'vi_VN-vivos-x_low']) {
      const ids = piperPhonemeIds(output.phonemes, config(id));
      assert.ok(ids.length > 10);
      assert.ok(ids.every(value => value >= 0 && value < 130), `${id}: only valid embedding indices`);
      assert.equal(ids[0], 1); assert.equal(ids.at(-1), 2);
    }
    assert.ok(piperPhonemeIds(output.phonemes, config('vi_VN-vais1000-medium')).some(id => id >= 130));
  }
});

test('invalid model mappings fail clearly before inference instead of clamping IDs', () => {
  const voice = config('vi_VN-25hours_single-low');
  assert.throws(() => piperPhonemeIds(['a'], { ...voice, phoneme_id_map: { ...voice.phoneme_id_map, a: [132] } }), /không khớp model/);
  assert.throws(() => piperPhonemeIds(['not-a-phoneme'], voice), /không nhận diện/);
});
