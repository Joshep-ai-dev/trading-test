const path = require('node:path');
const { createArchive } = require('./lib/archive');
const { loadCandles } = require('./lib/candles');

const directory = path.join(__dirname, '.candle-data');
const archive = createArchive({ directory, loadCandles });
console.log(`Saving OKX XAG-USDT-SWAP 1-minute candles to ${directory}`);
const progress = setInterval(() => {
  console.log(`Saved ${archive.status.completedDays}/${archive.status.totalDays} UTC days`);
}, 15000);
archive.sync().then(() => {
  clearInterval(progress);
  if (archive.status.error) {
    console.error(`Download incomplete: ${archive.status.error}. Run npm run download:data to resume.`);
    process.exitCode = 1;
  } else console.log(`Download complete: ${archive.status.completedDays} days saved. Last sync ${archive.status.lastSync}`);
}).catch(error => {
  clearInterval(progress);
  console.error(error.message);
  process.exitCode = 1;
});
