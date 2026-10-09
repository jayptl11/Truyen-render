import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

// These are real ONNX models, supplied locally to avoid repeatedly downloading 150 MB.
test('real Piper models synthesize 25hours, VAIS and distinct VIVOS speakers without Gather failures', async ({ page, context }) => {
  test.skip(!process.env.PIPER_MODEL_DIR, 'Set PIPER_MODEL_DIR to a directory containing the official ONNX models.');
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  const failures = []; page.on('pageerror', error => failures.push(error.message));
  await page.route('https://huggingface.co/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const directory = name.endsWith('.json') ? 'tests/fixtures/piper' : process.env.PIPER_MODEL_DIR;
    const file = name.endsWith('.onnx.json') ? name.replace('.onnx.json', '.json') : name;
    return route.fulfill({ path: resolve(directory, file), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.piperBlobs = [];
    window.Worker = function (...args) {
      const worker = new NativeWorker(...args);
      worker.addEventListener('message', event => { if (event.data.blob) window.piperBlobs.push(event.data.blob); });
      return worker;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương 12. Hôm nay trời nắng, xin chào các bạn.\nMột đoạn tiếp theo để kiểm tra bộ đọc hoạt động liên tục.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  const audioHashes = {};
  for (const voice of ['vi_VN-25hours_single-low', 'vi_VN-vivos-x_low', 'vi_VN-vivos-x_low#64', 'vi_VN-vais1000-medium']) {
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByLabel('Nguồn TTS', { exact: true }).selectOption('piper');
    await page.getByLabel('Giọng đọc', { exact: true }).selectOption(voice);
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByRole('button', { name: 'Nghe từ đoạn 1', exact: true }).click();
    const before = await page.evaluate(() => window.piperBlobs.length);
    await page.getByRole('button', { name: /^(Nghe truyện|Tiếp tục nghe)$/, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.piperBlobs.length), { timeout: 60000 }).toBeGreaterThanOrEqual(before + 2);
    const result = await page.evaluate(async index => {
      const bytes = await window.piperBlobs[index].arrayBuffer(); const view = new DataView(bytes);
      let nonzero = 0; for (let offset = 44; offset < bytes.byteLength; offset += 2) if (Math.abs(view.getInt16(offset, true)) > 50) nonzero++;
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      return { header: new TextDecoder().decode(bytes.slice(0, 4)), size: bytes.byteLength, nonzero, hash };
    }, before);
    expect(result.header).toBe('RIFF'); expect(result.size).toBeGreaterThan(1000); expect(result.nonzero).toBeGreaterThan(100);
    audioHashes[voice] = result.hash;
    await expect(page.locator('.inline-message')).toHaveCount(0);
    await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  }
  expect(audioHashes['vi_VN-vivos-x_low']).not.toBe(audioHashes['vi_VN-vivos-x_low#64']);
  if (process.env.PLAYWRIGHT_PREVIEW) {
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.unroute('https://huggingface.co/**');
    await context.setOffline(true);
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByLabel('Giọng đọc', { exact: true }).selectOption('vi_VN-vivos-x_low#1');
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByRole('button', { name: 'Nghe từ đoạn 1', exact: true }).click();
    const before = await page.evaluate(() => window.piperBlobs.length);
    await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.piperBlobs.length), { timeout: 60000 }).toBeGreaterThanOrEqual(before + 2);
    await expect(page.locator('.inline-message')).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
