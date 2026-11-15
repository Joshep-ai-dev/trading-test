export const DAY = 86400000;
export const dateOf = (timestamp) =>
  new Date(timestamp).toISOString().slice(0, 10);

// Completed UTC days are immutable. Cache Storage survives page reloads.
// Storage is optional: private mode and quota failures fall back to the API.
export async function readLocalDay(date, signal) {
  const url = '/api/candles?date=' + encodeURIComponent(date) + '&days=1';
  const historical = date < dateOf(Date.now());
  let store;
  if (historical) {
    try {
      store = await globalThis.caches?.open('argent-candles-v1');
      const saved = await store?.match(url);
      if (saved) {
        const result = await saved.json();
        if (Array.isArray(result.candles) && result.candles.length) {
          signal?.throwIfAborted();
          return result.candles;
        }
      }
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  const response = await fetch(
    `/api/candles?date=${encodeURIComponent(date)}&days=1`,
    { signal },
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `Candle API returned an invalid response (${response.status}). Check your deployment's /api/candles route.`,
    );
  }
  if (!response.ok)
    throw new Error(result.error || `Market data error (${response.status})`);
  if (!Array.isArray(result.candles)) throw new Error('Candle API returned invalid candle data.');
  signal?.throwIfAborted();
  if (store && result.candles.length) {
    try { await store.put(url, new Response(JSON.stringify({ candles: result.candles }), { headers: { 'Content-Type': 'application/json' } })); } catch {}
  }
  return result.candles;
}

// Bound concurrency so long history requests do not flood the server/exchange.
export async function readDays(days, readDay, signal, concurrency = 3) {
  const chunks = Array(days.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, days.length) }, async () => {
    while (next < days.length) {
      signal?.throwIfAborted();
      const index = next++;
      chunks[index] = await readDay(days[index], signal);
    }
  }));
  return mergeCandles([], chunks.flat());
}

export function mergeCandles(previous, incoming) {
  const candles = new Map(previous.map((candle) => [candle.timestamp, candle]));
  for (const candle of incoming)
    candles.set(candle.timestamp, {
      ...candle,
      minute: candle.timestamp / 60000,
    });
  return [...candles.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function prependHistory(model, incoming) {
  const timestamp = model.candles[model.index]?.timestamp;
  const candles = mergeCandles(model.candles, incoming);
  return {
    ...model,
    candles,
    index:
      timestamp === undefined
        ? 0
        : candles.findIndex((c) => c.timestamp === timestamp),
  };
}
