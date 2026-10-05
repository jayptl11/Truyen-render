import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
const code = buildSync({ entryPoints: ['src/services/tts/buffer.ts'], bundle: true, format: 'esm', write: false }).outputFiles[0].text;
const { SpeechAudioBuffer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const voice = { id: 'vi-VN-NamMinhNeural', language: 'vi-VN', gender: 'male', name: 'Nam Minh' };
const segment = text => ({ provider: 'edge', voice, text });
const audio = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
const flush = () => new Promise(resolve => setImmediate(resolve));
function controlled() {
  const calls = [];
  const buffer = new SpeechAudioBuffer((provider, text, selected, signal, progress) => new Promise((resolve, reject) => {
    calls.push({ provider, text, voice: selected, signal, progress, resolve, reject });
  }));
  return { calls, buffer };
}

test('prepares successors while playing, serializes synthesis and reuses cached next and previous parts', async () => {
  const { buffer, calls } = controlled();
  const current = buffer.get(segment('one'), () => {});
  calls[0].resolve(audio()); await current;
  buffer.prefetch([segment('two'), segment('three')]);
  assert.equal(calls.length, 2); assert.equal(calls[1].text, 'two');
  calls[1].resolve(audio()); await flush();
  assert.equal(calls.length, 3); assert.equal(calls[2].text, 'three');
  const next = await buffer.get(segment('two'), () => {});
  assert.equal(next.type, 'audio/mpeg'); assert.equal(calls.length, 3);
  calls[2].resolve(audio()); await flush();
  await buffer.get(segment('one'), () => {}); await buffer.get(segment('three'), () => {});
  assert.equal(calls.length, 3); buffer.clear();
});

test('selecting an in-flight prefetched part shares its request and attaches visible progress', async () => {
  const { buffer, calls } = controlled(); const messages = [];
  buffer.prefetch([segment('two')]); calls[0].progress('loading');
  const next = buffer.get(segment('two'), message => messages.push(message));
  assert.equal(calls.length, 1); assert.deepEqual(messages, ['loading']);
  calls[0].progress('ready soon'); calls[0].resolve(audio()); await next;
  assert.deepEqual(messages, ['loading', 'ready soon']); buffer.clear();
});

test('seek preempts unrelated background synthesis and ignores its late reply', async () => {
  const { buffer, calls } = controlled();
  buffer.prefetch([segment('old'), segment('never started')]);
  const wanted = buffer.get(segment('wanted'), () => {});
  assert.equal(calls[0].signal.aborted, true); assert.equal(calls[1].text, 'wanted');
  calls[0].resolve(audio()); calls[1].resolve(audio()); await wanted; await flush();
  const old = buffer.get(segment('old'), () => {});
  assert.equal(calls[2].text, 'old'); calls[2].resolve(audio()); await old;
  assert.equal(calls.length, 3); buffer.clear();
});

test('pause cancels speculative work, preserves completed audio, and stop clears it', async () => {
  const { buffer, calls } = controlled();
  const first = buffer.get(segment('one'), () => {}); calls[0].resolve(audio()); await first;
  buffer.prefetch([segment('two'), segment('three')]); buffer.cancelPending();
  assert.equal(calls[1].signal.aborted, true);
  calls[1].resolve(audio()); await flush();
  await buffer.get(segment('one'), () => {}); assert.equal(calls.length, 2);
  buffer.clear();
  const again = buffer.get(segment('one'), () => {}); calls[2].resolve(audio()); await again;
  assert.equal(calls.length, 3); buffer.clear();
});

test('speculative failures remain silent and foreground retries, with voice and provider isolated', async () => {
  const { buffer, calls } = controlled();
  buffer.prefetch([segment('one')]); calls[0].reject(new Error('temporary')); await flush();
  const retry = buffer.get(segment('one'), () => {}); calls[1].resolve(audio()); await retry;
  const changed = buffer.get({ ...segment('one'), voice: { ...voice, id: 'vi-VN-HoaiMyNeural' } }, () => {});
  calls[2].resolve(audio()); await changed;
  const local = buffer.get({ ...segment('one'), provider: 'espeak' }, () => {});
  calls[3].resolve(audio()); await local;
  assert.equal(calls.length, 4); buffer.clear();
});

test('cache limits both number and bytes of audio retained in memory', async () => {
  for (const size of [10, 5 * 1024 * 1024]) {
    let calls = 0;
    const buffer = new SpeechAudioBuffer(async () => { calls++; return audio(size); });
    const count = size === 10 ? 9 : 3;
    for (let i = 0; i < count; i++) await buffer.get(segment(String(i)), () => {});
    await buffer.get(segment(String(count - 1)), () => {}); assert.equal(calls, count);
    await buffer.get(segment('0'), () => {}); assert.equal(calls, count + 1);
    buffer.clear();
  }
});
