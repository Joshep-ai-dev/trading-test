const { loadCandles } = require('../lib/candles');
const { FIRST_DATE } = require('../lib/hosted');

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const status = { mode: 'hosted', running: false, firstDate: FIRST_DATE, completedDays: 0, totalDays: 0, lastSync: null, latestCandle: null, nextSync: null, error: null };
  if (request.method === 'GET') return response.status(200).json(status);
  try {
    const payload = await loadCandles(new Date().toISOString().slice(0, 10), 1);
    const latest = payload.candles.at(-1)?.timestamp;
    return response.status(200).json({ ...status, completedDays: 1, totalDays: 1, lastSync: new Date().toISOString(), latestCandle: latest === undefined ? null : new Date(latest).toISOString(), nextSync: new Date(Date.now() + 600000).toISOString() });
  } catch (error) {
    if (error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    return response.status(error.status || 502).json({ error: error.message || 'OKX refresh failed' });
  }
};
