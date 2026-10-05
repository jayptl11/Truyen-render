import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';

const appBundle = buildSync({ entryPoints: ['src/main.tsx'], bundle: true, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, write: false }).outputFiles[0].text;
const sourceBundle = buildSync({ entryPoints: ['src/services/storySources/client.ts'], bundle: true, format: 'iife', globalName: 'StorySource', write: false }).outputFiles[0].text;
const speechBundle = buildSync({ entryPoints: ['src/features/tts/useSpeechReader.ts'], bundle: true, format: 'iife', globalName: 'SpeechTools', write: false }).outputFiles[0].text;
const chapterBundle = buildSync({ entryPoints: ['src/services/storage/chapters.ts'], bundle: true, format: 'iife', globalName: 'Chapters', write: false }).outputFiles[0].text;
const chapter1 = 'https://example.com/truyen/chuong-1';
const chapter2 = 'https://example.com/truyen/chuong-2';
const html = (number, next = '') => `<html><h1>Chương ${number}: Bản gốc</h1><div id="chapter-content"><p>Nội dung chương ${number} chưa dịch.</p><p>Đoạn cuối chương ${number}.</p><script>bad()</script></div>${next ? `<a rel="next" href="${next}">Chương sau</a>` : ''}</html>`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message = 'condition', timeout = 2500) {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > timeout) throw Error(`Timed out waiting for ${message}`); await wait(10); }
  await wait(10);
}
function mount({ saved = {}, unsupported = false, fetcher, fakeClock = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5173', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', event => errors.push(event.error));
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.AbortSignal = globalThis.AbortSignal; w.AbortController = globalThis.AbortController;
  Object.entries(saved).forEach(([key, value]) => w.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)));
  const requests = [];
  w.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (fetcher) return fetcher(url, options);
    const query = new URL(url).searchParams;
    const source = query.get('url') || query.get('quest');
    if (!source) throw Error(`Unexpected external call: ${url}`);
    const content = source === chapter1 ? html(1, '/truyen/chuong-2') : html(2);
    return new Response(JSON.stringify({ contents: content }), { status: 200 });
  };
  const synthesis = new w.EventTarget();
  synthesis.calls = []; synthesis.current = null; synthesis.pauses = 0; synthesis.resumes = 0; synthesis.cancels = 0;
  synthesis.getVoices = () => [{ name: 'Tiếng Việt thử nghiệm', lang: 'vi-VN', voiceURI: 'vi-test' }];
  synthesis.speak = utterance => { synthesis.current = utterance; synthesis.calls.push(utterance); };
  synthesis.cancel = () => { const old = synthesis.current; synthesis.current = null; synthesis.cancels++; old?.onerror?.({ error: 'canceled' }); };
  synthesis.pause = () => { synthesis.pauses++; };
  synthesis.resume = () => { synthesis.resumes++; };
  synthesis.finish = () => { const old = synthesis.current; synthesis.current = null; old?.onend?.(); };
  if (!unsupported) {
    w.speechSynthesis = synthesis;
    w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }
  const intervals = new Map();
  if (fakeClock) {
    let next = 1;
    w.setInterval = (callback, ms) => { const id = next++; intervals.set(id, { callback, ms }); return id; };
    w.clearInterval = id => intervals.delete(id);
  }
  w.eval(appBundle);
  const button = (label, exact = false) => [...w.document.querySelectorAll('button')].find(element => exact ? element.textContent.trim() === label : element.textContent.includes(label));
  const click = label => { const element = button(label); assert.ok(element, `Missing button: ${label}`); assert.equal(element.disabled, false, `Disabled button: ${label}`); element.click(); };
  const input = (element, value) => {
    assert.ok(element, 'Missing input');
    const prototype = element.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : element.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new w.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  return { dom, w, errors, requests, synthesis, intervals, button, click, input, close() { dom.window.close(); } };
}
async function loadFirst(app) {
  await until(() => app.w.document.querySelector('input[placeholder*="Dán link"]'));
  app.input(app.w.document.querySelector('input[placeholder*="Dán link"]'), chapter1);
  await wait(20);
  app.w.document.querySelector('button[aria-label="Lấy nội dung truyện"]').click();
  await until(() => app.w.document.body.textContent.includes('Nội dung chương 1 chưa dịch.'));
}
function cache(app) { return JSON.parse(app.w.localStorage.getItem('reader_translated_cache') || '[]'); }

test('extracts original story, preserves paragraphs and resolves chapter links', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(sourceBundle);
  const data = dom.window.StorySource.parseStoryHtml(html(1, '/truyen/chuong-2'), chapter1);
  assert.match(data.content, /Chương 1: Bản gốc\n\nNội dung chương 1 chưa dịch\.\nĐoạn cuối/);
  assert.equal(data.nextUrl, chapter2);
  assert.equal(data.prevUrl, null);
  assert.ok(!data.content.includes('bad()'));
  assert.throws(() => dom.window.StorySource.storyUrl('javascript:alert(1)'));
  dom.window.close();
});

