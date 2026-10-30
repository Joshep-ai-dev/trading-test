const test = require('node:test');
const assert = require('node:assert/strict');
const barsOf = prices => prices.map((close, i) => ({ timestamp: i * 60000, open: close, close, high: close + .5, low: close - .5 }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);

test('ATR uses true range including gaps and Wilder smoothing with warm-up', async () => {
  const { atr, trueRange } = await import('../src/indicators.js');
  const bars = [{ high: 11, low: 9, close: 10 }, { high: 13, low: 12, close: 12 }, { high: 12, low: 9, close: 10 }];
  assert.deepEqual(trueRange(bars), [2, 3, 3]);
  assert.deepEqual(atr(bars, 2), [null, 2.5, 2.75]);
});

test('BB uses population deviation and RSI/MACD handle constant markets', async () => {
  const { bollinger, rsi, macd } = await import('../src/indicators.js');
  const bb = bollinger([1, 2, 3], 3, 2);
  assert.equal(bb.basis[0], null);
  near(bb.basis[2], 2); near(bb.upper[2], 2 + 2 * Math.sqrt(2 / 3)); near(bb.lower[2], 2 - 2 * Math.sqrt(2 / 3));
  assert.equal(rsi(Array(30).fill(20), 14).at(-1), 50);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => i), 14).at(-1), 100);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 30 - i), 14).at(-1), 0);
  assert.equal(macd(Array(60).fill(20)).histogram.at(-1), 0);
});

test('ADX has correct warm-up and finite DI values in directional and flat markets', async () => {
  const { adx } = await import('../src/indicators.js');
  const up = adx(barsOf([10, 11, 12, 13, 14, 15]), 2, 2);
  assert.deepEqual(up.line.slice(0, 3), [null, null, null]);
  near(up.line[3], 100);
  assert.equal(up.minus.at(-1), 0);
  assert.ok(up.plus.at(-1) > 0);
  const flat = adx(Array.from({ length: 20 }, () => ({ high: 10, low: 10, close: 10 })), 3, 3);
  assert.equal(flat.line.at(-1), 0);
});

test('Supertrend switches bands at direction changes without connecting opposite trends', async () => {
  const { supertrend } = await import('../src/indicators.js');
  const trend = supertrend(barsOf([10, 10, 10, 13, 14, 9, 8]), 2, 1);
  assert.equal(trend.line[0], null);
  near(trend.down[2], 11);
  near(trend.up[3], 10.75);
  near(trend.up[4], 12.125);
  near(trend.down[5], 12.6875);
  assert.equal(trend.down[3], null);
  assert.equal(trend.up[5], null);
});

test('indicator settings validate and every calculation is causal', async () => {
  const { DEFAULT_INDICATORS, validateIndicators, calculateIndicators, indicatorLayout } = await import('../src/indicators.js');
  const config = structuredClone(DEFAULT_INDICATORS);
  for (const value of Object.values(config)) value.enabled = true;
  const invalid = structuredClone(config); invalid.macd.fast = invalid.macd.slow;
  assert.throws(() => validateIndicators(invalid), /Fast length/);
  invalid.macd.fast = 12; invalid.atr.period = 1.5;
  assert.throws(() => validateIndicators(invalid), /integer/);
  const bars = barsOf(Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i / 3) * 4 + i / 20));
  const full = calculateIndicators(bars, config), prefix = calculateIndicators(bars.slice(0, 60), config);
  for (const key of Object.keys(full)) {
    if (Array.isArray(full[key])) assert.deepEqual(full[key].slice(0, 60), prefix[key]);
    else for (const line of Object.keys(full[key])) assert.deepEqual(full[key][line].slice(0, 60), prefix[key][line]);
  }
  for (const height of [290, 500, 900]) {
    const layout = indicatorLayout(height, config, { rsi: 500, macd: 500, atr: 500, adx: 500 });
    assert.equal(layout.panes.length, 4);
    assert.ok(layout.bottom > 30);
    assert.ok(layout.panes.every(pane => pane.height >= layout.minimum && pane.height >= 24));
    near(layout.panes.at(-1).bottom, height - 54);
  }
});

test('study styles validate and hidden panes retain their order and space', async () => {
  const { DEFAULT_INDICATORS, validateIndicators, indicatorLayout } = await import('../src/indicators.js');
  const config = structuredClone(DEFAULT_INDICATORS);
  config.rsi.hidden = true; config.rsi.color = '#ff7700'; config.rsi.lineWidth = 3;
  const validated = validateIndicators(config);
  assert.equal(validated.rsi.hidden, true);
  assert.equal(validated.rsi.lineWidth, 3);
  const layout = indicatorLayout(600, validated, {}, true, ['macd', 'rsi']);
  assert.deepEqual(layout.panes.map(p => p.key), ['macd', 'rsi']);
  config.rsi.color = 'invalid';
  assert.throws(() => validateIndicators(config), /color/);
});
