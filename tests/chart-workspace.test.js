const test = require('node:test');
const assert = require('node:assert/strict');
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
};

test('drawing edits undo, redo, branch and survive reload without sharing mutable snapshots', async () => {
  const { createDrawingHistory } = await import('../src/chart-workspace.js');
  const storage = memoryStorage(), history = createDrawingHistory(storage);
  const drawing = { type: 'trend', a: { minute: 1, price: 50 }, b: { minute: 2, price: 60 } };
  history.change([drawing]); drawing.a.price = 999;
  assert.equal(history.items[0].a.price, 50);
  history.change([{ ...history.items[0], color: '#ff0000' }]);
  history.undo(); assert.equal(history.items[0].color, undefined);
  history.redo(); assert.equal(history.items[0].color, '#ff0000');
  history.undo(); history.change([]);
  assert.equal(history.canRedo, false);
  history.undo();
  assert.deepEqual(createDrawingHistory(storage).items, history.items);
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const fallback = createDrawingHistory(unavailable); fallback.change([history.items[0]]);
  assert.equal(fallback.items.length, 1);
});

test('Heikin Ashi is causal and leaves order prices untouched', async () => {
  const { heikinAshi } = await import('../src/chart-workspace.js');
  const bars = [{ open: 10, high: 16, low: 8, close: 14 }, { open: 15, high: 20, low: 14, close: 19 }];
  const original = structuredClone(bars), full = heikinAshi(bars);
  assert.deepEqual(bars, original);
  assert.equal(full[0].open, 12); assert.equal(full[0].close, 12);
  assert.equal(full[1].open, 12); assert.equal(full[1].low, 12); assert.equal(full[1].close, 17);
  assert.deepEqual(heikinAshi(bars.slice(0, 1)), full.slice(0, 1));
});

test('linear and logarithmic price coordinates round trip and handle negative linear ranges', async () => {
  const { priceScale } = await import('../src/chart-workspace.js');
  for (const mode of ['linear', 'log']) {
    const scale = priceScale(10, 100, 30, 400, mode);
    for (const value of [10, 20, 50, 100]) assert.ok(Math.abs(scale.priceAtY(scale.y(value)) - value) < 1e-9);
    assert.ok(Math.abs(scale.y(100) - 30) < 1e-9);
    assert.ok(Math.abs(scale.y(10) - 400) < 1e-9);
  }
  const scale = priceScale(-10, 10, 0, 100, 'log');
  assert.equal(scale.y(0), 50); assert.equal(scale.priceAtY(50), 0);
});

test('drawing hit tests select handles, line bodies and left-pointing rays', async () => {
  const { hitDrawing } = await import('../src/chart-workspace.js');
  const m = { bars: Array.from({ length: 10 }, (_, minute) => ({ minute })), first: 0, left: 0, right: 100, step: 10, y: value => value };
  const item = { type: 'trend', a: { minute: 2, price: 20 }, b: { minute: 7, price: 70 } };
  assert.deepEqual(hitDrawing([item], { x: 25, y: 20 }, m, 1), { index: 0, anchor: 'a' });
  assert.deepEqual(hitDrawing([item], { x: 50, y: 45 }, m, 1), { index: 0, anchor: null });
  assert.equal(hitDrawing([item], { x: 50, y: 90 }, m, 1), null);
  const ray = { type: 'ray', a: { minute: 7, price: 50 }, b: { minute: 4, price: 50 } };
  assert.deepEqual(hitDrawing([ray], { x: 5, y: 50 }, m, 1), { index: 0, anchor: null });
});

test('saved chart preferences validate types and discard unsupported settings', async () => {
  const { readWorkspace } = await import('../src/chart-workspace.js');
  const storage = memoryStorage();
  storage.setItem('argent-chart-workspace-v1', JSON.stringify({ chartType: 'unknown', timeframe: 7, timeZone: 'invalid', drawingWidth: -1, drawingColor: 'bad', showVolume: false, showGrid: 'false', scaleMode: 'unknown' }));
  const result = readWorkspace(storage);
  assert.equal(result.chartType, 'candles'); assert.equal(result.timeframe, 1);
  assert.equal(result.timeZone, 'Asia/Tokyo'); assert.equal(result.drawingWidth, 2);
  assert.equal(result.showVolume, false); assert.equal(result.showGrid, true);
  assert.equal(result.scaleMode, 'linear');
});
