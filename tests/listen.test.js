const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { listenAvailable } = require('../lib/listen');

test('busy default port falls back and serves requests at the returned port', async t => {
  const occupied = http.createServer();
  await listenAvailable(occupied, { port: 0 });
  t.after(() => occupied.close());
  const server = http.createServer((req, res) => res.end('ready'));
  t.after(() => server.close());
  const retries = [];
  const port = await listenAvailable(server, { port: occupied.address().port, onRetry: port => retries.push(port) });
  assert.ok(port > occupied.address().port);
  assert.equal(retries[0], occupied.address().port);
  assert.equal(await (await fetch(`http://localhost:${port}`)).text(), 'ready');
});

test('explicit busy port returns a handled error; invalid ports are rejected', async t => {
  const occupied = http.createServer();
  await listenAvailable(occupied, { port: 0 });
  t.after(() => occupied.close());
  const server = http.createServer();
  await assert.rejects(listenAvailable(server, { port: occupied.address().port, fallback: false }), error => error.code === 'EADDRINUSE' && /already in use/.test(error.message));
  assert.equal(server.listening, false);
  await assert.rejects(listenAvailable(server, { port: NaN }), /PORT must/);
});
