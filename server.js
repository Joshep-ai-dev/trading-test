const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const { loadCandles, dateRange } = require('./lib/candles');
const { createArchive, INTERVAL } = require('./lib/archive');
const { listenAvailable } = require('./lib/listen');
const archive = createArchive({ directory: path.join(root, '.candle-data'), loadCandles });
async function start() {
  const production = process.argv.includes('--production');
  let vite = null;
  const staticRoot = production ? path.join(root, 'dist') : root;

  const server = http.createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/api/local-data') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try { return res.end(JSON.stringify(await archive.catalog())); }
      catch (error) { return res.writeHead(500).end(JSON.stringify({ error: error.message })); }
    }
    if (req.url.split('?')[0] === '/api/sync') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'POST') {
        const query = new URL(req.url, 'http://localhost').searchParams;
        if (query.has('date')) {
          try {
            const date = query.get('date'), days = query.get('days') || '7';
            try { dateRange(date, days); } catch (error) { error.status = 400; throw error; }
            return res.end(JSON.stringify(await archive.download(date, days)));
          } catch (error) {
            res.writeHead(error.status || 502);
            return res.end(JSON.stringify({ error: error.message }));
          }
        }
        archive.sync();
      }
      else if (req.method !== 'GET') return res.writeHead(405, { Allow: 'GET, POST' }).end();
      return res.end(JSON.stringify(archive.status));
    }
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
        res.end(JSON.stringify(await archive.load(date, days)));
      } catch (error) {
        if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
        res.writeHead(error.status || 502);
        res.end(JSON.stringify({ error:error.message }));
      }
      return;
    }
    const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const file = path.normalize(path.join(staticRoot, pathname));
    if (!file.startsWith(staticRoot + path.sep) || path.relative(staticRoot, file).split(path.sep).some(part => part.startsWith('.') && !(vite && part === '.vite'))) return res.writeHead(403).end('Forbidden');
    if (vite) return vite.middlewares(req, res);
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end('Not found');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  if (!production) {
    vite = await (await import('vite')).createServer({
      server: { middlewareMode: true, ws: { server } },
      appType: 'spa',
    });
  }
  let syncTimer;
  async function shutdown() {
    clearInterval(syncTimer);
    server.closeAllConnections();
    server.close();
    const fallback = setTimeout(() => process.exit(0), 1000);
    fallback.unref();
    await vite?.close();
    process.exit(0);
  }
  let port;
  try {
    port = await listenAvailable(server, {
      port: Number(process.env.PORT ?? 4173),
      fallback: process.env.PORT === undefined,
      onRetry: (occupied, next) => console.log(`Port ${occupied} is in use; trying ${next}…`),
    });
  } catch (error) { await vite?.close(); throw error; }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`Argent Replay running at http://localhost:${port}`);
  archive.sync();
  syncTimer = setInterval(() => archive.sync(), INTERVAL);
  syncTimer.unref();
}
start().catch(error => { console.error(`Unable to start Argent Replay: ${error.message}`); process.exitCode = 1; });
