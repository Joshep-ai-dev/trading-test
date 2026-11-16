const { test, expect } = require('@playwright/test');
const manifest = require('../public/candle-archive/manifest.json');

test('hosted startup loads the full packaged archive without historical candle API calls', async ({ page }) => {
  const days = Object.keys(manifest.days), packs = [], apiCalls = [];
  await page.route('**/api/local-data', route => route.fulfill({ json: { mode: 'hosted', dates: days, latestCandle: null, archiveManifest: '/candle-archive/manifest.json' } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { mode: 'hosted', running: false, latestCandle: null } }));
  await page.route('**/api/candles?*', route => { apiCalls.push(route.request().url()); return route.fulfill({ status: 500, json: { error: 'Packaged history must not call the exchange API' } }); });
  page.on('response', response => {
    if (response.url().includes('/candle-archive/') && response.url().endsWith('.json.gz')) packs.push(response);
  });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#scrubber')).toHaveAttribute('max', String(manifest.candles - 1));
  expect(apiCalls).toEqual([]);
  expect(packs.length).toBe(new Set(Object.values(manifest.days)).size);
  for (const response of packs) {
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-encoding']).toBe('gzip');
    expect(response.headers()['cache-control']).toContain('immutable');
  }
});
