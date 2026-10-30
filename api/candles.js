const { dateRange } = require('../lib/candles');

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
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).json({ error: 'Local-only replay requires npm start on the computer holding .candle-data. Use Sync data there to download candles.' });
  } catch (error) {
    console.error('XAG candle request failed:', error);
    if (error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    return response.status(error.status || 502).json({ error: error.message || 'Market data request failed' });
  }
};
