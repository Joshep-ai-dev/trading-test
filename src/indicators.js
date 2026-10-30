export const INDICATOR_DEFINITIONS = {
  rsi: { name: 'RSI', pane: true, fields: { period: ['Length', 14, 2, 500, 1] } },
  macd: { name: 'MACD', pane: true, fields: { fast: ['Fast length', 12, 2, 500, 1], slow: ['Slow length', 26, 3, 500, 1], signal: ['Signal length', 9, 2, 500, 1] } },
  atr: { name: 'ATR', pane: true, fields: { period: ['Length', 14, 2, 500, 1] } },
  adx: { name: 'ADX', pane: true, fields: { period: ['DI length', 14, 2, 500, 1], smoothing: ['ADX smoothing', 14, 2, 500, 1] } },
  supertrend: { name: 'Supertrend', pane: false, fields: { period: ['ATR length', 10, 2, 500, 1], multiplier: ['Factor', 3, .1, 20, .1] } },
  bb: { name: 'Bollinger Bands', pane: false, fields: { period: ['Length', 20, 2, 500, 1], deviations: ['Standard deviations', 2, .1, 10, .1] } },
};
const COLORS = { rsi: '#b196ee', macd: '#6bb6ef', atr: '#66cddd', adx: '#e4b56a', supertrend: '#64d6b1', bb: '#719ee0' };
export const DEFAULT_INDICATORS = Object.fromEntries(Object.entries(INDICATOR_DEFINITIONS).map(([key, definition]) => [key, { enabled: key === 'rsi' || key === 'macd', hidden: false, color: COLORS[key], lineWidth: 1, showValue: true, ...Object.fromEntries(Object.entries(definition.fields).map(([field, settings]) => [field, settings[1]])) }]));

export function validateIndicators(config) {
  const result = {};
  for (const [key, definition] of Object.entries(INDICATOR_DEFINITIONS)) {
    const color = config[key]?.color ?? COLORS[key], lineWidth = Number(config[key]?.lineWidth ?? 1);
    if (!/^#[0-9a-f]{6}$/i.test(color) || !Number.isFinite(lineWidth) || lineWidth < 1 || lineWidth > 4) throw new Error(`${definition.name}: choose a valid color and line width between 1 and 4.`);
    result[key] = { enabled: !!config[key]?.enabled, hidden: !!config[key]?.hidden, color, lineWidth, showValue: config[key]?.showValue !== false };
    for (const [field, [label, , min, max, step]] of Object.entries(definition.fields)) {
      const value = Number(config[key]?.[field]);
      if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) throw new Error(`${definition.name}: ${label} must be ${step === 1 ? 'an integer ' : ''}between ${min} and ${max}.`);
      result[key][field] = value;
    }
  }
  if (result.macd.fast >= result.macd.slow) throw new Error('MACD: Fast length must be smaller than slow length.');
  return result;
}

export function readIndicatorSettings() {
  try { const value = localStorage.getItem('argent-indicator-settings'); if (value) return validateIndicators(JSON.parse(value)); } catch {}
  return structuredClone(DEFAULT_INDICATORS);
}

function average(values, period, alpha) {
  const result = Array(values.length).fill(null);
  let sum = 0, count = 0, previous = null;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    if (previous === null) { sum += values[i]; count++; if (count === period) previous = sum / period; }
    else previous += alpha * (values[i] - previous);
    result[i] = previous;
  }
  return result;
}
export const rma = (values, period) => average(values, period, 1 / period);
export const ema = (values, period) => average(values, period, 2 / (period + 1));
export const trueRange = bars => bars.map((bar, i) => i ? Math.max(bar.high - bar.low, Math.abs(bar.high - bars[i - 1].close), Math.abs(bar.low - bars[i - 1].close)) : bar.high - bar.low);
export const atr = (bars, period = 14) => rma(trueRange(bars), period);

export function rsi(values, period = 14) {
  const changes = values.map((value, i) => i ? value - values[i - 1] : null);
  const gains = rma(changes.map(value => value === null ? null : Math.max(0, value)), period);
  const losses = rma(changes.map(value => value === null ? null : Math.max(0, -value)), period);
  return gains.map((gain, i) => gain === null ? null : losses[i] === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / losses[i]));
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => f[i] === null || s[i] === null ? null : f[i] - s[i]);
  const signal = ema(line, signalPeriod);
  return { line, signal, histogram: line.map((value, i) => value === null || signal[i] === null ? null : value - signal[i]) };
}

