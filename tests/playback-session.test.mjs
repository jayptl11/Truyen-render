import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
const compiled = buildSync({ entryPoints: ['src/engine/playback/PlaybackSession.ts'], bundle: true, format: 'esm', write: false }).outputFiles[0].text;
const { PlaybackSession } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const voice = { id: 'vi-VN-HoaiMyNeural', language: 'vi-VN', name: 'Hoài My', gender: 'female' };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) { for (let count = 0; count < 1000; count++) { if (check()) return; await tick(); } assert.fail('Playback failed to advance'); }
function environment() {
  const dom = new JSDOM('', { url: 'https://reader.example.com' });
  globalThis.window = dom.window; globalThis.localStorage = dom.window.localStorage;
  const instances = []; const played = []; const urls = new Map(); let sequence = 0;
  const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { const url = `blob:test-${++sequence}`; urls.set(url, blob); return url; };
  URL.revokeObjectURL = url => urls.delete(url);
  globalThis.Audio = class {
    currentTime = 0; duration = 10; readyState = 1; playbackRate = 1; paused = true;
    constructor() { instances.push(this); }
    play() { this.paused = false; played.push(this.src); return Promise.resolve(); }
    pause() { this.paused = true; }
    load() {}
    removeAttribute() { this.src = ''; }
    finish() { this.paused = true; this.currentTime = 10; this.onended?.(); }
  };
  const posts = []; globalThis.fetch = async (_, options) => { posts.push(JSON.parse(options.body).text); return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }); };
  return { instances, played, posts, active: () => instances.find(item => !item.paused), close() { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; delete globalThis.Audio; delete globalThis.window; delete globalThis.localStorage; dom.window.close(); } };
}
test('one session reads 120 parts across three chapters, keeps cached next-chapter audio and rejects callbacks after stop', async () => {
  const app = environment(); const session = new PlaybackSession(); let chapter = 0; let completed = false;
  const paragraphs = index => Array.from({ length: 40 }, (_, position) => `Chương ${index + 1}, đoạn ${position + 1}.`);
  const settings = index => ({ provider: 'edge', voice, rate: 1.5, options: { contentKey: `chapter:${index}:original`, initialParagraph: 0, paragraphs: paragraphs(index), onParagraph() {}, onComplete() {
    if (chapter === 2) { completed = true; return; }
    chapter++; session.prepareChapter(); session.configure(settings(chapter));
    if (chapter < 2) session.queueChapter(`chapter:${chapter + 1}:original`, paragraphs(chapter + 1));
    session.play(0);
  } } });
  try {
    session.configure(settings(0)); session.queueChapter('chapter:1:original', paragraphs(1)); session.play(0);
    for (let index = 0; index < 120; index++) {
      await until(() => app.active());
      assert.equal(session.getSnapshot().paragraph, index % 40); assert.equal(chapter, Math.floor(index / 40));
      await tick(); app.active().finish();
    }
    await until(() => completed);
    assert.equal(app.played.length, 120); assert.equal(session.getSnapshot().phase, 'completed');
    session.play(10); await until(() => app.active()); const stale = app.active().onended;
    session.stop(); stale(); await tick(); assert.equal(app.active(), undefined); assert.equal(session.getSnapshot().status, 'idle');
  } finally { session.destroy(); app.close(); }
});
test('pause and reload restore the audio part and seconds, while changed content resets the position', async () => {
  const app = environment(); let session = new PlaybackSession();
  const text = 'A'.repeat(1200) + 'B'.repeat(300);
  const settings = { provider: 'edge', voice, rate: 1, options: { contentKey: 'book:chapter:original', initialParagraph: 0, paragraphs: [text], onParagraph() {}, onComplete() {} } };
  try {
    session.configure(settings); session.play(0); await until(() => app.active()); await tick(); app.active().finish();
    await until(() => app.active()); app.active().currentTime = 4.25; session.pause();
    assert.equal(session.getSnapshot().part, 1); assert.equal(app.active(), undefined);
    session.destroy(); session = new PlaybackSession(); session.configure(settings); session.toggle(); await until(() => app.active());
    assert.equal(session.getSnapshot().part, 1); assert.equal(app.active().currentTime, 4.25);
    session.destroy(); session = new PlaybackSession(); session.configure({ ...settings, options: { ...settings.options, paragraphs: ['Changed text'] } }); session.toggle(); await until(() => app.active());
    assert.equal(session.getSnapshot().part, 0); assert.equal(app.active().currentTime, 0);
  } finally { session.destroy(); app.close(); }
});

test('stopping and switching chapters does not overwrite the saved audio part or seconds', async () => {
  const app = environment(); const session = new PlaybackSession();
  const settings = { provider: 'edge', voice, rate: 1, options: { contentKey: 'original:chapter-1', initialParagraph: 0, paragraphs: ['A'.repeat(1200) + 'B'.repeat(300)], onParagraph() {}, onComplete() {} } };
  try {
    session.configure(settings); session.play(0); await until(() => app.active()); await tick(); app.active().finish(); await until(() => app.active());
    app.active().currentTime = 4.25; session.stop();
    session.configure({ ...settings, options: { ...settings.options, contentKey: 'original:chapter-2', paragraphs: ['Chương khác'] } });
    session.configure(settings); assert.equal(session.getSnapshot().part, 1); session.toggle(); await until(() => app.active()); assert.equal(app.active().currentTime, 4.25);
    session.stop(); session.restorePosition(0); session.toggle(); await until(() => app.active()); assert.equal(app.active().currentTime, 4.25);
  } finally { session.destroy(); app.close(); }
});