test('loads, reads and speaks raw chapters without API keys; next chapter has its own cache identity', async () => {
  const app = mount();
  try {
    await loadFirst(app);
    assert.equal(app.w.document.querySelector('section[aria-label="Cài đặt AI"]'), null);
    assert.equal(app.button('Bản dịch', true).disabled, true);
    app.click('Nghe truyện'); await until(() => app.synthesis.calls.length);
    assert.equal(app.synthesis.calls[0].text, 'Chương 1: Bản gốc');
    assert.equal(app.synthesis.calls[0].lang, 'vi-VN');
    app.click('Tạm dừng'); await wait(20); assert.equal(app.synthesis.pauses, 1);
    app.click('Tiếp tục nghe'); await wait(20); assert.equal(app.synthesis.resumes, 1);
    app.click('Chương sau');
    await until(() => app.w.document.body.textContent.includes('Nội dung chương 2 chưa dịch.'));
    const stored = cache(app);
    assert.equal(stored.length, 2);
    assert.match(stored.find(c => c.url === chapter1).content, /chương 1/);
    assert.match(stored.find(c => c.url === chapter2).content, /chương 2/);
    assert.ok(stored.every(c => c.translatedContent === ''));
    assert.ok(app.requests.every(r => r.url.includes('api.allorigins.win')));
    assert.equal(app.synthesis.current, null);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test('manual text creates a separate saved chapter after loading a URL', async () => {
  const app = mount();
  try {
    await loadFirst(app);
    app.click('Dán văn bản'); await wait(20);
    app.input(app.w.document.querySelector('textarea'), 'Truyện nhập tay\nMột đoạn để nghe.'); await wait(20);
    app.click('Đọc / nghe bản gốc');
    await until(() => cache(app).some(c => c.url.startsWith('manual:')));
    const stored = cache(app);
    assert.equal(stored.length, 2);
    assert.match(stored.find(c => c.url === chapter1).content, /chương 1/);
    const manual = stored.find(c => c.url.startsWith('manual:'));
    assert.equal(manual.nextUrl, null); assert.equal(manual.prevUrl, null);
    assert.equal(manual.content, 'Truyện nhập tay\nMột đoạn để nghe.');
    app.click('Nghe truyện'); await until(() => app.synthesis.calls.length);
    assert.equal(app.synthesis.current.text, 'Truyện nhập tay');
    assert.equal(app.requests.length, 1);
  } finally { app.close(); }
});

test('TTS finishes current chapter and starts next original chapter without translation', async () => {
  const app = mount();
  try {
    await loadFirst(app);
    app.w.document.querySelector('section[aria-label="Điều khiển giọng đọc"] input[type="checkbox"]').click();
    await until(() => cache(app).some(c => c.url === chapter2));
    app.click('Nghe truyện'); await until(() => app.synthesis.current);
    app.synthesis.finish(); await wait(20);
    app.synthesis.finish(); await wait(20);
    app.synthesis.finish();
    await until(() => app.synthesis.current?.text === 'Chương 2: Bản gốc', 'second chapter TTS');
    assert.equal(app.requests.length, 2);
    assert.ok(cache(app).every(c => c.translatedContent === ''));
  } finally { app.close(); }
});

test('TTS restores saved paragraph, saves progress, handles failure and invalidates old callbacks', async () => {
  const app = mount({ saved: { reader_progress: { [`${chapter1}:original`]: { chapterId: chapter1, version: 'original', paragraph: 1 } } } });
  try {
    await loadFirst(app); app.click('Nghe truyện'); await until(() => app.synthesis.current);
    assert.match(app.synthesis.current.text, /Nội dung chương 1/);
    const old = app.synthesis.current;
    app.click('Chương sau'); await until(() => cache(app).length === 2);
    const calls = app.synthesis.calls.length;
    old.onend(); await wait(20); assert.equal(app.synthesis.calls.length, calls);
    app.click('Nghe truyện'); await until(() => app.synthesis.current);
    app.synthesis.current.onerror({ error: 'voice-unavailable' });
    await until(() => app.w.document.body.textContent.includes('voice-unavailable'));
    assert.ok(app.button('Nghe truyện'));
  } finally { app.close(); }
});

test('sleep timer stops speech even when automatic chapter navigation is off', async () => {
  const app = mount({ fakeClock: true });
  try {
    await loadFirst(app); app.click('Nghe truyện'); await until(() => app.synthesis.current);
    app.click('Cài đặt'); await wait(20); app.click('15 phút');
    await until(() => [...app.intervals.values()].some(timer => timer.ms === 1000));
    const timer = [...app.intervals.values()].find(timer => timer.ms === 1000);
    for (let i = 0; i < 900; i++) timer.callback();
    await until(() => !app.synthesis.current, 'sleep timer cancels speech');
    assert.equal(app.requests.length, 1);
  } finally { app.close(); }
});

test('raw reading works without speech support and failed fetch preserves the current chapter', async () => {
  let first = true;
  const app = mount({ unsupported: true, fetcher: async () => {
    if (first) { first = false; return new Response(JSON.stringify({ contents: html(1, chapter2) })); }
    return new Response('Service down', { status: 503 });
  } });
  try {
    await loadFirst(app); assert.match(app.w.document.body.textContent, /Trình duyệt này chưa hỗ trợ TTS/);
    app.click('Chương sau'); await until(() => app.w.document.body.textContent.includes('Không lấy được nội dung truyện'));
    assert.match(app.w.document.body.textContent, /Nội dung chương 1 chưa dịch/);
    assert.equal(cache(app).length, 1);
  } finally { app.close(); }
});

test('speech splits long paragraphs and cache updates preserve a matching existing translation', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only', url: 'http://localhost' });
  dom.window.eval(speechBundle); dom.window.eval(chapterBundle);
  const text = 'Một đoạn văn rất dài. '.repeat(80).trim();
  const parts = dom.window.SpeechTools.splitSpeechText(text);
  assert.ok(parts.length > 1); assert.ok(parts.every(p => p.length <= 240)); assert.equal(parts.join(' '), text);
  const original = dom.window.Chapters.createChapter(chapter1, { content: 'Original', nextUrl: null, prevUrl: null }, 'Translation');
  const raw = dom.window.Chapters.createChapter(chapter1, { content: 'Original', nextUrl: null, prevUrl: null });
  const saved = dom.window.Chapters.upsertChapter([original], raw);
  assert.equal(saved[0].translatedContent, 'Translation');
  const changed = dom.window.Chapters.createChapter(chapter1, { content: 'New original', nextUrl: null, prevUrl: null });
  assert.equal(dom.window.Chapters.upsertChapter(saved, changed)[0].translatedContent, '');
  dom.window.close();
});

test('translation is optional and switching back speaks the original content', async () => {
  const app = mount({ saved: { groq_api_keys: ['test-only-key', '', ''] }, fetcher: async url => {
    if (url.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Chương 1: Bản dịch\nĐây là đoạn đã dịch.' } }] }));
    return new Response(JSON.stringify({ contents: html(1) }));
  } });
  try {
    await loadFirst(app);
    assert.equal(app.requests.filter(r => r.url.includes('api.groq.com')).length, 0);
    app.click('Dịch (tùy chọn)');
    await until(() => app.w.document.body.textContent.includes('Đây là đoạn đã dịch.'));
    assert.equal(app.button('Bản dịch', true).getAttribute('aria-pressed'), 'true');
    app.click('Bản gốc'); await wait(20); app.click('Nghe truyện');
    await until(() => app.synthesis.current);
    assert.equal(app.synthesis.current.text, 'Chương 1: Bản gốc');
    assert.match(cache(app)[0].translatedContent, /đã dịch/);
  } finally { app.close(); }
});

test('chapter limit stops at the end of the current chapter without loading another one', async () => {
  const app = mount();
  try {
    await loadFirst(app); app.click('Cài đặt'); await wait(20); app.click('Dừng sau 1 chương');
    app.w.document.querySelector('section[aria-label="Điều khiển giọng đọc"] input[type="checkbox"]').click();
    await wait(20); app.click('Nghe truyện'); await until(() => app.synthesis.current);
    app.synthesis.finish(); await wait(20); app.synthesis.finish(); await wait(20); app.synthesis.finish();
    await until(() => !app.synthesis.current);
    assert.equal(app.requests.length, 1);
    assert.equal(app.w.document.querySelector('section[aria-label="Điều khiển giọng đọc"] input[type="checkbox"]').checked, false);
  } finally { app.close(); }
});

test('late fetch responses cannot overwrite a newer chapter', async () => {
  let resolveOld;
  const app = mount({ fetcher: async (url, options) => {
    const target = new URL(url).searchParams.get('url');
    if (target === chapter1) return new Promise(resolve => { resolveOld = resolve; options.signal.addEventListener('abort', () => resolve(new Response(JSON.stringify({ contents: html(1) })))); });
    return new Response(JSON.stringify({ contents: html(2) }));
  } });
  try {
    await until(() => app.w.document.querySelector('input[placeholder*="Dán link"]'));
    app.input(app.w.document.querySelector('input[placeholder*="Dán link"]'), chapter1); await wait(20);
    app.w.document.querySelector('button[aria-label="Lấy nội dung truyện"]').click(); await until(() => resolveOld);
    app.click('Dán văn bản'); await wait(20); app.click('Liên kết'); await wait(20);
    app.input(app.w.document.querySelector('input[placeholder*="Dán link"]'), chapter2); await wait(20);
    app.w.document.querySelector('button[aria-label="Lấy nội dung truyện"]').click();
    await until(() => cache(app).length);
    resolveOld(new Response(JSON.stringify({ contents: html(1) }))); await wait(30);
    assert.equal(cache(app).length, 1); assert.equal(cache(app)[0].url, chapter2);
    assert.match(app.w.document.body.textContent, /Nội dung chương 2/);
  } finally { app.close(); }
});

test('batch translates raw cached chapters, keeps progress on failure and resumes safely', async () => {
  let failSecond = true;
  const storedFirst = { url: chapter1, title: 'Chương 1', content: 'Nội dung chương 1 chưa dịch.', nextUrl: chapter2, prevUrl: null, translatedContent: '', webName: 'example.com', timestamp: Date.now() };
  const app = mount({ saved: { groq_api_keys: ['test-only-key', '', ''], reader_translated_cache: [storedFirst] }, fetcher: async (url, options) => {
    if (url.includes('api.groq.com')) {
      const body = JSON.parse(options.body);
      const text = body.messages.at(-1).content;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: text.includes('chương 1') ? 'Chương 1 dịch\nMột.' : 'Chương 2 dịch\nHai.' } }] }));
    }
    if (failSecond) return new Response('Down', { status: 503 });
    return new Response(JSON.stringify({ contents: html(2) }));
  } });
  try {
    await until(() => app.button('Cài đặt'));
    app.click('Cài đặt'); await wait(20);
    app.click('Dịch hàng loạt'); await wait(20);
    app.input(app.w.document.querySelector('input[aria-label="Liên kết chương đầu"]'), chapter1); await wait(20);
    app.input(app.w.document.querySelector('input[type="number"]'), '2'); await wait(20);
    app.click('Bắt đầu dịch');
    await until(() => app.w.document.body.textContent.includes('Tiến độ đã lưu để tiếp tục.'));
    assert.match(cache(app).find(c => c.url === chapter1).translatedContent, /Chương 1 dịch/);
    const state = JSON.parse(app.w.localStorage.getItem('reader_batch_state'));
    assert.equal(state.translated, 1); assert.equal(state.currentUrl, chapter2);
    failSecond = false;
    app.click('Tiếp tục 1/2');
    await until(() => cache(app).some(c => c.url === chapter2 && c.translatedContent));
    await until(() => app.w.localStorage.getItem('reader_batch_state') === null);
    assert.equal(app.requests.filter(r => r.url.includes('api.groq.com')).length, 2);
  } finally { app.close(); }
});

