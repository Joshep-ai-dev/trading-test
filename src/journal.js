export const JOURNAL_KEY = 'argent-trading-journal-v1';

export function readJournal(storage) {
  try {
    storage ??= globalThis.localStorage;
    const journal = JSON.parse(storage.getItem(JOURNAL_KEY));
    if (!journal || journal.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(journal.date) || !Number.isFinite(journal.balance) || !Array.isArray(journal.positions) || !Array.isArray(journal.history) || !Array.isArray(journal.fills) || !Number.isInteger(journal.nextId) || journal.nextId < 1 || !Number.isFinite(journal.timestamp)) return null;
    return journal;
  } catch { return null; }
}

export function writeJournal(model, date, storage = globalThis.localStorage) {
  const timestamp = model.candles[model.index]?.timestamp;
  if (timestamp === undefined) return;
  storage.setItem(JOURNAL_KEY, JSON.stringify({ version: 1, date, timestamp, balance: model.balance, nextId: model.nextId, positions: model.positions, history: model.history, fills: model.fills || [], savedAt: Date.now() }));
}

export function journalCsv(fills) {
  const rows = [['Time (UTC)', 'Position ID', 'Market', 'Action', 'Side', 'Price (USDT)', 'Quantity (XAG)', 'Value (USDT)', 'Fee (USDT)', 'Net PnL (USDT)', 'Reason']];
  for (const fill of fills) rows.push([new Date(fill.timestamp).toISOString(), fill.positionId, 'XAGUSDT', fill.action, fill.side, fill.price, fill.quantity, fill.price * fill.quantity, fill.fee || 0, fill.profit, fill.reason]);
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
