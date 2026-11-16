const test = require('node:test');
const assert = require('node:assert/strict');

test('completed candle days survive reloads while current days stay fresh', async t => {
  const { readLocalDay, dateOf } = await import('../src/data.js');
  const entries = new Map();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ candles: [{ timestamp: 60000, close: requests }] });
  });
  const previousCaches = globalThis.caches;
  t.after(() => { if (previousCaches === undefined) delete globalThis.caches; else globalThis.caches = previousCaches; });
  globalThis.caches = { open: async () => ({
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => entries.set(key, response.clone()),
  }) };
  const first = await readLocalDay('2020-01-01');
  assert.deepEqual(await readLocalDay('2020-01-01'), first);
  assert.equal(requests, 1);
  await readLocalDay(dateOf(Date.now()));
  await readLocalDay(dateOf(Date.now()));
  assert.equal(requests, 3);
});

test('history loads concurrently with bounded requests and chronological deduplication', async () => {
  const { readDays } = await import('../src/data.js');
  let active = 0, peak = 0;
  const rows = await readDays([4, 3, 2, 1, 1], async day => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return [{ timestamp: day * 60000 }];
  });
  assert.equal(peak, 3);
  assert.deepEqual(rows.map(row => row.minute), [1, 2, 3, 4]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readDays([1], () => assert.fail('aborted request started'), controller.signal), { name: 'AbortError' });
});

test('replay date selection uses the full archive and restores exact saved candles', async () => {
  const { replayDateIndex } = await import('../src/data.js');
  const start = Date.parse('2026-08-01T00:00:00Z');
  const candles = Array.from({ length: 20 * 1440 }, (_, i) => ({ timestamp: start + i * 60000 }));
  assert.equal(replayDateIndex(candles, '2026-08-10'), 9 * 1440 + 89);
  assert.equal(replayDateIndex(candles, '2026-08-01', candles.at(-1).timestamp), candles.length - 1);
  assert.equal(replayDateIndex(candles, '2026-08-01', start + 500), -1);
  assert.equal(replayDateIndex([], '2026-08-01'), -1);
});

test('full archive loading stops scheduling days after a failed request', async () => {
  const { readDays } = await import('../src/data.js');
  const requested = [], progress = [];
  await assert.rejects(readDays([1, 2, 3, 4, 5, 6], async day => {
    requested.push(day);
    if (day === 1) throw new Error('Missing archive day');
    await new Promise(resolve => setTimeout(resolve, 10));
    return [];
  }, undefined, 3, done => progress.push(done)), /Missing archive day/);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(requested.length <= 3);
  assert.deepEqual(progress, []);
});
