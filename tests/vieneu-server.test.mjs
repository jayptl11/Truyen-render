import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { buildSync } from 'esbuild';

const code = buildSync({ entryPoints: ['server/vieneu.ts'], bundle: true, format: 'esm', write: false }).outputFiles[0].text;
const { default: handler, vieneuAudio, vieneuVoices } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const input = { text: 'Một đoạn truyện.', voice: 'Trúc Ly', language: 'vi-VN' };
function wav(size = 100) { const data = Buffer.alloc(size); data.write('RIFF', 0); data.write('WAVE', 8); return data; }
function setup(t, fetcher) {
  const previous = { fetch: globalThis.fetch, base: process.env.VIENEU_BASE_URL, key: process.env.VIENEU_API_KEY };
  process.env.VIENEU_BASE_URL = 'https://vieneu.example.test'; process.env.VIENEU_API_KEY = 'test-only-secret';
  globalThis.fetch = fetcher;
  t.after(() => {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [['VIENEU_BASE_URL', previous.base], ['VIENEU_API_KEY', previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}
test('VieNeu catalog preserves canonical voice IDs, display names and gender metadata', async t => {
  setup(t, async (url, options) => {
    assert.equal(url, 'https://vieneu.example.test/v1/voices');
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
    return Response.json({ data: [{ id: 'Trúc Ly', name: '⭐ Trúc Ly — Nữ · Bắc', gender: 'female' }, { id: '', name: 'Invalid' }] });
  });
  assert.deepEqual(await vieneuVoices(new AbortController().signal), [{ id: 'Trúc Ly', name: '⭐ Trúc Ly — Nữ · Bắc', gender: 'female', language: 'vi-VN' }]);
});

test('VieNeu proxy only targets its configured server and maps requests to v3 Turbo WAV', async t => {
  setup(t, async (url, options) => {
    assert.equal(url, 'https://vieneu.example.test/v1/audio/speech');
    assert.deepEqual(JSON.parse(options.body), { model: 'vieneu-v3-turbo', input: input.text, voice: input.voice, response_format: 'wav' });
    assert.equal(options.redirect, 'error');
    return new Response(wav(), { headers: { 'Content-Type': 'audio/wav' } });
  });
  const audio = await vieneuAudio({ ...input, url: 'http://169.254.169.254/' }, new AbortController().signal);
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  for (const invalid of [null, {}, { ...input, text: 'x'.repeat(241) }, { ...input, voice: '' }, { ...input, language: 'wrong' }]) {
    await assert.rejects(vieneuAudio(invalid, new AbortController().signal), error => error.status === 400);
  }
});

test('VieNeu proxy rejects non-audio, empty WAV and oversized upstream output', async t => {
  setup(t, async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(vieneuAudio(input, new AbortController().signal), /WAV hợp lệ/);
  globalThis.fetch = async () => new Response(wav(44), { headers: { 'Content-Type': 'audio/wav' } });
  await assert.rejects(vieneuAudio(input, new AbortController().signal), /WAV trống/);
  globalThis.fetch = async () => new Response(wav(4 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'audio/wav' } });
  await assert.rejects(vieneuAudio(input, new AbortController().signal), error => error.status === 413);
});

test('VieNeu proxy reports busy/auth errors safely and respects cancellation', async t => {
  setup(t, async () => new Response('upstream contains test-only-secret', { status: 429 }));
  await assert.rejects(vieneuVoices(new AbortController().signal), error => error.status === 429 && !error.message.includes('test-only-secret'));
  globalThis.fetch = async () => new Response('test-only-secret', { status: 401 });
  await assert.rejects(vieneuVoices(new AbortController().signal), error => error.status === 401 && !error.message.includes('test-only-secret'));
  globalThis.fetch = async (_url, options) => { options.signal.throwIfAborted(); };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(vieneuVoices(controller.signal), error => error.name === 'AbortError');
});

test('VieNeu handler rejects unsupported methods and malformed JSON before upstream calls', async t => {
  setup(t, async () => { assert.fail('upstream must not be called'); });
  for (const [method, body, status] of [['DELETE', undefined, 405], ['POST', '{', 400], ['POST', 'x'.repeat(12001), 413]]) {
    const req = Object.assign(new EventEmitter(), { method, body });
    const res = Object.assign(new EventEmitter(), { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(value) { this.status = value; }, end(value) { this.body = JSON.parse(value); this.writableEnded = true; } });
    await handler(req, res); assert.equal(res.status, status); assert.equal(typeof res.body.error, 'string');
  }
});
