// Hashed, compressed static packs avoid rebuilding completed days via OKX.
export function createPackedArchive(manifestUrl) {
  if (typeof manifestUrl !== 'string' || !manifestUrl.startsWith('/candle-archive/')) return null;
  let manifest;
  const chunks = new Map();
  return {
    async readDay(day, signal) {
      signal?.throwIfAborted();
      // Shared downloads survive a replay-date change; aborted callers cannot
      // poison the next session's cache. Requests have their own finite timeout.
      manifest ??= fetch(manifestUrl, { signal: AbortSignal.timeout(15000) })
        .then(response => response.ok ? response.json() : null)
        .then(value => value?.version === 1 && value.days ? value.days : null)
        .catch(() => null);
      const index = await manifest;
      signal?.throwIfAborted();
      const url = index?.[day];
      if (typeof url !== 'string' || !/^\/candle-archive\/\d{4}-\d{2}-[a-f0-9]{12}\.json\.gz$/.test(url)) return null;
      if (!chunks.has(url)) chunks.set(url, fetch(url, { signal: AbortSignal.timeout(30000) })
        .then(response => { if (!response.ok) throw new Error('Static history unavailable'); return response.json(); })
        .then(value => value?.version === 1 && value.days ? value.days : null)
        .catch(() => null));
      const payload = await chunks.get(url);
      signal?.throwIfAborted();
      const rows = payload?.[day];
      if (!Array.isArray(rows)) return null;
      const start = Date.parse(`${day}T00:00:00Z`);
      if (rows.some(row => !Array.isArray(row) || row.length !== 6 || !row.every(Number.isFinite) || row[0] < start || row[0] >= start + 86400000)) return null;
      return rows.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, minute: timestamp / 60000, open, high, low, close, volume }));
    },
  };
}
