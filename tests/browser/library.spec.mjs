import { test, expect } from '@playwright/test';
const origin = 'https://webnovel.vn';
const bookUrl = `${origin}/test-story/`;
const bookHtml = `<h1 id="book-detail-title">Truyện kiểm thử</h1><ol id="chapterList"><a href="${bookUrl}chuong-1/"><span class="chapter-item__index">1</span><span class="chapter-item__title">Bắt đầu</span></a><a href="${bookUrl}chuong-2/"><span class="chapter-item__index">2</span><span class="chapter-item__title">Tiếp tục</span></a></ol>`;
const voice = { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My', language: 'vi-VN', gender: 'female' };
function wav() { const output = Buffer.alloc(44 + 16000 * 10); output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(8000, 24); output.writeUInt32LE(16000, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(output.length - 44, 40); return output; }
async function openLibrary(page) { await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click(); }
test('source search, catalog, range download and IndexedDB survive reload without refetching chapters', async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 390, height: 844 }); let chapterRequests = 0;
  await page.route('**/api/story?*', async route => {
    const url = new URL(route.request().url()).searchParams.get('url');
    const chapter = url.match(/chuong-(\d+)/)?.[1]; if (chapter) chapterRequests++;
    const html = chapter ? `<h1>Chương ${chapter}</h1><div id="chapter-content"><p>Nội dung offline chương ${chapter}.</p></div>` : url.includes('/tim-kiem/') ? `<a class="catx-card" href="${bookUrl}" title="Truyện kiểm thử">Truyện kiểm thử</a>` : bookHtml;
    await route.fulfill({ json: { html, sourceUrl: url } });
  });
  await page.goto('/'); await openLibrary(page);
  await page.getByRole('tab', { name: 'Nguồn truyện' }).click();
  await page.getByLabel('Tên truyện trên nguồn').fill('Truyện kiểm thử'); await page.getByRole('button', { name: 'Tìm truyện trên nguồn' }).click();
  await page.getByRole('button', { name: 'Truyện kiểm thử Thêm vào thư viện' }).click();
  await expect(page.getByRole('heading', { name: 'Truyện kiểm thử' })).toBeVisible();
  await page.locator('.download-panel summary').click(); await page.getByLabel('Tải đến chương').fill('2');
  await page.getByRole('button', { name: 'Tải khoảng chương' }).click();
  await expect(page.locator('.chapter-catalog')).toContainText('Đã tải'); await expect.poll(() => chapterRequests).toBe(2);
  await expect(page.locator('.library-task')).toHaveCount(0);
  await page.reload(); await openLibrary(page); await page.getByRole('button', { name: /Truyện kiểm thử .*2 chương đã tải/ }).click();
  await page.getByRole('button', { name: 'Chương 2: Tiếp tục Đã tải' }).click();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nội dung offline chương 2.'); expect(chapterRequests).toBe(2);
  await page.reload(); await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nội dung offline chương 2.');
});
test('audio download is pinned and can play from persistent cache after reload with failed network', async ({ page }) => {
  test.setTimeout(30000); let posts = 0; let unavailable = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { const NativeAudio = window.Audio; window.Audio = function () { const audio = new NativeAudio(); audio.addEventListener('play', () => { window.cachedTestAudio = audio; }); return audio; }; });
  await page.route('**/api/story?*', route => { const url = new URL(route.request().url()).searchParams.get('url'); return route.fulfill({ json: { html: url.includes('chuong-') ? '<h1>Chương 1</h1><div id="chapter-content"><p>Nghe offline.</p></div>' : bookHtml, sourceUrl: url } }); });
  await page.route('**/api/tts', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { voices: [voice] } });
    posts++; return unavailable ? route.fulfill({ status: 503, json: { error: 'Offline' } }) : route.fulfill({ body: wav(), contentType: 'audio/wav' });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Đọc', exact: true }).click(); await page.getByLabel('Tùy chọn giọng đọc').click(); await page.getByLabel('Nguồn TTS').selectOption('edge');
  await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue(voice.id); await page.getByLabel('Tùy chọn giọng đọc').click();
  await openLibrary(page); await page.getByRole('tab', { name: 'Nguồn truyện' }).click(); await page.getByLabel('Liên kết trang truyện').fill(bookUrl); await page.getByRole('button', { name: 'Thêm truyện vào thư viện' }).click();
  await page.locator('.download-panel summary').click(); await page.getByLabel('Tải đến chương').fill('1'); await page.getByLabel('Kèm âm thanh theo giọng đang chọn').check(); await page.getByRole('button', { name: 'Tải khoảng chương' }).click();
  await expect.poll(() => posts).toBe(2); await expect(page.locator('.library-task')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chương 1: Bắt đầu Đã tải' }).click();
  await page.reload(); unavailable = true;
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nghe offline.');
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.cachedTestAudio?.currentTime || 0)).toBeGreaterThan(0.1); expect(posts).toBe(2);
});

