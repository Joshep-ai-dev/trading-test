const { test, expect } = require('@playwright/test');

test('timeline spans the full archive to the latest candle without extending during replay', async ({ page }) => {
  const requests = [];
  const dates = Array.from({ length: 12 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
  const latest = () => Date.parse(`${dates.at(-1)}T23:59:00Z`);
  await page.addInitScript(() => localStorage.setItem('argent-replay-date', '2026-08-01'));
  await page.route('**/api/local-data', route => route.fulfill({ json: { mode: 'hosted', dates, latestCandle: new Date(latest()).toISOString() } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { mode: 'hosted', running: false, latestCandle: new Date(latest()).toISOString(), lastSync: null } }));
  await page.route('**/api/candles?*', route => {
    const day = new URL(route.request().url()).searchParams.get('date'); requests.push(day);
    const start = Date.parse(`${day}T00:00:00Z`);
    return route.fulfill({ json: { candles: Array.from({ length: 1440 }, (_, i) => ({ timestamp: start + i * 60000, open: 50, high: 51, low: 49, close: 50, volume: 1 })) } });
  });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  const scrubber = page.locator('#scrubber');
  await expect(scrubber).toHaveAttribute('max', String(12 * 1440 - 1));
  await expect(page.locator('#timelineEnd')).toHaveAttribute('data-timestamp', String(latest()));
  expect(new Set(requests).size).toBe(12);
  const downloaded = requests.length;
  await page.locator('#playBtn').click();
  await expect.poll(() => scrubber.inputValue()).not.toBe('89');
  await page.locator('#playBtn').click();
  await expect(scrubber).toHaveAttribute('max', String(12 * 1440 - 1));
  expect(requests.length).toBe(downloaded);
  await scrubber.fill(String(12 * 1440 - 1));
  await expect(page.locator('#timeLabel')).toHaveText('2026-08-13 08:59:00');
  await page.locator('#playBtn').click();
  await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Play');
  expect(requests.length).toBe(downloaded);

  await page.locator('#replayDate').fill('2026-08-03');
  await expect(scrubber).toHaveValue(String(2 * 1440 + 89));
  await expect(scrubber).toHaveAttribute('max', String(12 * 1440 - 1));
  expect(requests.length).toBe(downloaded);

  // The endpoint advances only when genuinely new archive data arrives.
  const cursor = await scrubber.inputValue();
  dates.push('2026-08-13');
  await page.locator('.header-sync-button').click();
  await expect(scrubber).toHaveAttribute('max', String(13 * 1440 - 1));
  await expect(page.locator('#timelineEnd')).toHaveAttribute('data-timestamp', String(latest()));
  await expect(scrubber).toHaveValue(cursor);
});