test('bookmark restores its saved paragraph even when reopening the current chapter', async () => {
  const app = mount();
  try {
    await loadFirst(app);
    app.w.document.querySelector('button[aria-label="Đoạn sau"]').click(); await wait(20);
    app.w.document.querySelector('button[title="Đánh dấu"]').click(); await wait(20);
    app.w.document.querySelector('button[aria-label="Đoạn sau"]').click(); await wait(20);
    app.click('Các chương đánh dấu'); await wait(20);
    const dialog = app.w.document.querySelector('[role="dialog"]');
    [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Chương 1')).click(); await wait(30);
    app.click('Nghe truyện'); await until(() => app.synthesis.current);
    assert.match(app.synthesis.current.text, /Nội dung chương 1 chưa dịch/);
    assert.equal(app.synthesis.calls.length, 1);
  } finally { app.close(); }
});

test('disabling continuous listening during chapter fetch prevents a late automatic restart', async () => {
  let resolveNext;
  const app = mount({ fetcher: async (url, options) => {
    const source = new URL(url).searchParams.get('url');
    if (source === chapter1) return new Response(JSON.stringify({ contents: html(1, chapter2) }));
    return new Promise((resolve, reject) => {
      resolveNext = () => resolve(new Response(JSON.stringify({ contents: html(2) })));
      options.signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')));
    });
  } });
  try {
    await loadFirst(app);
    const continuous = app.w.document.querySelector('section[aria-label="Điều khiển giọng đọc"] input[type="checkbox"]');
    continuous.click(); await until(() => resolveNext);
    app.click('Nghe truyện'); await until(() => app.synthesis.current);
    app.synthesis.finish(); await wait(20); app.synthesis.finish(); await wait(20); app.synthesis.finish();
    await until(() => app.requests.length === 3, 'next chapter foreground request');
    continuous.click(); await wait(20);
    resolveNext(); await until(() => cache(app).some(c => c.url === chapter2));
    await wait(30);
    assert.equal(app.synthesis.current, null);
    assert.equal(app.synthesis.calls.length, 3);
  } finally { app.close(); }
});
