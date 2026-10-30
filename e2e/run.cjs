const { spawn } = require('node:child_process');
const path = require('node:path');

async function run() {
  const server = spawn(process.execPath, ['server.js', '--production'], { env: { ...process.env, PORT: '4180' }, stdio: 'inherit' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Test server could not start; check that port 4180 is free.');
      try {
        const response = await fetch('http://localhost:4180/api/local-data', { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Test server did not become ready.');
    const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
    const tests = spawn(process.execPath, [cli, 'test'], { stdio: 'inherit' });
    process.exitCode = await new Promise((resolve, reject) => { tests.once('error', reject); tests.once('exit', code => resolve(code ?? 1)); });
  } finally { server.kill(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