export function adx(bars, period = 14, smoothing = 14) {
  const plus = [null], minus = [null], ranges = trueRange(bars);
  if (!bars.length) return { line: [], plus: [], minus: [] };
  ranges[0] = null;
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high, down = bars[i - 1].low - bars[i].low;
    plus.push(up > down && up > 0 ? up : 0); minus.push(down > up && down > 0 ? down : 0);
  }
  const tr = rma(ranges, period), p = rma(plus, period), m = rma(minus, period);
  const plusDI = p.map((value, i) => value === null ? null : tr[i] ? value / tr[i] * 100 : 0);
  const minusDI = m.map((value, i) => value === null ? null : tr[i] ? value / tr[i] * 100 : 0);
  const dx = plusDI.map((value, i) => value === null ? null : value + minusDI[i] ? 100 * Math.abs(value - minusDI[i]) / (value + minusDI[i]) : 0);
  return { line: rma(dx, smoothing), plus: plusDI, minus: minusDI };
}

export function bollinger(values, period = 20, deviations = 2) {
  const basis = Array(values.length).fill(null), upper = [...basis], lower = [...basis];
  const reference = values[0] || 0;
  let sum = 0, squares = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i] - reference;
    sum += value; squares += value * value;
    if (i >= period) { const old = values[i - period] - reference; sum -= old; squares -= old * old; }
    if (i < period - 1) continue;
    const mean = sum / period, deviation = Math.sqrt(Math.max(0, squares / period - mean * mean));
    basis[i] = mean + reference; upper[i] = basis[i] + deviations * deviation; lower[i] = basis[i] - deviations * deviation;
  }
  return { basis, upper, lower };
}

export function supertrend(bars, period = 10, multiplier = 3) {
  const volatility = atr(bars, period), line = Array(bars.length).fill(null), up = [...line], down = [...line];
  let upper = null, lower = null, direction = 1;
  for (let i = 0; i < bars.length; i++) {
    if (volatility[i] === null) continue;
    const mid = (bars[i].high + bars[i].low) / 2, basicUpper = mid + multiplier * volatility[i], basicLower = mid - multiplier * volatility[i];
    if (upper === null) { upper = basicUpper; lower = basicLower; }
    else {
      upper = basicUpper < upper || bars[i - 1].close > upper ? basicUpper : upper;
      lower = basicLower > lower || bars[i - 1].close < lower ? basicLower : lower;
      direction = direction === 1 ? bars[i].close > upper ? -1 : 1 : bars[i].close < lower ? 1 : -1;
    }
    line[i] = direction === -1 ? lower : upper;
    if (direction === -1) up[i] = line[i]; else down[i] = line[i];
  }
  return { line, up, down };
}

export function calculateIndicators(bars, config) {
  const closes = bars.map(bar => bar.close), result = {};
  for (const [key, settings] of Object.entries(config)) {
    if (!settings.enabled) continue;
    if (key === 'rsi') result.rsi = rsi(closes, settings.period);
    if (key === 'macd') result.macd = macd(closes, settings.fast, settings.slow, settings.signal);
    if (key === 'atr') result.atr = atr(bars, settings.period);
    if (key === 'adx') result.adx = adx(bars, settings.period, settings.smoothing);
    if (key === 'bb') result.bb = bollinger(closes, settings.period, settings.deviations);
    if (key === 'supertrend') result.supertrend = supertrend(bars, settings.period, settings.multiplier);
  }
  return result;
}

export function indicatorLayout(height, config, requested = {}, visible = true, order = []) {
  const ordered = [...new Set([...order, ...Object.keys(INDICATOR_DEFINITIONS)])];
  const keys = visible ? ordered.filter(key => INDICATOR_DEFINITIONS[key]?.pane && config[key].enabled) : [];
  const minimum = keys.length ? Math.min(40, Math.max(24, (height - 54 - keys.length * 18 - 90) / keys.length)) : 40;
  const budget = Math.max(keys.length * minimum, height - 150 - 54 - keys.length * 18);
  const sizes = Object.fromEntries(keys.map(key => [key, Math.max(minimum, Math.min(500, requested[key] || (key === 'macd' ? 100 : 70)))]));
  const total = Object.values(sizes).reduce((sum, value) => sum + value, 0);
  if (total > budget) { const scale = (budget - keys.length * minimum) / (total - keys.length * minimum || 1); for (const key of keys) sizes[key] = minimum + (sizes[key] - minimum) * scale; }
  const bottom = height - 54 - Object.values(sizes).reduce((sum, value) => sum + value, 0) - keys.length * 18;
  let y = bottom;
  const panes = keys.map(key => { const pane = { key, divider: y + 9, top: y + 18, bottom: y + 18 + sizes[key], height: sizes[key] }; y = pane.bottom; return pane; });
  return { bottom, panes, budget, minimum, ...sizes };
}
