const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const { loadCandles, dateRange } = require('./lib/candles');

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/candles')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const query = new URL(req.url, 'http://localhost').searchParams;
      const date = query.get('date'), days = query.get('days') ?? undefined;
      try { dateRange(date, days); } catch (error) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: error.message }));
      }
      res.end(JSON.stringify(await loadCandles(date, days)));
    } catch (error) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      res.writeHead(error.status || 502);
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
