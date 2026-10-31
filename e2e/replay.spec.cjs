const { test, expect } = require('@playwright/test');

test('React loads only local candles; hover and pan reveal historical data without seeking', async ({ page }) => {
  const errors = [], remote = [], candleRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://localhost:4180') && !request.url().startsWith('ws://localhost:4180')) remote.push(request.url());
    if (request.url().includes('/api/candles?')) candleRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#dataStatus')).toContainText('local');
  const canvas = page.locator('#chart'), box = await canvas.boundingBox();
  const replayTime = await page.locator('#timeLabel').textContent();
  await page.mouse.move(box.x + box.width * .7, box.y + 70);
  const firstQuote = await page.locator('.chart-legend').textContent();
  await page.mouse.move(box.x + box.width * .8, box.y + 70);
  await expect(page.locator('.chart-legend')).not.toHaveText(firstQuote);
  const before = candleRequests.length;
  await page.mouse.move(box.x + box.width * .5, box.y + 100);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100000);
  await page.keyboard.up('Shift');
  await expect.poll(() => candleRequests.length).toBeGreaterThan(before);
  await expect(page.locator('#dataStatus')).toContainText('older local candles');
  await expect(page.locator('#timeLabel')).toHaveText(replayTime);
  await page.screenshot({ path: 'test-results/react-chart-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('React order ticket, playback, seek guard, timeframe and drawing actions work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.locator('#longBtn').click();
  await expect(page.locator('#positionStatus')).toContainText('1 active');
  await expect(page.locator('#scrubber')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('argent-trading-journal-v1')).fills.length)).toBe(1);
  const savedTime = await page.locator('#timeLabel').textContent();
  await page.reload();
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#positionStatus')).toContainText('1 active');
  await expect(page.locator('#timeLabel')).toHaveText(savedTime);
  await page.locator('#playBtn').click();
  const time = await page.locator('#timeLabel').textContent();
  await expect(page.locator('#timeLabel')).not.toHaveText(time);
  await page.locator('#playBtn').click();
  await page.locator('#closeBtn').click();
  await expect(page.locator('#positionStatus')).toHaveText('No active trades');
  await expect(page.locator('#scrubber')).toBeEnabled();
  await page.getByRole('tab', { name: /Closed P&L/ }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('.timeframe-tabs').getByRole('button', { name: '5m', exact: true }).click();
  await expect(page.locator('.chart-legend')).toContainText('5m');
  await page.locator('#indicatorBtn').click();
  await expect(page.locator('#indicatorBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Horizontal line', exact: true }).click();
  await page.locator('#chart').click({ position: { x: 300, y: 180 } });
  await page.locator('#shortBtn').click();
  await expect(page.locator('#positionStatus')).toContainText('1 active');
  await page.locator('#closeBtn').click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('tab', { name: /Trade history/ }).click();
  await expect(page.locator('.fill-row')).toHaveCount(4);
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  expect((await exported).suggestedFilename()).toBe('argent-trade-history.csv');
  await page.getByRole('tab', { name: 'Performance', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Cumulative realized profit and loss' })).toBeVisible();
  await page.locator('#longBtn').click();
  await page.getByRole('tab', { name: /Positions/ }).click();
  await page.screenshot({ path: 'test-results/exchange-active-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#positionStatus')).toContainText('1 active');
  await page.getByRole('tab', { name: /Trade history/ }).click();
  await expect(page.locator('.fill-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('responsive React chart remains usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(page.locator('#chart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/react-chart-mobile.png', fullPage: true });
});

test('Sync now refreshes metadata without changing the replay cursor or open trades', async ({ page }) => {
  let requested = 0;
  const latest = new Date(Date.now() + 120000).toISOString();
  await page.route('**/api/sync', async route => {
    const post = route.request().method() === 'POST';
    if (post) requested++;
    await route.fulfill({ json: { running: false, completedDays: 276, totalDays: 276, lastSync: latest, latestCandle: post ? latest : null, error: null } });
  });
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.locator('#longBtn').click();
  const timestamp = await page.locator('#timeLabel').textContent();
  const balance = await page.locator('#balance').textContent();
  await page.locator('.sync-status-card').getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => requested).toBe(1);
  await expect(page.locator('.sync-status-card b')).toContainText(latest.slice(0, 16).replace('T', ' '));
  await expect(page.locator('#timeLabel')).toHaveText(timestamp);
  await expect(page.locator('#balance')).toHaveText(balance);
  await expect(page.locator('#positionStatus')).toContainText('1 active');
});

test('position TP/SL and trailing stop can be edited, restored, and disabled', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Trailing SL', exact: true }).check();
  await page.locator('#trailing').fill('2');
  await page.locator('#longBtn').click();
  await page.getByRole('button', { name: 'Edit protection for position 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'TP/SL', exact: true }).check();
  await page.locator('#editTp').fill('3');
  await page.locator('#editSl').fill('2');
  await page.locator('#editTrailing').fill('1');
  await page.getByRole('button', { name: 'Save protection', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: /TP \/ SL/ }).click();
  await expect(page.locator('.ledger-content tbody tr')).toHaveCount(3);
  await expect(page.locator('.ledger-content')).toContainText('Trailing stop');
  await page.reload();
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.getByRole('button', { name: 'Edit protection for position 1', exact: true }).click();
  await expect(page.locator('#editTrailing')).toHaveValue('1');
  await page.getByRole('dialog').getByRole('checkbox', { name: 'TP/SL', exact: true }).uncheck();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Trailing SL', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save protection', exact: true }).click();
  await page.getByRole('tab', { name: /TP \/ SL/ }).click();
  await expect(page.locator('.ledger-content')).toContainText('No trigger orders');
});

test('indicator library adds studies and each study has its own settings', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  const resize = page.getByRole('separator', { name: 'Resize chart height', exact: true });
  await resize.focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Open indicator library', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Indicator library', exact: true });
  await expect(library.getByRole('spinbutton')).toHaveCount(0);
  await library.getByRole('textbox', { name: 'Search indicators' }).fill('average true range');
  await expect(library.locator('.library-study')).toHaveCount(1);
  await library.getByRole('button', { name: 'Add ATR to chart', exact: true }).click();
  await library.getByRole('textbox', { name: 'Search indicators' }).fill('');
  for (const name of ['ADX', 'Supertrend', 'Bollinger Bands']) await library.getByRole('button', { name: `Add ${name} to chart`, exact: true }).click();
  await page.screenshot({ path: 'test-results/indicator-library.png', fullPage: true });
  await library.getByRole('button', { name: 'Configure RSI', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'RSI settings', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('spinbutton')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/rsi-individual-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const settings = [
    ['RSI', [['RSI Length', '9']]],
    ['MACD', [['MACD Fast length', '8'], ['MACD Slow length', '21'], ['MACD Signal length', '5']]],
    ['ATR', [['ATR Length', '21']]],
    ['ADX', [['ADX DI length', '10'], ['ADX ADX smoothing', '10']]],
    ['Supertrend', [['Supertrend ATR length', '7'], ['Supertrend Factor', '2.5']]],
    ['Bollinger Bands', [['Bollinger Bands Length', '30'], ['Bollinger Bands Standard deviations', '2.5']]],
  ];
  for (const [name, fields] of settings) {
    await page.getByRole('button', { name: `${name} settings`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${name} settings`, exact: true });
    for (const [field, value] of fields) await dialog.getByRole('spinbutton', { name: field, exact: true }).fill(value);
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  }
  for (const name of ['RSI', 'MACD', 'ATR', 'ADX']) await expect(page.getByRole('separator', { name: `Resize ${name} height`, exact: true })).toBeVisible();
  const atr = page.getByRole('separator', { name: 'Resize ATR height', exact: true });
  const before = Number(await atr.getAttribute('aria-valuenow'));
  await atr.focus(); await page.keyboard.press('ArrowUp');
  await expect(atr).toHaveAttribute('aria-valuenow', String(before + 10));
  await page.reload();
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect(atr).toHaveAttribute('aria-valuenow', String(before + 10));
  await page.getByRole('button', { name: 'ATR settings', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'ATR Length', exact: true })).toHaveValue('21');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'MACD settings', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'MACD Fast length', exact: true }).fill('50');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Fast length');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(errors).toEqual([]);
});

test('indicator windows support per-study settings, style, ordering, maximize, hide and remove', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeEnabled();
  await page.getByRole('button', { name: 'RSI settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'RSI settings', exact: true });
  await dialog.getByRole('spinbutton', { name: 'RSI Length', exact: true }).fill('21');
  const box = await dialog.boundingBox();
  await page.mouse.move(box.x + 100, box.y + 25);
  await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + 45, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Math.round((await dialog.boundingBox()).x - box.x)).toBe(40);
  await dialog.getByRole('tab', { name: 'Style', exact: true }).click();
  await dialog.getByLabel('Line color', { exact: true }).fill('#ff7700');
  await dialog.getByLabel('Line thickness', { exact: true }).selectOption('3');
  await dialog.getByRole('checkbox', { name: 'Values in indicator header', exact: true }).uncheck();
  await dialog.getByRole('tab', { name: 'Visibility', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Show indicator', exact: true }).uncheck();
  await page.screenshot({ path: 'test-results/indicator-settings-window.png', fullPage: true });
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show RSI', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Show RSI', exact: true }).click();
  await page.getByRole('button', { name: 'Move RSI down', exact: true }).click();
  await expect.poll(() => page.locator('.study-pane-name strong').allTextContents()).toEqual(['MACD', 'RSI']);
  await page.getByRole('button', { name: 'Maximize RSI', exact: true }).click();
  await expect(page.locator('.study-pane-header')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Restore RSI', exact: true })).toHaveCount(1);
  const canvas = await page.locator('#chart').boundingBox();
  await page.mouse.move(canvas.x + 200, canvas.y + 120); await page.mouse.wheel(0, -50);
  await page.screenshot({ path: 'test-results/indicator-maximized.png', fullPage: true });
  await page.getByRole('button', { name: 'Restore RSI', exact: true }).click();
  await expect(page.locator('.study-pane-header')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove RSI', exact: true }).click();
  await expect(page.locator('.study-pane-header')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open indicator library', exact: true }).click();
  await page.getByRole('button', { name: 'Add RSI to chart', exact: true }).click();
  await page.getByRole('button', { name: 'Close indicator library', exact: true }).click();
  await page.reload();
  await expect(page.locator('#playBtn')).toBeEnabled();
  await expect.poll(() => page.locator('.study-pane-name strong').allTextContents()).toEqual(['MACD', 'RSI']);
  await page.getByRole('button', { name: 'RSI settings', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'RSI Length', exact: true }).fill('21');
  await dialog.getByRole('tab', { name: 'Style', exact: true }).click();
  await expect(dialog.getByLabel('Line color', { exact: true })).toHaveValue('#ff7700');
  await expect(dialog.getByLabel('Line thickness', { exact: true })).toHaveValue('3');
  await expect(dialog.getByRole('checkbox', { name: 'Values in indicator header', exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
});
