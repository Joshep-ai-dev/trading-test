(function(root) {
  function monthEnd(start) {
    const date = new Date(start), day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.getTime();
  }

  function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(Math.max(raw, 0.01)));
    return [1, 2, 5, 10].find(value => value * power >= raw) * power;
  }

  function priceTicks(min, max, height, requested = 0) {
    const step = Math.max(requested || niceStep((max - min) / Math.max(2, height / 40)), niceStep((max - min) / 500));
    const first = Math.ceil((min - step * 1e-8) / step);
    const last = Math.floor((max + step * 1e-8) / step);
    const labelEvery = Math.max(1, Math.ceil(24 / (height * step / (max - min))));
    const ticks = [];
    for (let i = first; i <= last; i++) ticks.push({ price: Number((i * step).toFixed(8)), label: i % labelEvery === 0 });
    return ticks;
  }

  function timeStep(barMinutes, pixelsPerBar, requested = 0) {
    if (requested) return Math.max(barMinutes, requested);
    const target = barMinutes * 78 / pixelsPerBar;
    return [1, 2, 5, 10, 15, 30, 60, 120, 240, 360, 720, 1440, 2880, 10080, 43200].find(step => step >= target) || 43200;
  }

  function seekIndex(candles, timestamp) {
    if (!candles.length || !Number.isFinite(timestamp) || timestamp < candles[0].timestamp || timestamp > candles[candles.length - 1].timestamp) return -1;
    let low = 0, high = candles.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (candles[middle].timestamp < timestamp) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  const formatters = new Map();
  function zonedTime(timestamp, timeZone) {
    if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    }));
    const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(timestamp).map(part => [part.type, part.value]));
    const value = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    return { value, name: parts.timeZoneName, wallTimestamp: Date.parse(`${value}Z`) };
  }

  function zonedCandidates(value, timeZone) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return [];
    const wall = Date.parse(`${value}:00Z`);
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) return [];
    const candidates = new Set();
    // Try offsets on both sides of a daylight-saving transition, then round-trip.
    for (const hours of [-36, -12, 0, 12, 36]) {
      const sample = wall + hours * 3600000;
      const offset = zonedTime(sample, timeZone).wallTimestamp - sample;
      const timestamp = wall - offset;
      if (zonedTime(timestamp, timeZone).value.slice(0, 16) === value) candidates.add(timestamp);
    }
    return [...candidates].sort((a, b) => a - b);
  }

  const helpers = { monthEnd, niceStep, priceTicks, timeStep, seekIndex, zonedTime, zonedCandidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else root.ChartUtils = helpers;
})(globalThis);
