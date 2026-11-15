const { test, expect } = require('@playwright/test');

test('Auto fits visible highs and lows while panning, but hover never changes the scale', async ({ page }) => {
  await page.addInitScript(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.id === 'chart') window.axisTicks = [];
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (label, x, y, ...rest) {
      if (this.canvas.id === 'chart' && this.fillStyle === '#b2b5be' && x >= this.canvas.clientWidth - 78) window.axisTicks.push([label, y]);
      return text.call(this, label, x, y, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#dataStatus')).toContainText('older local candles');
  await page.locator('#priceZoomReset').click();
  const chart = page.locator('#chart'), box = await chart.boundingBox();
  const ticks = () => page.evaluate(() => window.axisTicks);
  const initial = await ticks();
  expect(initial.length).toBeGreaterThan(1);
  for (const fraction of [.2, .5, .8]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + 100);
    expect(await ticks()).toEqual(initial);
  }
  await page.keyboard.down('Shift'); await page.mouse.wheel(0, 500); await page.keyboard.up('Shift');
  await expect(page.locator('#goLive')).toBeVisible();
  await expect.poll(ticks).not.toEqual(initial);
  const panned = await ticks();
  await page.mouse.move(box.x + box.width * .4, box.y + 140);
  expect(await ticks()).toEqual(panned);
  await expect(page.locator('#priceZoomReset')).toHaveAttribute('aria-pressed', 'true');
  // A slightly diagonal drag must keep Auto enabled rather than locking prices.
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + 155, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#priceZoomReset')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(ticks).not.toEqual(panned);
  const dragged = await ticks();
  await page.locator('#priceZoomReset').click();
  expect(await ticks()).toEqual(dragged);
  const refitted = await ticks();
  await page.mouse.move(box.x + box.width * .6, box.y + 140);
  expect(await ticks()).toEqual(refitted);

  // A deliberate price-axis drag still changes the scale and remains stable.
  await page.mouse.move(box.x + box.width - 30, box.y + 100);
  await page.mouse.down(); await page.mouse.move(box.x + box.width - 30, box.y + 165, { steps: 5 }); await page.mouse.up();
  await expect.poll(ticks).not.toEqual(refitted);
  await expect(page.locator('#priceZoomReset')).toHaveAttribute('aria-pressed', 'false');
  const manual = await ticks();
  await page.mouse.move(box.x + box.width * .3, box.y + 100);
  expect(await ticks()).toEqual(manual);
  await page.keyboard.down('Shift'); await page.mouse.wheel(0, -300); await page.keyboard.up('Shift');
  expect(await ticks()).toEqual(manual);
  await page.locator('#priceZoomReset').click();
  await expect(page.locator('#priceZoomReset')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(ticks).not.toEqual(manual);
});
