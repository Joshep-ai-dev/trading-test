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
