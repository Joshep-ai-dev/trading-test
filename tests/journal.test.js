const test = require('node:test');
const assert = require('node:assert/strict');

test('journal restores account, open positions, cursor and executions without storing candles', async () => {
  const { enterTrade, closeTrade } = await import('../src/trading.js');
  const { writeJournal, readJournal, JOURNAL_KEY, journalCsv } = await import('../src/journal.js');
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const timestamp = Date.parse('2026-08-09T01:30:00Z');
  const initial = { candles: [{ timestamp, close: 20 }], index: 0, balance: 10000, nextId: 1, positions: [], history: [], fills: [] };
  const opened = enterTrade(initial, 'LONG', 100, 20, 19.5, 21);
  writeJournal(opened, '2026-08-09', storage);
  const saved = readJournal(storage);
  assert.equal(saved.positions.length, 1);
  assert.equal(saved.timestamp, timestamp);
  assert.equal(saved.nextId, 2);
  assert.equal(saved.fills[0].action, 'Open long');
  assert.equal(saved.candles, undefined);
  assert.ok(values.get(JOURNAL_KEY).length < 2000);
  const closed = closeTrade(opened, 1, 21, timestamp + 60000, 'Take profit');
  assert.equal(closed.fills.length, 2);
  assert.equal(closed.fills[0].side, 'SELL');
  assert.ok(Math.abs(closed.fills[0].profit + closed.fills[1].profit - closed.history[0].profit) < 1e-8);
  assert.ok(Math.abs(closed.fills.reduce((sum, f) => sum + f.profit, 0) - (closed.balance - 10000)) < 1e-8);
  assert.equal(journalCsv(closed.fills).split('\r\n').length, 3);
  assert.match(journalCsv(closed.fills), /Take profit/);
});

test('malformed or unavailable journals recover safely and CSV text is quoted', async () => {
  const { readJournal, journalCsv } = await import('../src/journal.js');
  assert.equal(readJournal({ getItem: () => '{broken' }), null);
  assert.equal(readJournal({ getItem: () => { throw new Error('Storage blocked'); } }), null);
  assert.equal(readJournal({ getItem: () => JSON.stringify({ version: 99 }) }), null);
  const csv = journalCsv([{ timestamp: 0, positionId: 1, action: 'Close long', side: 'SELL', price: 20, quantity: 1, profit: 0, reason: 'A "quoted", reason' }]);
  assert.match(csv, /"A ""quoted"", reason"/);
});
