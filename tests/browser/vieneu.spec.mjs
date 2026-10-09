import { test, expect } from '@playwright/test';

const voices = [
  { id: 'demo-male', name: 'Nam thử nghiệm', language: 'vi-VN', gender: 'male' },
  { id: 'demo-female', name: 'Nữ thử nghiệm', language: 'vi-VN', gender: 'female' },
];
function wav() {
  const audio = Buffer.alloc(44 + 8000 * 2 * 5);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40); return audio;
}
async function prepare(page, text = 'Một đoạn truyện để nghe bằng VieNeu.') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = function () { const audio = new NativeAudio(); audio.addEventListener('play', () => { window.vieneuTestAudio = audio; }); return audio; };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByLabel('Nguồn TTS', { exact: true }).selectOption('vieneu');
}

test('VieNeu filters voices, splits long text, pauses/resumes and keeps source selection', async ({ page }) => {
  const posts = [];
  await page.route('**/api/vieneu', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { voices } });
    posts.push(route.request().postDataJSON()); return route.fulfill({ body: wav(), contentType: 'audio/wav' });
  });
  await prepare(page, 'Một đoạn văn dài. '.repeat(70));
  await page.getByLabel('Giới tính giọng đọc', { exact: true }).selectOption('female');
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('demo-female');
  await expect(page.getByLabel('Giọng đọc', { exact: true }).locator('option')).toHaveCount(1);
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.vieneuTestAudio?.currentTime || 0)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  expect(await page.evaluate(() => window.vieneuTestAudio.paused)).toBe(true);
  await page.getByRole('button', { name: 'Tiếp tục nghe', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.vieneuTestAudio.paused)).toBe(false);
  await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  expect(posts.length).toBeGreaterThan(0);
  expect(posts.every(body => body.voice === 'demo-female' && body.language === 'vi-VN' && body.text.length <= 240)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reader_tts_selection')).provider)).toBe('vieneu');
});

test('VieNeu catalog failure allows retry without switching sources', async ({ page }) => {
  let fail = true;
  await page.route('**/api/vieneu', route => route.fulfill(fail ? { status: 503, json: { error: 'Máy chủ VieNeu chưa được cấu hình.' } } : { json: { voices } }));
  await prepare(page);
  await expect(page.locator('.speech-options-panel')).toContainText('Máy chủ VieNeu chưa được cấu hình.');
  fail = false;
  await page.getByRole('button', { name: 'Tải lại danh sách giọng' }).click();
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('demo-male');
  await expect(page.getByLabel('Nguồn TTS', { exact: true })).toHaveValue('vieneu');
});

test('cached VieNeu audio and voice catalog survive reload when the service is unavailable', async ({ page }) => {
  let unavailable = false, posts = 0;
  await page.route('**/api/vieneu', route => {
    if (unavailable) return route.fulfill({ status: 503, json: { error: 'Máy chủ tạm ngừng.' } });
    if (route.request().method() === 'GET') return route.fulfill({ json: { voices } });
    posts++; return route.fulfill({ body: wav(), contentType: 'audio/wav' });
  });
  await prepare(page);
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue('demo-male');
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.vieneuTestAudio?.currentTime || 0)).toBeGreaterThan(0.1);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('truyen-library'); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise(resolve => { const request = db.transaction('audio').objectStore('audio').count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  })).toBe(1);
  await page.getByRole('button', { name: 'Dừng đọc', exact: true }).click();
  unavailable = true; await page.reload();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.vieneuTestAudio?.currentTime || 0)).toBeGreaterThan(0.1);
  expect(posts).toBe(1);
});

test('live VieNeu service plays genuine model audio through the app proxy', async ({ page }) => {
  test.skip(!process.env.VIENEU_LIVE, 'Start npm run vieneu and set VIENEU_LIVE=1 to exercise the real model.');
  test.setTimeout(90000);
  await prepare(page, 'Xin chào các bạn. Chúc các bạn nghe truyện vui vẻ.');
  await page.getByLabel('Giới tính giọng đọc', { exact: true }).selectOption('female');
  await expect(page.getByLabel('Giọng đọc', { exact: true }).locator('option')).not.toHaveCount(0);
  await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.vieneuTestAudio?.currentTime || 0), { timeout: 45000 }).toBeGreaterThan(0.1);
  await expect(page.locator('.speech-player > .inline-message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  expect(await page.evaluate(() => window.vieneuTestAudio.paused)).toBe(true);
});
