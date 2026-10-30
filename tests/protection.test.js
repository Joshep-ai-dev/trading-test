const test = require('node:test');
const assert = require('node:assert/strict');

test('long and short trailing stops tighten, never loosen, then close with fees', async () => {
  const { enterTrade, settleCandle } = await import('../src/trading.js');
  const initial = { candles: [{ close: 100, timestamp: 0 }], index: 0, balance: 10000, nextId: 1, positions: [], history: [], fills: [] };
  for (const side of ['LONG', 'SHORT']) {
    const long = side === 'LONG';
    const opened = enterTrade(initial, side, 100, 5, null, null, 2);
    const moved = settleCandle(opened, { open: 100, high: long ? 105 : 101, low: long ? 99 : 95, close: long ? 104 : 96, timestamp: 60000 });
    const stop = moved.positions[0].trailingStop;
    assert.ok(long ? stop > 98 : stop < 102);
    const stable = settleCandle(moved, { open: long ? 104 : 96, high: long ? 104 : 97, low: long ? 103 : 96, close: long ? 103 : 97, timestamp: 120000 });
    assert.equal(stable.positions[0].trailingStop, stop);
    const closed = settleCandle(stable, { open: long ? 103 : 97, high: long ? 104 : 101, low: long ? 100 : 96, close: 100, timestamp: 180000 });
    assert.equal(closed.positions.length, 0);
    assert.equal(closed.history[0].reason, 'Trailing stop');
    assert.ok(closed.history[0].fees > 0);
  }
});

test('editing protection validates prices, preserves unchanged trail, and supports removal', async () => {
  const { enterTrade, updateProtection, settleCandle } = await import('../src/trading.js');
  const initial = { candles: [{ close: 100, timestamp: 0 }], index: 0, balance: 10000, nextId: 1, positions: [], history: [], fills: [] };
  const opened = enterTrade(initial, 'LONG', 100, 5, 95, 110, 2);
  assert.throws(() => updateProtection(opened, 1, 101, 110, 2), /Stop loss/);
  assert.throws(() => enterTrade(initial, 'LONG', 100, 5, null, null, 0), /Trailing distance/);
  assert.throws(() => updateProtection(opened, 1, null, null, 100), /Trailing distance/);
  const edited = updateProtection(opened, 1, 96, 111, 2);
  assert.equal(edited.positions[0].trailingStop, opened.positions[0].trailingStop);
  const removed = updateProtection(edited, 1, null, null, null);
  assert.equal(removed.positions[0].trailingStop, null);
  assert.equal(removed.positions[0].sl, null);
  const gap = settleCandle(opened, { open: 97, high: 99, low: 96, close: 98, timestamp: 60000 });
  assert.equal(gap.history[0].reason, 'Trailing stop');
  assert.equal(gap.history[0].exit, 97);
});
