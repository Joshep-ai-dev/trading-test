export const INITIAL_BALANCE = 10000;
export const FEE_RATE = 0.0006;
export const pnl = (position, price) => (position.side === 'LONG' ? price - position.entry : position.entry - price) * position.quantity;

export function closeTrade(model, id, price, timestamp, reason = 'Market close') {
  const position = model.positions.find(item => item.id === id);
  if (!position) return model;
  const grossProfit = pnl(position, price), exitFee = price * position.quantity * FEE_RATE;
  const entryFee = position.entryFee || 0, fees = entryFee + exitFee;
  const profit = grossProfit - fees;
  return { ...model, balance: model.balance + grossProfit - exitFee,
    fills: [{ id: `${position.id}:close`, positionId: position.id, action: `Close ${position.side.toLowerCase()}`, side: position.side === 'LONG' ? 'SELL' : 'BUY', price, quantity: position.quantity, timestamp, fee: exitFee, profit: grossProfit - exitFee, reason }, ...(model.fills || [])],
    positions: model.positions.filter(item => item.id !== id),
    history: [{ ...position, exit: price, closeTime: timestamp, grossProfit, exitFee, fees, profit, reason }, ...model.history] };
}

export function settleCandle(model, candle) {
  let next = model;
  for (const position of model.positions) {
    const long = position.side === 'LONG';
    const stops = [position.sl && { price: position.sl, reason: 'Stop loss' }, position.trailingStop && { price: position.trailingStop, reason: 'Trailing stop' }].filter(Boolean);
    stops.sort((a, b) => long ? b.price - a.price : a.price - b.price);
    const stop = stops[0];
    if (long ? candle.low <= position.liquidation : candle.high >= position.liquidation) next = closeTrade(next, position.id, position.liquidation, candle.timestamp, 'Liquidated');
    else if (stop && (long ? candle.low <= stop.price : candle.high >= stop.price)) {
      const fill = Number.isFinite(candle.open) ? (long ? Math.min(stop.price, candle.open) : Math.max(stop.price, candle.open)) : stop.price;
      next = closeTrade(next, position.id, fill, candle.timestamp, stop.reason);
    } else if (position.tp && (long ? candle.high >= position.tp : candle.low <= position.tp)) next = closeTrade(next, position.id, position.tp, candle.timestamp, 'Take profit');
    else if (position.trailingPercent) {
      // Ratchet only after evaluating existing stops: OHLC does not reveal intrabar order.
      const anchor = long ? Math.max(position.trailingAnchor, candle.close) : Math.min(position.trailingAnchor, candle.close);
      const trailingStop = anchor * (1 + (long ? -1 : 1) * position.trailingPercent / 100);
      next = { ...next, positions: next.positions.map(p => p.id === position.id ? { ...p, trailingAnchor: anchor, trailingStop } : p) };
    }
  }
  return next;
}

export function protectionPrice(input, side, entry, quantity, entryFee, kind) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return input;
  const { value, unit } = input;
  if (!Number.isFinite(value) || value <= 0) throw new Error('TP/SL target must be a positive number');
  const direction = side === 'LONG' ? 1 : -1, targetSign = kind === 'tp' ? 1 : -1;
  if (unit === 'price') return value;
  if (unit === 'percent') return entry * (1 + direction * targetSign * value / 100);
  if (unit === 'usdt') return (targetSign * value + direction * entry * quantity + entryFee) / (quantity * (direction - FEE_RATE));
  throw new Error('Choose price, percent, or USDT for TP/SL');
}

function validateProtection(side, price, sl, tp, trailingPercent) {
  const long = side === 'LONG';
  if (sl !== null && sl !== undefined && (!Number.isFinite(sl) || sl <= 0 || (long ? sl >= price : sl <= price))) throw new Error('Stop loss must be beyond the current price');
  if (tp !== null && tp !== undefined && (!Number.isFinite(tp) || tp <= 0 || (long ? tp <= price : tp >= price))) throw new Error('Take profit must be beyond the current price');
  if (trailingPercent !== null && trailingPercent !== undefined && (!Number.isFinite(trailingPercent) || trailingPercent <= 0 || trailingPercent >= 100)) throw new Error('Trailing distance must be greater than 0% and less than 100%');
}

export function updateProtection(model, id, sl, tp, trailingPercent) {
  const position = model.positions.find(p => p.id === id);
  const price = model.candles[model.index]?.close;
  if (!position || !price) throw new Error('Position unavailable');
  sl = protectionPrice(sl, position.side, position.entry, position.quantity, position.entryFee || 0, 'sl');
  tp = protectionPrice(tp, position.side, position.entry, position.quantity, position.entryFee || 0, 'tp');
  validateProtection(position.side, price, sl, tp, trailingPercent);
  const unchanged = trailingPercent && trailingPercent === position.trailingPercent;
  const trailingAnchor = trailingPercent ? (unchanged ? position.trailingAnchor : price) : null;
  const trailingStop = trailingPercent ? (unchanged ? position.trailingStop : price * (1 + (position.side === 'LONG' ? -1 : 1) * trailingPercent / 100)) : null;
  return { ...model, positions: model.positions.map(p => p.id === id ? { ...p, sl, tp, trailingPercent, trailingAnchor, trailingStop } : p) };
}

export function enterTrade(model, side, margin, leverage, sl, tp, trailingPercent = null) {
  const candle = model.candles[model.index];
  if (!candle) throw new Error('Load local candles first');
  if (!Number.isFinite(margin) || margin <= 0 || ![1, 2, 5, 10, 20, 50].includes(leverage)) throw new Error('Enter a valid margin and leverage');
  const long = side === 'LONG', entry = candle.close + (long ? .003 : -.003);
  const equity = model.balance + model.positions.reduce((sum, p) => sum + pnl(p, candle.close), 0);
  const used = model.positions.reduce((sum, p) => sum + p.margin, 0);
  const notional = margin * leverage, entryFee = notional * FEE_RATE;
  if (margin + entryFee > equity - used) throw new Error('Insufficient free margin including entry fee');
  sl = protectionPrice(sl, side, entry, notional / entry, entryFee, 'sl');
  tp = protectionPrice(tp, side, entry, notional / entry, entryFee, 'tp');
  validateProtection(side, candle.close, sl, tp, trailingPercent);
  return { ...model, balance: model.balance - entryFee, nextId: model.nextId + 1,
    fills: [{ id: `${model.nextId}:open`, positionId: model.nextId, action: `Open ${side.toLowerCase()}`, side: long ? 'BUY' : 'SELL', price: entry, quantity: notional / entry, timestamp: candle.timestamp, fee: entryFee, profit: -entryFee, reason: 'Market order' }, ...(model.fills || [])],
    positions: [...model.positions, {
    id: model.nextId, side, entry, margin, leverage, notional, entryFee, quantity: notional / entry,
    liquidation: entry + (long ? -entry / leverage : entry / leverage), sl, tp, trailingPercent,
    trailingAnchor: trailingPercent ? candle.close : null,
    trailingStop: trailingPercent ? candle.close * (1 + (long ? -1 : 1) * trailingPercent / 100) : null, openTime: candle.timestamp,
  }] };
}
