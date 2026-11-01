const test = require('node:test');
const assert = require('node:assert/strict');

test('prepending local history preserves replay time, positions, and deduplicates overlaps', async () => {
  const { prependHistory } = await import('../src/data.js');
  const candles = [120000, 180000].map(timestamp => ({ timestamp, close: 20, minute: timestamp / 60000 }));
  const position = { id: 1, openTime: 180000, entry: 20 };
  const model = { candles, index: 1, positions: [position], balance: 10000 };
  const next = prependHistory(model, [{ timestamp: 60000, close: 19 }, { timestamp: 120000, close: 21 }]);
  assert.deepEqual(next.candles.map(c => c.timestamp), [60000, 120000, 180000]);
  assert.equal(next.candles[next.index].timestamp, model.candles[model.index].timestamp);
  assert.equal(next.candles[1].close, 21);
  assert.equal(next.candles[0].minute, 1);
  assert.equal(next.positions, model.positions);
  assert.equal(next.balance, 10000);
});

test('React trading state validates margin and settles stop loss, take profit, and liquidation', async () => {
  const { enterTrade, settleCandle, closeTrade } = await import('../src/trading.js');
  const model = { candles: [{ timestamp: 0, open: 20, close: 20, high: 20, low: 20 }], index: 0, positions: [], history: [], balance: 10000, nextId: 1 };
  assert.throws(() => enterTrade(model, 'LONG', 10001, 20, null, null), /Insufficient/);
  assert.throws(() => enterTrade(model, 'LONG', 100, 20, 21, null), /Stop loss/);
  const long = enterTrade(model, 'LONG', 100, 20, 19.5, 21);
  const stopped = settleCandle(long, { timestamp: 60000, high: 20, low: 19.4 });
  assert.equal(stopped.positions.length, 0);
  assert.equal(stopped.history[0].reason, 'Stop loss');
  assert.ok(stopped.balance < model.balance);
  const profit = settleCandle(long, { timestamp: 60000, high: 21.1, low: 20 });
  assert.equal(profit.history[0].reason, 'Take profit');
  assert.ok(profit.balance > model.balance);
  const liquidation = settleCandle(long, { timestamp: 60000, high: 20, low: 18 });
  assert.equal(liquidation.history[0].reason, 'Liquidated');
  assert.ok(Math.abs(liquidation.balance - (9900 - long.positions[0].entryFee - liquidation.history[0].exitFee)) < .001);
  const short = enterTrade(model, 'SHORT', 100, 20, 21, 19);
  const closed = closeTrade(short, 1, 19, 60000);
  assert.ok(closed.balance > model.balance);
  assert.equal(closed.history[0].closeTime, 60000);
  assert.equal(model.positions.length, 0);
});

test('entry and exit each charge 0.06% of executed notional without double deduction', async () => {
  const { enterTrade, closeTrade, FEE_RATE } = await import('../src/trading.js');
  const initial = { candles: [{ timestamp: 0, close: 20 }], index: 0, positions: [], history: [], fills: [], balance: 10000, nextId: 1 };
  for (const side of ['LONG', 'SHORT']) {
    const opened = enterTrade(initial, side, 100, 20, null, null);
    const p = opened.positions[0];
    assert.equal(p.entryFee, 1.2);
    assert.equal(opened.balance, 9998.8);
    const closed = closeTrade(opened, p.id, p.entry, 60000);
    assert.ok(Math.abs(closed.balance - 9997.6) < 1e-8);
    assert.ok(Math.abs(closed.history[0].profit + 2.4) < 1e-8);
    assert.equal(closed.history[0].grossProfit, 0);
    assert.ok(Math.abs(closed.history[0].fees - 2.4) < 1e-8);
    const differentExit = closeTrade(opened, p.id, 22, 60000);
    assert.ok(Math.abs(differentExit.history[0].exitFee - 22 * p.quantity * FEE_RATE) < 1e-8);
    assert.throws(() => enterTrade({ ...initial, balance: 100 }, side, 100, 20, null, null), /entry fee/);
  }
});

test('resetting starting amount clears account activity and preserves replay data', async () => {
  const { resetAccount } = await import('../src/trading.js');
  const candles = [{ timestamp: 0, close: 50 }];
  const model = { candles, index: 0, balance: 9000, startingBalance: 10000, positions: [{ id: 1 }], history: [{ id: 2 }], fills: [{ id: '1:open' }], nextId: 3 };
  const reset = resetAccount(model, 2500.55);
  assert.equal(reset.balance, 2500.55);
  assert.equal(reset.startingBalance, 2500.55);
  assert.equal(reset.candles, candles);
  assert.equal(reset.index, 0);
  assert.deepEqual(reset.positions, []);
  assert.deepEqual(reset.history, []);
  assert.deepEqual(reset.fills, []);
  assert.equal(reset.nextId, 1);
  assert.throws(() => resetAccount(model, 0), /Starting amount/);
  assert.throws(() => resetAccount(model, NaN), /Starting amount/);
});
