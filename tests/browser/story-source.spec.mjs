import { test, expect } from '@playwright/test';

test('local story API is available and rejects invalid or private destinations', async ({ request }) => {
  expect((await request.get('/api/story')).status()).toBe(400);
  const response = await request.get('/api/story?url=http%3A%2F%2F127.0.0.1%2F');
  expect(response.status()).toBe(400);
  expect((await response.json()).code).toBe('INVALID_URL');
});

test('URL reader uses the app API and follows extracted chapter navigation', async ({ page }) => {
  const calls = [];
  await page.route('**/api/story?*', async route => {
    const sourceUrl = new URL(route.request().url()).searchParams.get('url');
    calls.push(sourceUrl);
    const second = sourceUrl.endsWith('/chuong-2/');
    // Synthetic markup to verify the transport and common WordPress container.
    await route.fulfill({ json: { sourceUrl, html: `<h1 class="entry-title">Chương ${second ? 2 : 1}: Thử nghiệm</h1><div class="entry-content"><p>Nội dung bản gốc chương ${second ? 2 : 1}.</p><p>Đoạn để nghe.</p><div class="advertisement">Quảng cáo</div></div>${second ? '' : '<a id="next_chap" href="../chuong-2/">Chương sau</a>'}` } });
  });
  await page.goto('/');
  await page.getByLabel('Liên kết chương truyện', { exact: true }).fill('https://webnovel.vn/tien-nghich/chuong-1/');
  await page.getByRole('button', { name: 'Lấy nội dung truyện', exact: true }).click();
  const article = page.getByRole('article', { name: 'Nội dung bản gốc' });
  await expect(article).toContainText('Nội dung bản gốc chương 1.');
  await expect(article).not.toContainText('Quảng cáo');
  await expect(page.getByRole('button', { name: 'Nghe truyện', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Chương sau', exact: true }).click();
  await expect(article).toContainText('Nội dung bản gốc chương 2.');
  expect(calls).toEqual(['https://webnovel.vn/tien-nghich/chuong-1/', 'https://webnovel.vn/tien-nghich/chuong-2/']);
});
