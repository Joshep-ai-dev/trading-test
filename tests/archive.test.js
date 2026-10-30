const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createArchive, INTERVAL } = require('../lib/archive');
const { dateRange } = require('../lib/candles');
const DAY = 86400000;

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'argent-archive-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
function payload(date, close = 20) {
  const range = dateRange(date, 1);
  return { ...range, candles: [{ timestamp: range.start, open: 20, high: 21, low: 19, close, volume: 1 }] };
}

test('saved historical candles survive restart and work offline, including empty days', async t => {
  const directory = await fixture(t);
  let calls = 0;
  const options = { directory, now: () => Date.parse('2026-01-29T12:00:00Z'), loadCandles: async date => {
    calls++;
    return date === '2026-01-29' ? { ...payload(date), candles: [] } : payload(date);
  } };
  const archive = createArchive(options);
  await archive.sync();
  const first = await archive.load('2026-01-28', 1);
  const restarted = createArchive({ ...options, loadCandles: async () => { throw new Error('offline'); } });
  assert.deepEqual((await restarted.load('2026-01-28', 1)).candles, first.candles);
  assert.deepEqual((await restarted.load('2026-01-29', 1)).candles, []);
  assert.equal(calls, 2);
});

test('current day refresh replaces duplicate timestamps and preserves saved data offline', async t => {
  const directory = await fixture(t);
  let clock = Date.parse('2026-01-28T12:00:00Z'), calls = 0, offline = false;
  const archive = createArchive({ directory, now: () => clock, loadCandles: async date => {
    if (offline) throw new Error('offline');
    return payload(date, ++calls);
  } });
  await archive.sync();
  clock += INTERVAL;
  await archive.sync();
  const refreshed = await archive.load('2026-01-28', 1);
  assert.equal(refreshed.candles.length, 1);
  assert.equal(refreshed.candles[0].close, 2);
  offline = true;
  clock += INTERVAL;
  assert.equal((await archive.load('2026-01-28', 1)).stale, true);
  assert.equal((await archive.load('2026-01-28', 1)).candles[0].close, 2);
});

test('sync resumes after failure, avoids future days, and deduplicates concurrent runs', async t => {
  const directory = await fixture(t);
  let fail = true;
  const requests = [];
  const archive = createArchive({ directory, now: () => Date.parse('2026-01-30T12:00:00Z'), loadCandles: async date => {
    requests.push(date);
    if (fail && date === '2026-01-28') throw new Error('exchange down');
    return payload(date);
  } });
  const run = archive.sync();
  assert.equal(archive.sync(), run);
  await run;
  assert.equal(archive.status.error, 'exchange down');
  fail = false;
  await archive.sync();
  assert.equal(archive.status.error, null);
  assert.equal(archive.status.completedDays, 3);
  assert.ok(archive.status.lastSync);
  const before = requests.length;
  await assert.rejects(archive.load('2026-02-01', 1), /No local candles/);
  assert.equal(requests.length, before);
  const day = await archive.load('2026-01-29', 1);
  assert.deepEqual(day.candles.map(c => c.minute), [0]);
});


test('local reads never call the exchange for missing or expired days', async t => {
  const directory = await fixture(t);
  let calls = 0, clock = Date.parse('2026-01-28T12:00:00Z');
  const archive = createArchive({ directory, now: () => clock, loadCandles: async date => { calls++; return payload(date); } });
  await assert.rejects(archive.load('2026-01-28', 1), error => error.status === 404);
  assert.equal(calls, 0);
  await archive.sync();
  assert.equal(calls, 1);
  clock += INTERVAL * 2;
  assert.equal((await archive.load('2026-01-28', 1)).candles.length, 1);
  assert.equal(calls, 1);
});

test('selected week downloads directly and then reopens entirely from local files', async t => {
  const directory = await fixture(t);
  const requested = [];
  const archive = createArchive({ directory, now: () => Date.parse('2026-10-30T12:00:00Z'), loadCandles: async date => {
    requested.push(date); return payload(date);
  } });
  const result = await archive.download('2026-08-09', 7);
  assert.equal(result.saved, true);
  assert.deepEqual(requested, ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']);
  const restarted = createArchive({ directory, loadCandles: async () => { throw new Error('No exchange access'); } });
  assert.equal((await restarted.load('2026-08-09', 7)).candles.length, 7);
  await archive.download('2026-08-09', 7);
  assert.equal(requested.length, 7);
});

test('local catalog lists only saved UTC days in chronological order', async t => {
  const directory = await fixture(t);
  const archive = createArchive({ directory, loadCandles: async () => { throw new Error('Must stay local'); } });
  await fs.writeFile(path.join(directory, '2026-08-10.json'), '{}');
  await fs.writeFile(path.join(directory, '2026-08-09.json'), '{}');
  await fs.writeFile(path.join(directory, '2026-08-11.json.tmp'), '{}');
  assert.deepEqual((await archive.catalog()).dates, ['2026-08-09', '2026-08-10']);
});

test('sync catches up missing days after downtime and reports latest saved candle', async t => {
  const directory = await fixture(t);
  let clock = Date.parse('2026-01-28T12:00:00Z');
  const archive = createArchive({ directory, now: () => clock, loadCandles: async date => payload(date) });
  await archive.sync();
  clock = Date.parse('2026-01-31T12:00:00Z');
  await archive.sync();
  assert.equal(archive.status.completedDays, 4);
  assert.equal(archive.status.latestCandle, '2026-01-31T00:00:00.000Z');
  assert.equal(archive.status.nextSync, new Date(clock + INTERVAL).toISOString());
  const catalog = await archive.catalog();
  assert.equal(catalog.dates.length, 4);
  assert.equal(catalog.latestCandle, archive.status.latestCandle);
  assert.equal((await archive.load('2026-01-29', 1)).candles.length, 1);
});