test('opening the last chapter restores the translated version while migrating legacy data', async ({ page }) => {
  await page.addInitScript(() => {
    const id = 'manual:legacy-translated';
    localStorage.setItem('reader_translated_cache', JSON.stringify([{ url: id, title: 'Chương đã dịch', content: 'Chương gốc\nNội dung gốc.', translatedContent: 'Chương đã dịch\nNội dung bản dịch đã lưu.', timestamp: 1, nextUrl: null, prevUrl: null, webName: 'Văn bản' }]));
    localStorage.setItem('reader_last_chapter', id); localStorage.setItem('reader_last_version', 'translated');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bản dịch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toContainText('Nội dung bản dịch đã lưu.');
});

test('large catalogs keep a bounded page of chapters and search can reach the final chapter', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route('**/api/story?*', route => {
    const url = new URL(route.request().url()).searchParams.get('url');
    const html = url.includes('chuong-') ? '<h1>Chương 150</h1><div id="chapter-content"><p>Chương cuối cùng.</p></div>' : `<h1 id="book-detail-title">Mục lục lớn</h1><ol id="chapterList">${Array.from({ length: 150 }, (_, index) => `<a href="${bookUrl}chuong-${index + 1}/"><span class="chapter-item__index">${index + 1}</span><span class="chapter-item__title">Mục ${index + 1}</span></a>`).join('')}</ol>`;
    return route.fulfill({ json: { html, sourceUrl: url } });
  });
  await page.goto('/'); await openLibrary(page); await page.getByRole('tab', { name: 'Nguồn truyện' }).click();
  await page.getByLabel('Liên kết trang truyện').fill(bookUrl); await page.getByRole('button', { name: 'Thêm truyện vào thư viện' }).click();
  await expect(page.locator('.chapter-catalog li')).toHaveCount(100);
  await page.getByRole('button', { name: '100 chương tiếp' }).click(); await expect(page.locator('.chapter-catalog li')).toHaveCount(50);
  await page.getByLabel('Tìm chương trong mục lục').fill('Mục 150'); await expect(page.locator('.chapter-catalog li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Chương 150: Mục 150 Trực tuyến' }).click();
  await expect(page.getByRole('article')).toContainText('Chương cuối cùng.');
});

test('expanded player fits a small phone and seeks audio while keeping pause and resume consistent', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => { const NativeAudio = window.Audio; window.Audio = function () { const audio = new NativeAudio(); audio.addEventListener('play', () => { window.expandedTestAudio = audio; }); return audio; }; });
  await page.route('**/api/tts', route => route.fulfill(route.request().method() === 'GET' ? { json: { voices: [voice] } } : { body: wav(), contentType: 'audio/wav' }));
  await page.goto('/'); await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương trình nghe\nĐoạn tiếp theo.'); await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Tùy chọn giọng đọc').click(); await page.getByLabel('Nguồn TTS').selectOption('edge'); await expect(page.getByLabel('Giọng đọc', { exact: true })).toHaveValue(voice.id); await page.getByLabel('Tùy chọn giọng đọc').click();
  await page.getByRole('button', { name: 'Nghe truyện', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.expandedTestAudio?.currentTime || 0)).toBeGreaterThan(0.1);
  await page.getByLabel('Tùy chọn giọng đọc').click(); await page.getByRole('button', { name: 'Mở trình nghe', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Trình nghe', exact: true }); await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320); expect(box.y + box.height).toBeLessThanOrEqual(640);
  await dialog.getByRole('button', { name: 'Tạm dừng', exact: true }).click(); expect(await page.evaluate(() => window.expandedTestAudio.paused)).toBe(true);
  const slider = dialog.getByRole('slider', { name: 'Tua âm thanh' }); await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
  expect(await page.evaluate(() => window.expandedTestAudio.currentTime)).toBeCloseTo(0.1, 1);
  await dialog.getByRole('button', { name: 'Tiếp tục nghe', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.expandedTestAudio.currentTime)).toBeGreaterThan(0.2);
  await dialog.getByRole('button', { name: 'Đóng Trình nghe' }).click(); await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thêm chương', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Đang nghe' })).toBeVisible(); await page.getByRole('button', { name: 'Tạm dừng phiên nghe' }).click(); expect(await page.evaluate(() => window.expandedTestAudio.paused)).toBe(true);
});
