import { chromium, firefox } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--url')) throw new Error('Cần --url https://deployment.vercel.app hoặc URL dev server. API Edge phải hoạt động.');
const base = new URL(value('--url')); if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('URL không hợp lệ.');
const browserName = args.includes('--browser') ? value('--browser') : 'chromium';
if (!['chromium', 'firefox'].includes(browserName)) throw new Error('Trình duyệt kiểm tra: chromium hoặc firefox.');
const rate = args.includes('--rate') ? Number(value('--rate')) : 1;
if (![1, 1.5, 2].includes(rate)) throw new Error('Tốc độ kiểm tra: 1, 1.5 hoặc 2.');
const accelerated = args.includes('--accelerate');
const minutes = args.includes('--minutes') ? Number(value('--minutes')) : 30;
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Số phút phải lớn hơn 0.');
const browser = await (browserName === 'firefox' ? firefox : chromium).launch(browserName === 'firefox' ? {} : { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'] });
const page = await browser.newPage();
const report = { browser: browserName, rate, accelerated, elapsedSeconds: 0, played: 0, chapters: 0, upstreamRequests: 0, upstreamFailures: 0, bufferedGapsMs: [], result: 'running' };
let failure;
try {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio; window.liveAudios = []; window.livePlayed = 0; window.livePlayedUrls = new Set(); window.liveChapters = new Set(); window.liveGaps = []; window.liveEndedAt = 0; window.liveReadyAtEnd = false;
    window.Audio = function () {
      const audio = new NativeAudio(); window.liveAudios.push(audio);
      audio.addEventListener('playing', () => {
        window.liveCurrent = audio; if (window.livePlayedUrls.has(audio.src)) return; window.livePlayedUrls.add(audio.src); window.livePlayed++;
        window.liveChapters.add(document.querySelector('.reader-toolbar h2')?.textContent || document.querySelector('article p')?.textContent);
        if (window.liveEndedAt && window.liveReadyAtEnd) window.liveGaps.push(performance.now() - window.liveEndedAt);
        window.liveEndedAt = 0;
      });
      audio.addEventListener('ended', () => { window.liveEndedAt = performance.now(); window.liveReadyAtEnd = window.liveAudios.some(other => other !== audio && other.src && other.readyState >= 3); });
      return audio;
    };
  });
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/tts' && request.method() === 'POST') report.upstreamRequests++; });
  page.on('response', response => { if (new URL(response.url()).pathname === '/api/tts' && response.status() >= 400) report.upstreamFailures++; });
  if (args.includes('--api-url')) {
    const api = new URL(value('--api-url'));
    await page.route('**/api/tts', async route => {
      try { const response = await route.fetch({ url: `${api.origin}/api/tts`, timeout: 28000 }); await route.fulfill({ response }); }
      catch { await route.abort('failed').catch(() => {}); }
    });
  }
  await page.route('**/api/story?*', async route => {
    const source = new URL(route.request().url()).searchParams.get('url');
    const chapter = Number(source.match(/chuong-(\d+)/)?.[1]) || 1;
    const paragraphs = Array.from({ length: accelerated ? 40 : 100 }, (_, index) => `<p>Đoạn ${index + 1}, chương ${chapter}. Buổi sáng, người lữ khách mở sách và đọc tiếp câu chuyện bên hiên nhà.</p>`).join('');
    const next = `https://tts-fixture.example/live-story/chuong-${chapter + 1}/`;
    await route.fulfill({ json: { html: `<h1>Chương ${chapter}: Kiểm tra nghe liên tục</h1><div id="chapter-content">${paragraphs}</div><a rel="next" href="${next}">Chương sau</a>`, sourceUrl: source } });
  });
  await page.goto(base.origin, { timeout: 30000 });
  await page.getByLabel('Liên kết chương truyện', { exact: true }).fill('https://tts-fixture.example/live-story/chuong-1/');
  await page.getByRole('button', { name: 'Lấy nội dung truyện', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc').click(); await page.getByLabel('Nguồn TTS').selectOption('edge');
  await page.getByLabel('Giọng đọc', { exact: true }).selectOption('vi-VN-HoaiMyNeural', { timeout: 30000 });
  await page.getByLabel('Tốc độ đọc').selectOption(String(rate)); await page.getByLabel('Tùy chọn giọng đọc').click();
  await page.getByText('Hết chương, nghe tiếp', { exact: true }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  const started = Date.now(); let lastProgress = started; let lastCount = 0; let lastReport = started;
  while (Date.now() - started < minutes * 60000) {
    await page.waitForTimeout(250);
    const state = await page.evaluate(accelerate => {
      const audio = window.liveCurrent;
      const prepared = window.liveAudios.some(other => other !== audio && other.src && other.readyState >= 3);
      if (accelerate && prepared && audio && !audio.paused && Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime < audio.duration - 0.1) audio.currentTime = audio.duration - 0.04;
      return { played: window.livePlayed, chapters: window.liveChapters.size, gaps: window.liveGaps, error: document.querySelector('.speech-player > [role="alert"]')?.textContent };
    }, accelerated);
    Object.assign(report, { elapsedSeconds: Math.round((Date.now() - started) / 1000), played: state.played, chapters: state.chapters, bufferedGapsMs: state.gaps });
    if (state.error) throw new Error(state.error);
    if (state.played !== lastCount) { lastCount = state.played; lastProgress = Date.now(); }
    if (Date.now() - lastProgress > 90000) throw new Error('Phiên không chuyển phần trong 90 giây.');
    if (Date.now() - lastReport > 30000) { console.log(JSON.stringify({ elapsedSeconds: report.elapsedSeconds, played: report.played, chapters: report.chapters, requests: report.upstreamRequests })); lastReport = Date.now(); }
    if (accelerated && state.played >= 120 && state.chapters >= 3) break;
  }
  if (report.played < (accelerated ? 120 : 20) || report.chapters < 3) throw new Error('Chưa đủ phần đọc hoặc chưa chuyển qua 3 chương.');
  const ordered = [...report.bufferedGapsMs].sort((a, b) => a - b);
  report.bufferedGapP95Ms = ordered.length ? Math.round(ordered[Math.floor((ordered.length - 1) * 0.95)]) : null;
  report.bufferedGapMaxMs = ordered.length ? Math.round(ordered.at(-1)) : null;
  report.result = 'passed';
} catch (error) { failure = error; report.result = 'failed'; report.error = error.message; }
finally { await browser.close(); }
console.log(JSON.stringify(report, null, 2));
if (args.includes('--output')) await writeFile(value('--output'), JSON.stringify(report, null, 2) + '\n');
if (failure) process.exitCode = 1;
