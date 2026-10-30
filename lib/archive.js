const fs = require('node:fs/promises');
const path = require('node:path');
const { dateRange } = require('./candles');

const DAY = 86400000;
const INTERVAL = 10 * 60000;

function createArchive({ directory, loadCandles, now = Date.now, firstDate = '2026-01-28' }) {
  const first = dateRange(firstDate, 1).start;
  const pending = new Map();
  const status = { running: false, firstDate, completedDays: 0, totalDays: 0, lastSync: null, latestCandle: null, nextSync: null, error: null };
  let active;

  async function readDay(start, refresh = false) {
    if (pending.has(start)) return pending.get(start);
    const work = (async () => {
      const date = new Date(start).toISOString().slice(0, 10);
      const file = path.join(directory, `${date}.json`);
      let saved;
      try { saved = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      if (saved && !refresh && (saved.complete || now() - saved.savedAt < INTERVAL)) return saved.payload;
      // Never ask the exchange for future days or persist them as completed.
      if (start > now()) return { source: 'OKX', ...dateRange(date, 1), candles: [] };
      try {
        const payload = await loadCandles(date, 1);
        const merged = new Map((saved?.payload.candles || []).map(c => [c.timestamp, c]));
        for (const candle of payload.candles) merged.set(candle.timestamp, candle);
        payload.candles = [...merged.values()].sort((a, b) => a.timestamp - b.timestamp);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(`${file}.tmp`, JSON.stringify({ savedAt: now(), complete: start + DAY <= now(), payload }));
        await fs.rename(`${file}.tmp`, file);
        return payload;
      } catch (error) {
        if (saved && !refresh) return { ...saved.payload, stale: true };
        throw error;
      }
    })().finally(() => pending.delete(start));
    pending.set(start, work);
    return work;
  }

  async function load(date, days) {
    const range = dateRange(date, days);
    const chunks = [];
    let stale = false;
    for (let start = range.start; start < range.end; start += DAY) {
      const file = path.join(directory, `${new Date(start).toISOString().slice(0, 10)}.json`);
      let saved;
      try { saved = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        const missing = new Error(`No local candles saved for ${new Date(start).toISOString().slice(0, 10)}. Use Sync data to download them first.`);
        missing.status = 404;
        throw missing;
      }
      const result = saved.payload;
      result.stale = !saved.complete && now() - saved.savedAt >= INTERVAL;
      stale ||= !!result.stale;
      chunks.push(result.candles);
    }
    return { source: 'OKX', instrument: 'XAG-USDT-SWAP', timezone: 'UTC', ...range, stale,
      candles: chunks.flat().map(c => ({ ...c, minute: (c.timestamp - range.start) / 60000 })) };
  }

  function sync() {
    if (active) return active;
    status.running = true;
    status.error = null;
    active = (async () => {
      const today = Math.floor(now() / DAY) * DAY;
      status.totalDays = Math.max(0, Math.floor((today - first) / DAY) + 1);
      status.completedDays = 0;
      // Recent data first, then fill missing historical days without downloading them again.
      for (let start = today; start >= first; start -= DAY) {
        const payload = await readDay(start, start >= today - DAY);
        const latest = payload.candles.at(-1)?.timestamp;
        if (latest !== undefined && (!status.latestCandle || latest > Date.parse(status.latestCandle))) status.latestCandle = new Date(latest).toISOString();
        status.completedDays++;
      }
      status.lastSync = new Date(now()).toISOString();
    })().catch(error => { status.error = error.message; })
      .finally(() => { status.running = false; status.nextSync = new Date(now() + INTERVAL).toISOString(); active = null; });
    return active;
  }

  async function download(date, days = 7) {
    const range = dateRange(date, days);
    for (let start = range.start; start < range.end; start += DAY) {
      if (start > now()) break;
      await readDay(start);
    }
    return { date, days: range.days, saved: true };
  }

  async function catalog() {
    let files;
    try { files = await fs.readdir(directory); }
    catch (error) { if (error.code === 'ENOENT') return { dates: [] }; throw error; }
    const dates = files.filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).map(file => file.slice(0, 10)).sort();
    let latestCandle = null;
    for (const date of [...dates].reverse()) {
      try {
        const saved = JSON.parse(await fs.readFile(path.join(directory, `${date}.json`), 'utf8'));
        const timestamp = saved.payload?.candles?.at(-1)?.timestamp;
        if (Number.isFinite(timestamp)) { latestCandle = new Date(timestamp).toISOString(); break; }
      } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    }
    return { dates, latestCandle };
  }

  return { load, sync, download, catalog, status };
}

module.exports = { createArchive, INTERVAL };
