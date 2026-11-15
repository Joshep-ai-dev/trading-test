const fs = require('node:fs/promises');
const { createRateLimitedFetch } = require('./lib/rate-limit');

async function main() {
  const request = createRateLimitedFetch();
  const rows = new Map();
  let cursor;
  while (true) {
    const url = new URL('https://www.okx.com/api/v5/market/history-candles');
    url.searchParams.set('instId', 'XAG-USDT-SWAP');
    url.searchParams.set('bar', '3m');
    url.searchParams.set('limit', '300');
    if (cursor) url.searchParams.set('after', String(cursor));
    const payload = await request(url);
    if (!payload.data.length) break;
    const oldest = Math.min(...payload.data.map(row => Number(row[0])));
    if (!Number.isFinite(oldest) || (cursor && oldest >= cursor)) throw new Error('Pagination did not advance');
    for (const row of payload.data) if (row[8] === '1') rows.set(Number(row[0]), row);
    cursor = oldest;
    if (rows.size % 3000 < 300) console.log(`${rows.size} candles; reached ${new Date(cursor).toISOString()}`);
  }
  const sorted = [...rows.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!sorted.length) throw new Error('No candles returned');
  const file = 'XAG-USDT-SWAP-3m.csv';
  const header = 'timestamp_ms,datetime_utc,open,high,low,close,volume_contracts,volume_base,volume_quote,confirmed';
  await fs.writeFile(file, header + '\n' + sorted.map(row => [row[0], new Date(Number(row[0])).toISOString(), ...row.slice(1)].join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ file, rows: sorted.length, first: new Date(Number(sorted[0][0])).toISOString(), last: new Date(Number(sorted.at(-1)[0])).toISOString() }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
