const cache = new Map();

async function loadOkxCandles(date) {
  if (cache.has(date)) return cache.get(date);

  const start = Date.parse(`${date}T00:00:00Z`);
  const end = start + 7 * 86400000;
  if (!Number.isFinite(start)) throw new Error('Invalid date');

  let cursor = end;
  const rows = [];

  for (let page = 0; page < 36 && cursor > start; page++) {
    const url = new URL('https://www.okx.com/api/v5/market/history-candles');
    url.searchParams.set('instId', 'XAG-USDT-SWAP');
    url.searchParams.set('bar', '1m');
    url.searchParams.set('after', String(cursor));
    url.searchParams.set('before', String(start));
    url.searchParams.set('limit', '300');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Argent-Replay/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`OKX returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.code !== '0') throw new Error(payload.msg || `OKX error ${payload.code}`);
    if (!payload.data.length) break;

    rows.push(...payload.data);
    cursor = Number(payload.data[payload.data.length - 1][0]) - 1;
  }

  const candles = rows
    .filter(row => Number(row[0]) >= start && Number(row[0]) < end)
    .map(row => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      minute: Math.floor((Number(row[0]) - start) / 60000),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!candles.length) throw new Error('No XAGUSDT candles exist for this seven-day period');
  cache.set(date, candles);
  return candles;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const date = Array.isArray(request.query.date) ? request.query.date[0] : request.query.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return response.status(400).json({ error: 'Date must use YYYY-MM-DD' });
    }

    const candles = await loadOkxCandles(date);
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return response.status(200).json({
      source: 'OKX',
      instrument: 'XAG-USDT-SWAP',
      timezone: 'UTC',
      days: 7,
      candles,
    });
  } catch (error) {
    console.error('XAG candle request failed:', error);
    return response.status(502).json({ error: error.message || 'Market data request failed' });
  }
};
