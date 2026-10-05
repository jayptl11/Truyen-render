import { test, expect } from '@playwright/test';
const voices = [
  { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh', language: 'vi-VN', gender: 'male' },
  { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My', language: 'vi-VN', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US', gender: 'male' },
];
function wav() {
  const bytes = 8000 * 5 * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
test('Edge selector fits a small phone and real audio pauses and resumes without resynthesis', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = function () { const audio = new NativeAudio(); window.testTtsAudio = audio; return audio; };
  });
  let posts = 0;
  await page.route('**/api/tts', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { voices } });
    else { posts++; await route.fulfill({ body: wav(), contentType: 'audio/wav' }); }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương thử nghiệm\nĐoạn đầu tiên.\nĐoạn thứ hai.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByLabel('Nguồn TTS', { exact: true }).selectOption('edge');
  await expect(page.getByLabel('Ngôn ngữ đọc', { exact: true })).toBeEnabled();
  await page.getByLabel('Ngôn ngữ đọc', { exact: true }).selectOption('vi-VN');
  await page.getByLabel('Giới tính giọng đọc', { exact: true }).selectOption('female');
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('vi-VN-HoaiMyNeural');
  await expect(page.getByLabel('Giọng đọc', { exact: true }).locator('option')).toHaveCount(1);
  const box = await page.locator('.speech-options-panel').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(640);
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testTtsAudio?.currentTime || 0)).toBeGreaterThan(0.1);
  await expect.poll(() => posts).toBe(3);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  expect(await page.evaluate(() => window.testTtsAudio.paused)).toBe(true);
  const pausedAt = await page.evaluate(() => window.testTtsAudio.currentTime);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.testTtsAudio.currentTime)).toBeCloseTo(pausedAt, 2);
  await page.getByRole('button', { name: 'Tiếp tục nghe', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testTtsAudio.currentTime)).toBeGreaterThan(pausedAt);
  expect(posts).toBe(3);
  await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  expect(await page.evaluate(() => window.testTtsAudio.paused)).toBe(true);
  await expect(page.getByRole('button', { name: 'Nghe truyện', exact: true })).toBeVisible();
});

for (const phase of ['catalog', 'audio']) {
  test(`Edge ${phase} explains Firefox AbortError and permits retry`, async ({ page }) => {
    await page.addInitScript(phase => {
      const original = window.fetch.bind(window);
      let failOnce = true;
      window.fetch = (url, options) => {
        if (url === '/api/tts' && failOnce && ((phase === 'audio') === (options?.method === 'POST'))) {
          failOnce = false;
          return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
        }
        return original(url, options);
      };
    }, phase);
    await page.route('**/api/tts', route => route.fulfill(route.request().method() === 'GET' ? { json: { voices } } : { body: wav(), contentType: 'audio/wav' }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
    await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương thử\nMột đoạn truyện để nghe.');
    await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByLabel('Nguồn TTS', { exact: true }).selectOption('edge');
    if (phase === 'catalog') {
      await expect(page.locator('.speech-options-panel')).toContainText('kết nối bị gián đoạn');
      await expect(page.locator('.speech-options-panel')).not.toContainText('The operation was aborted');
      await page.getByRole('button', { name: 'Tải lại danh sách giọng' }).click();
      await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('vi-VN-NamMinhNeural');
    } else {
      await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('vi-VN-NamMinhNeural');
      await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
      await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
      await expect(page.getByText('Nguồn giọng đọc phản hồi quá lâu hoặc kết nối bị gián đoạn. Thử lại hoặc chọn nguồn giọng khác.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
    }
  });
}

test('Edge buffers slow synthesis and switches manually and automatically without waiting for another request', async ({ page, context }) => {
  let posts = 0; let completed = 0;
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.bufferedPlaybackEvents = [];
    window.Audio = function () {
      const audio = new NativeAudio(); window.bufferedTestAudio = audio;
      audio.addEventListener('playing', () => window.bufferedPlaybackEvents.push(performance.now()));
      audio.addEventListener('ended', () => { window.transitionStarted = performance.now(); });
      return audio;
    };
  });
  await page.route('**/api/tts', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { voices } });
    posts++;
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ body: wav(), contentType: 'audio/wav' }); completed++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương thử nghiệm\nĐoạn đầu tiên.\nĐoạn thứ hai.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByLabel('Nguồn TTS', { exact: true }).selectOption('edge');
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('vi-VN-NamMinhNeural');
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => completed).toBe(3);
  await context.setOffline(true);
  await page.evaluate(() => {
    window.transitionStarted = performance.now();
    document.querySelector('button[aria-label="Đoạn sau"]').click();
  });
  await expect.poll(() => page.evaluate(() => window.bufferedPlaybackEvents.length)).toBe(2);
  const manualDelay = await page.evaluate(() => window.bufferedPlaybackEvents[1] - window.transitionStarted);
  expect(manualDelay).toBeLessThan(500);
  await page.evaluate(() => { window.bufferedTestAudio.currentTime = window.bufferedTestAudio.duration - 0.05; });
  await expect.poll(() => page.evaluate(() => window.bufferedPlaybackEvents.length)).toBe(3);
  const automaticDelay = await page.evaluate(() => window.bufferedPlaybackEvents[2] - window.transitionStarted);
  expect(automaticDelay).toBeLessThan(500);
  expect(posts).toBe(3);
  await expect(page.locator('.speech-loading')).toHaveCount(0);
});
