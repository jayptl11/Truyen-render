import { test, expect } from '@playwright/test';
test('production service worker restores the app and saved chapter after an offline reload', async ({ page, context }) => {
  test.skip(!process.env.PLAYWRIGHT_PREVIEW, 'Requires production service worker build');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration?.active; })).toBe(true);
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill('Chương offline\nNội dung giữ trong IndexedDB.');
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nội dung giữ trong IndexedDB.');
  await expect.poll(() => page.evaluate(async () => { const db = await new Promise((resolve, reject) => { const request = indexedDB.open('truyen-library'); request.onsuccess = () => resolve(request.result); request.onerror = reject; }); const count = await new Promise(resolve => { const request = db.transaction('chapters').objectStore('chapters').count(); request.onsuccess = () => resolve(request.result); }); db.close(); return count; })).toBe(1);
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Nội dung giữ trong IndexedDB.');
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
  await expect(page.getByRole('button', { name: /Chương offline .*1 chương đã tải/ })).toBeVisible();
});
