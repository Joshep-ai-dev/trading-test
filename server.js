const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const candleCache = new Map();

async function getOkxCandles(date) {
  if (candleCache.has(date)) return candleCache.get(date);
  const start = Date.parse(`${date}T00:00:00Z`), end = start + 7 * 86400000;
  if (!Number.isFinite(start)) throw new Error('Invalid date');
  let cursor = end, rows = [];
  for (let page = 0; page < 36 && cursor > start; page++) {
    const url = new URL('https://www.okx.com/api/v5/market/history-candles');
    url.searchParams.set('instId', 'XAG-USDT-SWAP');
    url.searchParams.set('bar', '1m');
    url.searchParams.set('after', String(cursor));
    url.searchParams.set('before', String(start));
    url.searchParams.set('limit', '300');
    const response = await fetch(url, { headers: { 'User-Agent': 'Argent-Replay/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`OKX returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.code !== '0') throw new Error(payload.msg || `OKX error ${payload.code}`);
    if (!payload.data.length) break;
    rows.push(...payload.data);
    cursor = Number(payload.data[payload.data.length - 1][0]) - 1;
  }
  const candles = rows.filter(r => Number(r[0]) >= start && Number(r[0]) < end).map(r => ({ timestamp:Number(r[0]), open:Number(r[1]), high:Number(r[2]), low:Number(r[3]), close:Number(r[4]), volume:Number(r[5]), minute:Math.floor((Number(r[0])-start)/60000) })).sort((a,b)=>a.timestamp-b.timestamp);
  if (!candles.length) throw new Error('No XAGUSDT candles exist for this seven-day period');
  candleCache.set(date, candles);
  return candles;
}

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/candles')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const date = new URL(req.url, 'http://localhost').searchParams.get('date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Date must use YYYY-MM-DD');
      res.end(JSON.stringify({ source:'OKX', instrument:'XAG-USDT-SWAP', timezone:'UTC', days:7, candles:await getOkxCandles(date) }));
    } catch (error) {
      res.writeHead(502);
      res.end(JSON.stringify({ error:error.message }));
    }
    return;
  }
  const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(process.env.PORT || 4173, () => console.log(`Argent Replay running at http://localhost:${process.env.PORT || 4173}`));
