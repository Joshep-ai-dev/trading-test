const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { packageCandles } = require('../scripts/package-candles.cjs');

test('static packs contain only completed public OHLCV days and have stable content hashes', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'argent-packs-'));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), output = path.join(directory, 'output');
  await fs.mkdir(source);
  for (const [day, complete] of [['2026-01-30', true], ['2026-01-31', false], ['2026-02-01', true], ['2026-02-02', true]]) {
    await fs.writeFile(path.join(source, `${day}.json`), JSON.stringify({ complete, privateField: 'never-export-me', payload: { candles: [{ timestamp: Date.parse(`${day}T00:00:00Z`), open: 10, high: 12, low: 9, close: 11, volume: 7, privateField: 'never-export-me' }] } }));
  }
  const stats = await packageCandles(source, output, Date.parse('2026-02-02T12:00:00Z'));
  assert.equal(stats.days, 2); assert.equal(stats.chunks, 2); assert.equal(stats.candles, 2);
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.days), ['2026-01-30', '2026-02-01']);
  const filename = path.basename(manifest.days['2026-01-30']);
  const text = gunzipSync(await fs.readFile(path.join(output, filename))).toString('utf8');
  assert.equal(text.includes('never-export-me'), false);
  assert.deepEqual(JSON.parse(text).days['2026-01-30'][0], [Date.parse('2026-01-30T00:00:00Z'), 10, 12, 9, 11, 7]);
  await packageCandles(source, output, Date.parse('2026-02-02T12:00:00Z'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')), manifest);
});

test('packed day reads deduplicate monthly downloads, preserve empty days and support aborts', async t => {
  const { createPackedArchive } = await import('../src/packed-candles.js');
  const file = '/candle-archive/2026-01-abcdef123456.json.gz', requests = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    return Response.json(url.endsWith('manifest.json') ? { version: 1, days: { '2026-01-01': file, '2026-01-02': file } } : { version: 1, days: { '2026-01-01': [[Date.parse('2026-01-01T00:00:00Z'), 10, 12, 9, 11, 7]], '2026-01-02': [] } });
  });
  const archive = createPackedArchive('/candle-archive/manifest.json');
  const [first, empty] = await Promise.all([archive.readDay('2026-01-01'), archive.readDay('2026-01-02')]);
  assert.equal(first[0].close, 11); assert.equal(first[0].minute, first[0].timestamp / 60000);
  assert.deepEqual(empty, []); assert.equal(requests.length, 2);
  assert.equal(await archive.readDay('2026-01-03'), null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(archive.readDay('2026-01-01', controller.signal), { name: 'AbortError' });
  assert.deepEqual(await archive.readDay('2026-01-01'), first);
});

test('unavailable or invalid packs fall back without retrying a failed month for every day', async t => {
  const { createPackedArchive } = await import('../src/packed-candles.js');
  const file = '/candle-archive/2026-01-abcdef123456.json.gz';
  let chunks = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('manifest.json')) return Response.json({ version: 1, days: { '2026-01-01': file, '2026-01-02': file } });
    chunks++; throw new Error('unavailable');
  });
  const archive = createPackedArchive('/candle-archive/manifest.json');
  assert.equal(await archive.readDay('2026-01-01'), null);
  assert.equal(await archive.readDay('2026-01-02'), null);
  assert.equal(chunks, 1);
  assert.equal(createPackedArchive('https://untrusted.example/manifest.json'), null);
});
