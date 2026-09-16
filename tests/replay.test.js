const test = require('node:test');
const assert = require('node:assert/strict');
const { priceTicks, timeStep, seekIndex, zonedTime, zonedCandidates } = require('../chart-utils');

test('timezone formatting and jumps handle offsets and date rollover', () => {
  const timestamp = Date.parse('2026-08-09T20:30:00Z');
  assert.equal(zonedTime(timestamp, 'Asia/Shanghai').value, '2026-08-10T04:30:00');
  assert.deepEqual(zonedCandidates('2026-08-10T04:30', 'Asia/Shanghai'), [timestamp]);
  assert.equal(zonedTime(timestamp, 'Asia/Kolkata').value, '2026-08-10T02:00:00');
  assert.deepEqual(zonedCandidates('2026-08-10T02:00', 'Asia/Kolkata'), [timestamp]);
  assert.equal(zonedTime(timestamp, 'America/New_York').value, '2026-08-09T16:30:00');
  assert.deepEqual(zonedCandidates('2026-08-09T20:30', 'UTC'), [timestamp]);
  assert.deepEqual(zonedCandidates('2026-02-30T12:00', 'UTC'), []);
});

test('daylight saving rejects missing times and returns both repeated times', () => {
  assert.deepEqual(zonedCandidates('2026-03-08T02:30', 'America/New_York'), []);
  assert.deepEqual(zonedCandidates('2026-11-01T01:30', 'America/New_York'), [
    Date.parse('2026-11-01T05:30:00Z'), Date.parse('2026-11-01T06:30:00Z'),
  ]);
  assert.equal(zonedTime(Date.parse('2026-01-15T12:00:00Z'), 'America/New_York').value, '2026-01-15T07:00:00');
});
const { dateRange, loadCandles } = require('../lib/candles');

test('default range is seven UTC days across month and year boundaries', () => {
  for (const [start, end] of [['2026-08-09', '2026-08-16'], ['2026-12-29', '2027-01-05'], ['2028-02-27', '2028-03-05']]) {
    const range = dateRange(start);
    assert.equal(new Date(range.end).toISOString().slice(0, 10), end);
    assert.equal(range.days, 7);
  }
  assert.equal(dateRange('2026-08-09', '1').days, 1);
  assert.equal(dateRange('2026-08-09', '7').days, 7);
  for (const date of ['2026-02-30', 'bad', undefined]) assert.throws(() => dateRange(date));
  assert.throws(() => dateRange('2026-08-09', '31'));
});

test('price levels are round, evenly spaced, bounded, and never arbitrary endpoints', () => {
  const ticks = priceTicks(74.51, 77.51, 300, 1);
  assert.deepEqual(ticks.map(tick => tick.price), [75, 76, 77]);
  const auto = priceTicks(65.51, 66.83, 400);
  assert.ok(auto.length > 5);
  assert.ok(auto.every(tick => Math.abs(tick.price * 10 - Math.round(tick.price * 10)) < 1e-6));
  assert.ok(priceTicks(1, 10000, 400, 0.01).length <= 501);
  assert.ok(priceTicks(75, 75.01, 400).every(tick => Number.isFinite(tick.price)));
});

test('time spacing adjusts to zoom and respects candle resolution', () => {
  assert.equal(timeStep(1, 10), 10);
  assert.equal(timeStep(1, 10, 5), 5);
  assert.equal(timeStep(60, 10, 5), 60);
  assert.ok(timeStep(1, 2) > timeStep(1, 10));
});

test('seeking handles exact minutes, gaps, boundaries, and invalid input', () => {
  const candles = [0, 60000, 180000].map(timestamp => ({ timestamp }));
  assert.equal(seekIndex(candles, 60000), 1);
  assert.equal(seekIndex(candles, 120000), 2);
  assert.equal(seekIndex(candles, 0), 0);
  assert.equal(seekIndex(candles, 180000), 2);
  for (const timestamp of [-1, 180001, NaN]) assert.equal(seekIndex(candles, timestamp), -1);
  assert.equal(seekIndex([], 0), -1);
});

test('week loader paginates every minute and preserves UTC bounds', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests++;
    const cursor = Number(url.searchParams.get('after'));
    const start = Number(url.searchParams.get('before')) + 1;
    const data = [];
    for (let timestamp = cursor - 60000; timestamp >= start && data.length < 300; timestamp -= 60000) {
      data.push([String(timestamp), '75', '76', '74', '75.5', '10']);
    }
    return { ok: true, json: async () => ({ code: '0', data }) };
  });
  const result = await loadCandles('2026-07-09');
  assert.equal(result.days, 7);
  assert.equal(result.candles.length, 7 * 1440);
  assert.equal(result.candles[0].timestamp, result.start);
  assert.equal(result.candles.at(-1).timestamp, result.end - 60000);
  assert.equal(requests, 7 * 5);
  assert.ok(result.candles.every((candle, index) => candle.minute === index));
});

test('empty days are allowed but exchange failures are surfaced', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: '0', data: [] }) }));
  assert.deepEqual((await loadCandles('2026-03-01', '1')).candles, []);
  mock.mock.mockImplementation(async () => ({ ok: false, status: 500 }));
  await assert.rejects(loadCandles('2026-03-02', '1'), /500/);
});

test('Vercel endpoint rejects invalid dates and returns single-day metadata', async t => {
  const handler = require('../api/candles');
  const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'GET', query: { date: '2026-02-30' } }, response);
  assert.equal(response.code, 400);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: '0', data: [] }) }));
  await handler({ method: 'GET', query: { date: '2026-04-01', days: '1' } }, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.days, 1);
  assert.equal(response.body.timezone, 'UTC');
});
