import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const build = file => buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', external: ['msedge-tts'], write: false }).outputFiles[0].text;
const core = build('server/tts.ts');
const api = build('api/tts.ts');
const input = { text: 'Một đoạn truyện <script> & "đọc"', voice: 'vi-VN-HoaiMyNeural', language: 'vi-VN' };
function load(code, { Edge, fetcher } = {}) {
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => name === 'msedge-tts'
    ? { MsEdgeTTS: Edge, OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'mp3' } } : require(name),
    Buffer, URL, AbortSignal, AbortController, fetch: fetcher, Date });
  return module.exports;
}

test('Edge request validation prevents oversized text and SSML injection through voice or language', () => {
  const service = load(core);
  assert.equal(service.validateSpeechInput(input).voice, input.voice);
  for (const value of [null, { ...input, text: '' }, { ...input, text: 'x'.repeat(1501) }, { ...input, voice: 'en-US-GuyNeural' }, { ...input, voice: 'vi-VN-X"><break/>Neural' }, { ...input, language: '<script>' }]) {
    assert.throws(() => service.validateSpeechInput(value), error => error.status === 400);
  }
  assert.equal(service.escapeSpeechText('<say> & "x"'), '&lt;say&gt; &amp; &quot;x&quot;');
});

test('Edge synthesis returns audio, escapes user text and closes its socket on success or cancellation', async () => {
  const sessions = [];
  class Edge {
    constructor() { this.closed = false; sessions.push(this); }
    setMetadata(voice, format, metadata) { this.voice = voice; this.format = format; this.metadata = metadata; return Promise.resolve(); }
    toStream(text) { this.text = text; return { audioStream: Readable.from([Buffer.from('audio')]) }; }
    close() { this.closed = true; }
  }
  const service = load(core, { Edge });
  assert.equal((await service.edgeAudio(input)).toString(), 'audio');
  assert.equal(sessions[0].voice, input.voice);
  assert.equal(sessions[0].metadata.voiceLocale, 'vi-VN');
  assert.match(sessions[0].text, /&lt;script&gt; &amp; &quot;đọc&quot;/);
  assert.equal(sessions[0].closed, true);
  class StalledEdge extends Edge { setMetadata() { return new Promise(() => {}); } }
  const stalled = load(core, { Edge: StalledEdge });
  const controller = new AbortController();
  const task = stalled.edgeAudio(input, controller.signal); controller.abort();
  await assert.rejects(task, error => error.status === 504);
  assert.equal(sessions.at(-1).closed, true);
});

test('TTS API returns voice metadata and audio without requiring keys; rejects malformed requests', async t => {
  let catalogs = 0;
  class Edge {
    async setMetadata() {}
    toStream() { return { audioStream: Readable.from([Buffer.from('audio')]) }; }
    close() {}
  }
  const handler = load(api, { Edge, fetcher: async () => {
    catalogs++;
    return new Response(JSON.stringify([{ ShortName: input.voice, FriendlyName: 'Microsoft HoaiMy Online (Natural)', Locale: 'vi-VN', Gender: 'Female' }]));
  } }).default;
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/tts`;
  const voices = await fetch(url);
  assert.equal(voices.status, 200);
  assert.deepEqual((await voices.json()).voices, [{ id: input.voice, name: 'HoaiMy', language: 'vi-VN', gender: 'female' }]);
  await fetch(url); assert.equal(catalogs, 1);
  const audio = await fetch(url, { method: 'POST', body: JSON.stringify(input) });
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg'); assert.equal(await audio.text(), 'audio');
  assert.equal((await fetch(url, { method: 'POST', body: 'not json' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(12001) })).status, 413);
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ ...input, voice: 'invalid' }) })).status, 400);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 405);
});
