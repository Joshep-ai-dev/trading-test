const { loadCandles, dateRange } = require('../lib/candles');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const date = request.query.date;
  const days = request.query.days;
  try { dateRange(date, days); } catch (error) {
    return response.status(400).json({ error: error.message });
  }
  try {
    const payload = await loadCandles(date, days);
    response.setHeader('Cache-Control', payload.end <= Date.now()
      ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store');
    return response.status(200).json(payload);
  } catch (error) {
    console.error('XAG candle request failed:', error);
    return response.status(502).json({ error: error.message || 'Market data request failed' });
  }
};
