const test = require('node:test');
const assert = require('node:assert/strict');
const { hostedCatalog } = require('../lib/hosted');
const response = () => ({ code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('hosted catalog provides chronological UTC dates without requiring local files', () => {
  const catalog = hostedCatalog(Date.parse('2026-01-30T23:59:00Z'));
  assert.deepEqual(catalog.dates, ['2026-01-28', '2026-01-29', '2026-01-30']);
  assert.equal(catalog.mode, 'hosted');
  const result = response();
  require('../api/local-data')({ method: 'GET' }, result);
  assert.equal(result.code, 200);
  assert.ok(result.body.dates.length > 0);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('hosted candles fetch through OKX and cache completed days', async t => {
  const handler = require('../api/candles');
  const start = Date.parse('2026-02-05T00:00:00Z');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    const after = Number(url.searchParams.get('after'));
    return { ok: true, json: async () => ({ code: '0', data: after > start ? [[String(start), '20', '21', '19', '20.5', '10']] : [] }) };
  });
  const result = response();
  await handler({ method: 'GET', query: { date: '2026-02-05', days: '1' } }, result);
  assert.equal(result.code, 200);
  assert.equal(result.body.candles[0].close, 20.5);
  assert.equal(result.body.mode, 'hosted');
  assert.match(result.headers['Cache-Control'], /s-maxage=86400/);
  assert.equal(calls, 1);
});

test('hosted sync has no background filesystem job; POST refreshes current candles', async t => {
  const handler = require('../api/sync');
  const current = Math.floor(Date.now() / 60000) * 60000;
  const mock = t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => ({ code: '0', data: Number(url.searchParams.get('after')) > current ? [[String(current), '20', '21', '19', '20', '1']] : [] }) }));
  const status = response();
  await handler({ method: 'GET' }, status);
  assert.equal(status.body.mode, 'hosted');
  assert.equal(mock.mock.callCount(), 0);
  const refreshed = response();
  await handler({ method: 'POST' }, refreshed);
  assert.equal(refreshed.code, 200);
  assert.equal(refreshed.body.latestCandle, new Date(current).toISOString());
  assert.equal(refreshed.headers['Cache-Control'], 'no-store');
});
