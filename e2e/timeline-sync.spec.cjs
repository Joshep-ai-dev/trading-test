const { test, expect } = require('@playwright/test');

const stamp = timestamp => new Date(timestamp + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19);

test('chart dragging selects the same actual replay position as the timeline', async ({ page }) => {
  const start = Date.parse('2026-08-01T00:00:00Z');
  await page.route('**/api/local-data', route => route.fulfill({ json: { mode: 'hosted', dates: ['2026-08-01'], latestCandle: null } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { mode: 'hosted', running: false, latestCandle: null } }));
  await page.route('**/api/candles?*', route => route.fulfill({ json: { candles: Array.from({ length: 600 }, (_, i) => ({ timestamp: start + i * 60000, open: 50, high: 51, low: 49, close: 50, volume: 1 })) } }));
  await page.goto('/'); await expect(page.locator('#playBtn')).toBeEnabled();
  const scrubber = page.locator('#scrubber');
  await scrubber.fill('250');
  const chart = page.locator('#chart'), box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * .3, box.y + 100);
  await page.mouse.move(box.x + box.width * .65, box.y + 100);
  await expect(scrubber).toHaveValue('250');
  await expect(page.locator('#timeLabel')).toHaveText(stamp(start + 250 * 60000));

  // The thumb previews during a drag, then release commits that exact candle.
  await page.mouse.move(box.x + box.width * .4, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + 100, { steps: 8 });
  const backward = Number(await scrubber.inputValue());
  expect(backward).toBeLessThan(250);
  await expect(scrubber).toHaveAttribute('data-replay-index', '250');
  await page.mouse.up();
  await expect(scrubber).toHaveAttribute('data-replay-index', String(backward));
  await expect(scrubber).toHaveValue(String(backward));
  await expect(page.locator('#timeLabel')).toHaveText(stamp(start + backward * 60000));

  await page.mouse.move(box.x + box.width * .7, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .15, box.y + 100, { steps: 12 });
  const forward = Number(await scrubber.inputValue());
  expect(forward).toBeGreaterThan(backward);
  await page.mouse.up();
  await expect(scrubber).toHaveAttribute('data-replay-index', String(forward));
  await expect(page.locator('#timeLabel')).toHaveText(stamp(start + forward * 60000));
  await expect(scrubber).toHaveAttribute('max', '599');

  // Both Step and Play must continue from the chart-selected candle.
  await page.locator('#stepBtn').click();
  await expect(scrubber).toHaveAttribute('data-replay-index', String(forward + 1));
  await page.locator('#playBtn').click();
  await expect.poll(async () => Number(await scrubber.getAttribute('data-replay-index'))).toBeGreaterThan(forward + 1);
  await page.locator('#playBtn').click();
  const resumed = Number(await scrubber.getAttribute('data-replay-index'));
  await page.mouse.move(box.x + box.width * .25, box.y + 100);
  await page.mouse.move(box.x + box.width * .65, box.y + 100);
  await expect(scrubber).toHaveAttribute('data-replay-index', String(resumed));
  await expect(scrubber).toHaveValue(String(resumed));

  // Aggregated bars select their last observed minute rather than their open.
  await page.getByRole('button', { name: '3m', exact: true }).click();
  await page.mouse.move(box.x + box.width * .7, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, box.y + 100, { steps: 8 });
  const aggregated = Number(await scrubber.inputValue());
  await page.mouse.up();
  await expect(scrubber).toHaveAttribute('data-replay-index', String(aggregated));
  await expect(page.locator('#timeLabel')).toHaveText(stamp(start + aggregated * 60000));
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem('argent-trading-journal-v1')));
  expect(journal.timestamp).toBe(start + aggregated * 60000);

  // Dragging honors the same open-position seek guard as the progress bar.
  await page.locator('#longBtn').click();
  const balance = await page.locator('#balance').textContent();
  await page.mouse.move(box.x + box.width * .4, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .65, box.y + 100, { steps: 8 }); await page.mouse.up();
  await expect(scrubber).toBeDisabled();
  await expect(scrubber).toHaveValue(String(aggregated));
  await expect(page.locator('#positionStatus')).toContainText('1 active');
  await expect(page.locator('#balance')).toHaveText(balance);
  await expect(page.locator('#timeLabel')).toHaveText(stamp(start + aggregated * 60000));
  await expect(page.locator('#dataStatus')).toContainText('Close open positions');
});
