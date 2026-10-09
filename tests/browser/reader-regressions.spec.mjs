import { test, expect } from '@playwright/test';

async function manual(page, text = 'Chương 1\nMột đoạn mở đầu.\nĐây là đoạn đích để tìm kiếm.') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toBeVisible();
}

test('editing a saved manual chapter creates a new chapter that survives reload', async ({ page }) => {
  await manual(page, 'Chương 1\nNội dung đầu tiên.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương 2\nNội dung tiếp theo.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await page.reload();
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
  await page.getByRole('tab', { name: 'Chương đã lưu' }).click();
  await expect(page.locator('.saved-chapters li')).toHaveCount(2);
  await page.locator('.saved-chapters').getByRole('button', { name: /Chương 1/ }).click();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nội dung đầu tiên.');
});

test('deleted migrated chapters stay deleted after reload while the legacy backup remains', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('regression-seeded')) return;
    localStorage.setItem('regression-seeded', '1');
    localStorage.setItem('reader_translated_cache', JSON.stringify([{ url: 'manual:legacy', title: 'Chương cũ', content: 'Nội dung cũ', translatedContent: '', timestamp: 1, nextUrl: null, prevUrl: null, webName: 'Văn bản' }]));
  });
  await page.goto('/');
  const openLibrary = () => page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
  await openLibrary(); await page.getByRole('tab', { name: 'Chương đã lưu' }).click();
  await expect(page.locator('.saved-chapters li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa chương đã chọn', exact: true }).click();
  await expect(page.locator('.saved-chapters li')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('truyen-library', 1); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise(resolve => { const request = db.transaction('chapters').objectStore('chapters').count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  })).toBe(0);
  await page.reload(); await openLibrary(); await page.getByRole('tab', { name: 'Chương đã lưu' }).click();
  await expect(page.locator('.saved-chapters li')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reader_translated_cache')).length)).toBe(1);
});

test('find shortcut opens search and selecting a result reveals the highlighted paragraph', async ({ page }) => {
  await manual(page);
  await page.getByRole('button', { name: 'Nghe từ đoạn 1', exact: true }).press('Control+f');
  const dialog = page.getByRole('dialog', { name: 'Tìm trong chương' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('region', { name: 'Đọc tập trung', exact: true })).toHaveCount(0);
  await page.getByLabel('Từ khóa tìm kiếm').fill('đích');
  await dialog.getByRole('button', { name: 'Tìm', exact: true }).click();
  await dialog.getByRole('button', { name: /Đoạn 3/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.is-search-result')).toContainText('đoạn đích');
  await expect(page.locator('.is-search-result')).toBeInViewport();
  await page.getByLabel('Nội dung truyện', { exact: true }).press('Control+f');
  await expect(dialog).toHaveCount(0);
});

test('focus reader follows paragraph selection and preserves reading position when closing and reloading', async ({ page }) => {
  await manual(page, 'Chương 1\n' + Array.from({ length: 60 }, (_, index) => `Đoạn ${index + 1}. Một đoạn truyện dài để kiểm tra vị trí đọc được lưu.`).join('\n'));
  await page.getByLabel('Công cụ đọc', { exact: true }).click();
  await page.getByRole('button', { name: 'Đọc tập trung', exact: true }).click();
  const focus = page.getByRole('region', { name: 'Đọc tập trung', exact: true });
  await focus.getByRole('button', { name: 'Đoạn sau', exact: true }).click();
  await expect(focus.locator('.is-selected')).toContainText('Đoạn 1.');
  await page.getByLabel('Nội dung đọc tập trung', { exact: true }).press('Control+End');
  const progress = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('reader_progress') || '{}'))[0]?.paragraph || 0);
  await expect.poll(progress).toBeGreaterThan(40);
  const saved = await progress();
  await page.getByRole('button', { name: 'Thoát đọc tập trung', exact: true }).click();
  await expect(page.locator('#reader-panel .reading-paragraph').nth(saved)).toBeInViewport();
  await page.reload();
  await expect(page.locator('#reader-panel .reading-paragraph').nth(saved)).toBeInViewport();
});

test('adding a whole book is directly accessible from the start screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Thêm cả truyện / mục lục', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Nguồn truyện' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Liên kết trang truyện')).toBeVisible();
});
