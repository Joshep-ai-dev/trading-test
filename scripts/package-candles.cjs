// Export only public, completed OHLCV history; never account/runtime records.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');

async function packageCandles(source, destination, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const groups = new Map();
  const files = (await fs.readdir(source)).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  let candles = 0, sourceBytes = 0, packedBytes = 0;
  for (const file of files) {
    const day = file.slice(0, 10);
    if (day >= today) continue;
    const raw = await fs.readFile(path.join(source, file), 'utf8');
    const saved = JSON.parse(raw);
    if (!saved.complete || !Array.isArray(saved.payload?.candles)) continue;
    const start = Date.parse(`${day}T00:00:00Z`);
    const rows = saved.payload.candles.map(bar => [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume]);
    if (rows.some(row => !row.every(Number.isFinite) || row[0] < start || row[0] >= start + 86400000)) throw new Error(`Invalid OHLCV archive: ${file}`);
    rows.sort((a, b) => a[0] - b[0]);
    const month = day.slice(0, 7);
    if (!groups.has(month)) groups.set(month, {});
    groups.get(month)[day] = rows;
    candles += rows.length; sourceBytes += Buffer.byteLength(raw);
  }
  await fs.mkdir(destination, { recursive: true });
  const manifest = { version: 1, days: {}, candles };
  for (const [month, days] of groups) {
    const packed = gzipSync(JSON.stringify({ version: 1, days }), { level: 9 });
    const hash = createHash('sha256').update(packed).digest('hex').slice(0, 12);
    const file = `${month}-${hash}.json.gz`;
    await fs.writeFile(path.join(destination, file), packed);
    for (const day of Object.keys(days)) manifest.days[day] = `/candle-archive/${file}`;
    packedBytes += packed.length;
  }
  // Write the index last, so readers never see references to unwritten chunks.
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest));
  return { days: Object.keys(manifest.days).length, chunks: groups.size, candles, sourceBytes, packedBytes };
}

module.exports = { packageCandles };
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  packageCandles(path.join(root, '.candle-data'), path.join(root, 'public', 'candle-archive'))
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
