export const DAY = 86400000;
export const dateOf = timestamp => new Date(timestamp).toISOString().slice(0, 10);

export async function readLocalDay(date, signal) {
  const response = await fetch(`/api/candles?date=${encodeURIComponent(date)}&days=1`, { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Local data error (${response.status})`);
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
