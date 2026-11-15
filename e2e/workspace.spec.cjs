const { test, expect } = require('@playwright/test');

const readDrawings = page => page.evaluate(() => JSON.parse(localStorage.getItem('argent-chart-drawings-v1') || '[]'));

test('workspace drawings edit, undo, lock, hide and persist across replay seeks and reloads', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.locator('#indicatorBtn').click();
  const chart = page.locator('#chart');
  await page.getByRole('button', { name: 'Horizontal line', exact: true }).click();
  await chart.click({ position: { x: 250, y: 180 } });
  await expect.poll(async () => (await readDrawings(page)).length).toBe(1);
  const original = (await readDrawings(page))[0];
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + 250, box.y + 180);
  await page.mouse.down(); await page.mouse.move(box.x + 280, box.y + 210, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await readDrawings(page))[0].a.price).not.toBe(original.a.price);
  await chart.focus(); await page.keyboard.press('Control+z');
  await expect.poll(async () => (await readDrawings(page))[0].a.price).toBe(original.a.price);
  await page.getByRole('button', { name: 'Redo drawing', exact: true }).click();
  await expect.poll(async () => (await readDrawings(page))[0].a.price).not.toBe(original.a.price);

  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await chart.click({ position: { x: 350, y: 120 } }); await chart.click({ position: { x: 440, y: 230 } });
  await page.getByRole('button', { name: 'Fibonacci retracement', exact: true }).click();
  await chart.click({ position: { x: 500, y: 140 } }); await chart.click({ position: { x: 620, y: 250 } });
  await expect.poll(async () => (await readDrawings(page)).length).toBe(3);
  await page.getByRole('button', { name: 'Drawing objects', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Drawing object manager' })).toContainText('Fibonacci retracement');
  await page.getByRole('button', { name: 'Select drawing 1', exact: true }).click();
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await expect.poll(async () => (await readDrawings(page))[0].color).toBe('#ff0000');
  await page.getByRole('button', { name: 'Lock drawings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete drawing 1', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Hide drawings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide drawings', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close chart panel' }).click();
  const drawings = await readDrawings(page);
  await page.locator('#scrubber').fill('95');
  expect(await readDrawings(page)).toEqual(drawings);
  await page.reload(); await expect(page.locator('#playBtn')).toBeEnabled();
  expect(await readDrawings(page)).toEqual(drawings);
  await expect(page.getByRole('button', { name: 'Lock drawings', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('chart types, scales, timezone, fullscreen, context menu and replay shortcuts work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#playBtn')).toBeEnabled();
  for (const type of ['line', 'area', 'bars', 'hollow', 'heikin', 'candles']) await page.getByLabel('Chart type', { exact: true }).selectOption(type);
  await page.getByLabel('Chart type', { exact: true }).selectOption('heikin');
  await page.getByRole('button', { name: '3m', exact: true }).click();
  await page.getByRole('button', { name: 'Chart display settings', exact: true }).click();
  await page.getByLabel('Price scale', { exact: true }).selectOption('log');
  await page.getByLabel('Chart time zone', { exact: true }).selectOption('UTC');
  await page.getByLabel('Volume', { exact: true }).uncheck();
  await page.getByLabel('Grid lines', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close chart panel' }).click();
  const time = await page.locator('#timeLabel').textContent();
  await page.locator('#stepBtn').click(); await expect(page.locator('#timeLabel')).not.toHaveText(time);
  const next = await page.locator('#timeLabel').textContent();
  await page.locator('#chart').focus(); await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('#timeLabel')).not.toHaveText(next);
  await page.keyboard.press('Alt+h');
  await expect(page.getByRole('button', { name: 'Horizontal line', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space'); await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('Space'); await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Play');
  await page.locator('#chart').click({ button: 'right', position: { x: 220, y: 100 } });
  await expect(page.getByRole('menu', { name: 'Chart actions' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Chart settings…' }).click();
  await expect(page.getByLabel('Price scale', { exact: true })).toHaveValue('log');
  await page.getByRole('button', { name: 'Close chart panel' }).click();
  await page.getByRole('button', { name: 'Fullscreen chart', exact: true }).click();
  await expect(page.locator('.chart-panel')).toHaveClass(/chart-expanded/);
  await page.screenshot({ path: 'test-results/workspace-fullscreen.png' });
  await page.keyboard.press('Escape'); await expect(page.locator('.chart-panel')).not.toHaveClass(/chart-expanded/);
  await page.reload(); await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.getByLabel('Chart type', { exact: true })).toHaveValue('heikin');
  await expect(page.getByRole('button', { name: '3m', exact: true })).toHaveClass('active');
  expect(errors).toEqual([]);
});

test('mobile workspace panels and drawing toolbar fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.locator('#playBtn')).toBeEnabled();
  await page.getByRole('button', { name: 'Chart display settings', exact: true }).click();
  await expect(page.getByLabel('Chart time zone', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close chart panel' }).click();
  await page.getByRole('button', { name: 'Fullscreen chart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen chart', exact: true })).toBeVisible();
  const chart = page.locator('#chart'), box = await chart.boundingBox();
  const before = Number(await chart.getAttribute('data-visible-bars'));
  const cdp = await page.context().newCDPSession(page);
  const points = spread => [
    { id: 1, x: box.x + box.width * (.5 - spread), y: box.y + 100 },
    { id: 2, x: box.x + box.width * (.5 + spread), y: box.y + 100 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(.1) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(.25) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Number(await chart.getAttribute('data-visible-bars'))).toBeLessThan(before);
  await cdp.detach();
});
