const { createRateLimitedFetch } = require('./rate-limit');
const fetchPage = createRateLimitedFetch();
const pending = new Map();
const DAY = 86400000;
const cache = new Map();

function dateRange(date, days) {
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) {
    throw new Error('Date must be a valid YYYY-MM-DD');
  }
  if (days !== undefined && !['1', '7'].includes(String(days))) throw new Error('Use days=1 or days=7');
  const end = start + Number(days ?? 7) * DAY;
  return { start, end, days: (end - start) / DAY };
}

async function fetchDay(start) {
  if (cache.has(start)) return cache.get(start);
  const end = start + DAY;
  const rows = new Map();
  let cursor = end;
  while (cursor > start) {
    const url = new URL('https://www.okx.com/api/v5/market/history-candles');
    Object.entries({ instId: 'XAG-USDT-SWAP', bar: '1m', after: String(cursor), before: String(start - 1), limit: '300' })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    const payload = await fetchPage(url);
    if (!payload.data.length) break;
    const oldest = Math.min(...payload.data.map(row => Number(row[0])));
    if (!Number.isFinite(oldest) || oldest >= cursor) throw new Error('OKX pagination did not advance');
    for (const row of payload.data) {
      const timestamp = Number(row[0]);
      if (timestamp >= start && timestamp < end) rows.set(timestamp, {
        timestamp, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
      });
    }
    cursor = oldest;
  }
  const candles = [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
  // Cache only completed days; today's candles may still be arriving.
  if (end <= Date.now() && candles.length) {
    if (cache.size >= 62) cache.delete(cache.keys().next().value);
    cache.set(start, candles);
  }
  return candles;
}

function loadDay(start) {
  if (pending.has(start)) return pending.get(start);
  const promise = fetchDay(start).finally(() => pending.delete(start));
  pending.set(start, promise);
  return promise;
}

async function loadCandles(date, days) {
  const range = dateRange(date, days);
  const chunks = [];
  for (let start = range.start; start < range.end; start += DAY) {
    chunks.push(await loadDay(start));
  }
  const candles = chunks.flat().map(candle => ({ ...candle, minute: Math.floor((candle.timestamp - range.start) / 60000) }));
  return { source: 'OKX', instrument: 'XAG-USDT-SWAP', timezone: 'UTC', ...range, candles };
}

module.exports = { dateRange, loadCandles };
