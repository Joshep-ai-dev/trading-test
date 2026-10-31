export const DAY = 86400000;
export const dateOf = timestamp => new Date(timestamp).toISOString().slice(0, 10);

export async function readLocalDay(date, signal) {
  const response = await fetch(`/api/candles?date=${encodeURIComponent(date)}&days=1`, { signal });
  let result;
  try { result = await response.json(); } catch { throw new Error(`Candle API returned an invalid response (${response.status}). Check your deployment's /api/candles route.`); }
  if (!response.ok) throw new Error(result.error || `Market data error (${response.status})`);
  return result.candles;
}

export function mergeCandles(previous, incoming) {
  const candles = new Map(previous.map(candle => [candle.timestamp, candle]));
  for (const candle of incoming) candles.set(candle.timestamp, { ...candle, minute: candle.timestamp / 60000 });
  return [...candles.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function prependHistory(model, incoming) {
  const timestamp = model.candles[model.index]?.timestamp;
  const candles = mergeCandles(model.candles, incoming);
  return { ...model, candles, index: timestamp === undefined ? 0 : candles.findIndex(c => c.timestamp === timestamp) };
}
