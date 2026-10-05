import { test, expect } from '@playwright/test';

const sample = 'Chương 1: Một buổi sáng yên tĩnh\n\n' + 'Nắng trải trên con đường nhỏ. Người lữ khách dừng chân dưới mái hiên, mở cuốn sách và đọc thêm một chương.\n\n'.repeat(20);
async function readManual(page, content = sample) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dán văn bản', exact: true }).click();
  await page.getByLabel('Nội dung truyện', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Đọc / nghe bản gốc', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toBeVisible();
}
async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, page: document.documentElement.scrollWidth, app: document.querySelector('.app-shell').getBoundingClientRect().width }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.app).toBeLessThanOrEqual(dimensions.width + 1);
  for (const region of await page.locator('.dialog-body').all()) {
    const width = await region.evaluate(element => ({ content: element.scrollWidth, visible: element.clientWidth }));
    expect(width.content).toBeLessThanOrEqual(width.visible + 1);
  }
}
async function expectInViewport(locator, page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
const sizes = [
  [320, 640], [360, 800], [390, 844], [600, 960], [768, 1024],
  [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [844, 390],
];
for (const [width, height] of sizes) {
  test(`source, reader, player and dialogs fit ${width}×${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Thêm một chương.' })).toBeVisible();
    await expectNoOverflow(page);
    await expectInViewport(page.getByRole('button', { name: 'Lấy nội dung truyện', exact: true }), page);
    await readManual(page);
    const player = page.getByRole('region', { name: 'Điều khiển giọng đọc' });
    // A section with an accessible name is a region.
    await expectInViewport(player, page);
    await expectInViewport(page.getByRole('button', { name: 'Nghe truyện', exact: true }), page);
    const layout = await page.evaluate(() => ({
      left: getComputedStyle(document.querySelector('.source-panel')).display,
      navigation: getComputedStyle(document.querySelector('.mobile-navigation')).display,
      readable: document.querySelector('.reading-scroll').clientHeight,
      player: document.querySelector('.speech-player').getBoundingClientRect().top,
      document: document.querySelector('.reading-scroll').getBoundingClientRect().bottom,
    }));
    expect(layout.readable).toBeGreaterThan(80);
    expect(layout.document).toBeLessThanOrEqual(layout.player + 1);
    if (width < 1100) { expect(layout.left).toBe('none'); expect(layout.navigation).not.toBe('none'); }
    else { expect(layout.left).not.toBe('none'); expect(layout.navigation).toBe('none'); }
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await expectInViewport(page.locator('.speech-options-panel'), page);
    await expect(page.getByLabel('Giọng đọc', { exact: true })).toBeVisible();
    await page.getByLabel('Tùy chọn giọng đọc', { exact: true }).click();
    await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Giao diện đọc' });
    await expectInViewport(dialog, page);
    await dialog.getByRole('button', { name: 'Tối', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('Cỡ chữ đọc', { exact: true }).fill('32');
    await page.getByRole('button', { name: 'Đóng Giao diện đọc', exact: true }).click();
    await expectNoOverflow(page);
    await page.screenshot({ path: info.outputPath(`reader-${width}.png`) });
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
    await expectInViewport(page.getByRole('dialog', { name: 'Thư viện chương' }), page);
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Đóng Thư viện chương', exact: true }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await expectInViewport(page.getByRole('dialog', { name: 'Cài đặt đọc và nghe' }), page);
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Dịch hàng loạt', exact: true }).click();
    await expectInViewport(page.getByRole('dialog', { name: 'Dịch hàng loạt' }), page);
    await expectNoOverflow(page);
  });
}

test('rotating a phone keeps the chapter and usable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readManual(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toBeVisible();
  await expectInViewport(page.getByRole('button', { name: 'Nghe truyện', exact: true }), page);
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('article', { name: 'Nội dung bản gốc' })).toContainText('Người lữ khách');
});

test('mobile keyboard viewport resizes source and dialog without covering input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    viewport.height = 844; viewport.scale = 1;
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    window.mockViewport = viewport;
  });
  await page.goto('/');
  await page.getByLabel('Liên kết chương truyện', { exact: true }).focus();
  await page.evaluate(() => { window.mockViewport.height = 420; window.mockViewport.dispatchEvent(new Event('resize')); });
  await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'open');
  await expect(page.locator('.mobile-navigation')).toBeHidden();
  expect(await page.locator('.app-shell').evaluate(element => element.getBoundingClientRect().height)).toBe(420);
  await expectInViewport(page.getByRole('button', { name: 'Lấy nội dung truyện', exact: true }), page);
  await page.evaluate(() => { window.mockViewport.height = 844; window.mockViewport.dispatchEvent(new Event('resize')); });
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('button', { name: 'Thư viện', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tìm trong thư viện' }).focus();
  await page.evaluate(() => { window.mockViewport.height = 420; window.mockViewport.dispatchEvent(new Event('resize')); });
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(420);
  await expect(page.getByRole('textbox', { name: 'Tìm trong thư viện' })).toBeVisible();
});

test('large text and very long strings do not cause horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await readManual(page, `Chương 1: ${'TênRấtDài'.repeat(40)}\n\n${'NộiDungRấtDài'.repeat(80)}\n\n${sample}`);
  await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
  await page.getByLabel('Cỡ chữ đọc', { exact: true }).fill('32');
  await page.getByRole('button', { name: 'Đóng Giao diện đọc', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectNoOverflow(page);
  await expectInViewport(page.getByRole('button', { name: 'Nghe truyện', exact: true }), page);
});
