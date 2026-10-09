import { test, expect } from '@playwright/test';

async function prepare(page, provider) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Một chương truyện để nghe\nNắng trải trên con đường nhỏ, người lữ khách mở cuốn sách và đọc thêm một chương.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByLabel('Nguồn TTS', { exact: true }).selectOption(provider);
  await page.getByLabel('Ngôn ngữ đọc', { exact: true }).selectOption('vi-VN');
}

test('eSpeak synthesizes Vietnamese WAV locally, pauses, and reads the next paragraph without network', async ({ page, context }) => {
  test.setTimeout(45000);
  const calls = [];
  page.on('request', request => calls.push(request.url()));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.localWorkers = 0; window.localWorkerResults = 0;
    window.Worker = function (...args) {
      const worker = new NativeWorker(...args); window.localWorkers++;
      worker.addEventListener('message', event => { if (event.data.blob) window.localWorkerResults++; });
      return worker;
    };
    const NativeAudio = window.Audio;
    window.Audio = function () { const audio = new NativeAudio(); audio.addEventListener('play', () => { window.localTestAudio = audio; }); return audio; };
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) { window.localTestBlob = blob; return create(blob); };
  });
  await prepare(page, 'espeak');
  await page.getByLabel('Giới tính giọng đọc', { exact: true }).selectOption('female');
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('vi+f2');
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localTestAudio?.currentTime || 0), { timeout: 20000 }).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  expect(await page.evaluate(() => window.localTestAudio.paused)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.localWorkerResults)).toBe(2);
  const generated = await page.evaluate(async () => {
    const buffer = await window.localTestBlob.arrayBuffer();
    return { size: buffer.byteLength, header: new TextDecoder().decode(buffer.slice(0, 4)), type: window.localTestBlob.type };
  });
  expect(generated.header).toBe('RIFF'); expect(generated.size).toBeGreaterThan(1000); expect(generated.type).toBe('audio/wav');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Đoạn sau', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tiếp tục nghe', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục nghe', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localTestAudio?.currentTime || 0), { timeout: 10000 }).toBeGreaterThan(0.1);
  expect(calls.some(url => url.includes('/api/tts'))).toBe(false);
  expect(calls.filter(url => url.includes('espeak-ng') && /\.wasm$/.test(url))).toHaveLength(1);
  expect(await page.evaluate(() => window.localWorkers)).toBe(1);
});

test('Piper exposes Vietnamese model choices without downloading models on selection', async ({ page }) => {
  const calls = [];
  page.on('request', request => calls.push(request.url()));
  await prepare(page, 'piper');
  const voices = page.getByLabel('Giọng đọc', { exact: true });
  await expect(voices.locator('option')).toHaveCount(67);
  await voices.selectOption('vi_VN-vivos-x_low');
  await expect(page.locator('.speech-options-panel')).toContainText('28 MB');
  await expect(page.locator('.speech-options-panel')).toContainText('phi thương mại');
  await voices.selectOption('vi_VN-vivos-x_low#64');
  await expect(voices).toHaveValue('vi_VN-vivos-x_low#64');
  await expect(page.getByLabel('Giới tính giọng đọc', { exact: true }).locator('option[value="female"]')).toHaveAttribute('disabled', '');
  expect(calls.some(url => /huggingface|\.onnx|\/tts\/piper|\/tts\/onnx/.test(url))).toBe(false);
});

test('all six free Vietnamese eSpeak variants create different local audio', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    window.variantBlobs = [];
    const NativeWorker = window.Worker;
    window.Worker = function (...args) {
      const worker = new NativeWorker(...args);
      worker.addEventListener('message', event => { if (event.data.blob) window.variantBlobs.push(event.data.blob); });
      return worker;
    };
  });
  await prepare(page, 'espeak');
  const hashes = [];
  await expect(page.getByLabel('Giọng đọc', { exact: true }).locator('option')).toHaveCount(6);
  for (const voice of ['vi+m1', 'vi+m2', 'vi+m3', 'vi+f1', 'vi+f2', 'vi+f3']) {
    await page.getByLabel('Giọng đọc', { exact: true }).selectOption(voice);
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByRole('button', { name: 'Nghe từ đoạn 1', exact: true }).click();
    const before = await page.evaluate(() => window.variantBlobs.length);
    await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.variantBlobs.length), { timeout: 15000 }).toBeGreaterThan(before);
    hashes.push(await page.evaluate(async index => {
      const bytes = await window.variantBlobs[index].arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    }, before));
    await expect(page.locator('.inline-message')).toHaveCount(0);
    await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  }
  expect(new Set(hashes).size).toBe(6);
});

test('Piper worker starts and reports a failed model download without leaving playback active', async ({ page }) => {
  await page.route('https://huggingface.co/**', route => route.fulfill({ status: 503, body: 'unavailable', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await prepare(page, 'piper');
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect(page.locator('.inline-message')).toContainText('Không tải được tài nguyên giọng đọc (HTTP 503).');
  await expect(page.getByRole('button', { name: 'Tiếp tục nghe', exact: true })).toBeEnabled();
  await expect(page.locator('.speech-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  await expect(page.locator('.inline-message')).toHaveCount(0);
});
