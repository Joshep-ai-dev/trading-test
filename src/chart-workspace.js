export const DRAWING_TOOLS = [
  ['cursor', 'cursor', 'Crosshair / Pan (Esc)'],
  ['trend', 'trend', 'Trend line: click two points'],
  ['ray', 'ray', 'Ray'],
  ['horizontal', 'horizontal', 'Horizontal line'],
  ['vertical', 'vertical', 'Vertical line'],
  ['rectangle', 'rectangle', 'Rectangle'],
  ['fib', 'fib', 'Fibonacci retracement'],
  ['measure', 'measure', 'Measure: click two points'],
  ['text', 'text', 'Add text'],
  ['zoom', 'zoom', 'Zoom at pointer'],
];
export const CHART_TYPES = { candles: 'Candles', hollow: 'Hollow candles', bars: 'OHLC bars', line: 'Line', area: 'Area', heikin: 'Heikin Ashi' };
export const WORKSPACE_DEFAULTS = {
  chartType: 'candles', timeframe: 1, timeZone: 'Asia/Tokyo', scaleMode: 'linear', showGrid: true,
  showVolume: true, showLastPrice: true, showExecutions: true,
  drawingColor: '#2962ff', drawingWidth: 2, magnet: false,
  drawingsHidden: false, drawingsLocked: false, stayInDrawingMode: false,
};
export function readWorkspace(storage = globalThis.localStorage) {
  let saved;
  try { saved = JSON.parse(storage.getItem('argent-chart-workspace-v1')); } catch {}
  const result = { ...WORKSPACE_DEFAULTS };
  if (!saved || typeof saved !== 'object') return result;
  for (const key of Object.keys(result)) {
    if (typeof saved[key] === typeof result[key]) result[key] = saved[key];
  }
  if (!CHART_TYPES[result.chartType]) result.chartType = 'candles';
  if (!['linear', 'log', 'percent'].includes(result.scaleMode)) result.scaleMode = 'linear';
  if (![1, 3, 5, 10, 15, 30, 60, 240, 1440].includes(result.timeframe)) result.timeframe = 1;
  if (!/^#[0-9a-f]{6}$/i.test(result.drawingColor)) result.drawingColor = WORKSPACE_DEFAULTS.drawingColor;
  if (![1, 2, 3, 4].includes(result.drawingWidth)) result.drawingWidth = 2;
  try { new Intl.DateTimeFormat('en', { timeZone: result.timeZone }); } catch { result.timeZone = 'Asia/Tokyo'; }
  return result;
}

export function heikinAshi(bars) {
  const result = [];
  for (const bar of bars) {
    const previous = result.at(-1);
    const open = previous ? (previous.open + previous.close) / 2 : (bar.open + bar.close) / 2;
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    result.push({ ...bar, open, close, high: Math.max(bar.high, open, close), low: Math.min(bar.low, open, close) });
  }
  return result;
}

export function priceScale(min, max, top, bottom, mode = 'linear') {
  const logarithmic = mode === 'log' && min > 0 && max > min;
  const low = logarithmic ? Math.log(min) : min, high = logarithmic ? Math.log(max) : max;
  const range = high - low || 1;
  return {
    y: price => top + (high - (logarithmic ? Math.log(Math.max(Number.MIN_VALUE, price)) : price)) / range * (bottom - top),
    priceAtY: y => logarithmic ? Math.exp(high - (y - top) / (bottom - top) * range) : high - (y - top) / (bottom - top) * range,
  };
}

export function createDrawingHistory(storage = globalThis.localStorage) {
  let items = [], undo = [], redo = [];
  const validPoint = point => point && Number.isFinite(point.minute) && Number.isFinite(point.price);
  try {
    const saved = JSON.parse(storage.getItem('argent-chart-drawings-v1'));
    if (Array.isArray(saved)) items = saved.filter(item => item && DRAWING_TOOLS.some(([key]) => key === item.type) && validPoint(item.a) && (!item.b || validPoint(item.b))).slice(-500);
  } catch {}
  const save = () => { try { storage.setItem('argent-chart-drawings-v1', JSON.stringify(items)); } catch {} };
  return {
    get items() { return items; },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
    change(next) {
      if (JSON.stringify(next) === JSON.stringify(items)) return;
      undo.push(items); if (undo.length > 80) undo.shift();
      items = structuredClone(next); redo = []; save();
    },
    undo() { if (undo.length) { redo.push(items); items = undo.pop(); save(); } },
    redo() { if (redo.length) { undo.push(items); items = redo.pop(); save(); } },
  };
}

export function drawingPixel(anchor, m, timeframe) {
  const minute = Math.floor(anchor.minute / timeframe) * timeframe;
  let low = 0, high = m.bars.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (m.bars[middle].minute < minute) low = middle + 1;
    else high = middle;
  }
  let index = low;
  if (index === m.bars.length) index = m.bars.length - 1 + (minute - m.bars.at(-1).minute) / timeframe;
  else if (index === 0 && minute < m.bars[0].minute) index = (minute - m.bars[0].minute) / timeframe;
  return { x: m.left + (index - m.first + .5) * m.step, y: m.y(anchor.price), index };
}

export function hitDrawing(items, p, m, timeframe) {
  const distance = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index], a = drawingPixel(item.a, m, timeframe), b = drawingPixel(item.b || item.a, m, timeframe);
    if (Math.hypot(p.x - a.x, p.y - a.y) < 9) return { index, anchor: 'a' };
    if (item.b && Math.hypot(p.x - b.x, p.y - b.y) < 9) return { index, anchor: 'b' };
    let hit = false;
    if (item.type === 'horizontal') hit = Math.abs(p.y - a.y) < 7;
    else if (item.type === 'vertical') hit = Math.abs(p.x - a.x) < 7;
    else if (item.type === 'text') hit = p.x >= a.x && p.x <= a.x + Math.max(30, (item.text?.length || 0) * 7) && Math.abs(p.y - a.y) < 15;
    else if (['rectangle', 'rectangle', 'fib'].includes(item.type)) hit = p.x >= Math.min(a.x, b.x) - 6 && p.x <= Math.max(a.x, b.x) + 6 && p.y >= Math.min(a.y, b.y) - 6 && p.y <= Math.max(a.y, b.y) + 6;
    else if (item.type === 'ray') {
      const factor = ((b.x >= a.x ? m.right : m.left) - a.x) / (b.x - a.x || .001);
      hit = distance(a, { x: a.x + (b.x - a.x) * Math.max(1, factor), y: a.y + (b.y - a.y) * Math.max(1, factor) }) < 7;
    } else hit = distance(a, b) < 7;
    if (hit) return { index, anchor: null };
  }
  return null;
}

export function drawDrawingLayer(ctx, items, draft, selected, m, options, font) {
  if (options.drawingsHidden) return;
  ctx.save(); ctx.beginPath(); ctx.rect(m.left, m.top, m.right - m.left, m.bottom - m.top); ctx.clip();
  ctx.font = `11px ${font}`; ctx.textAlign = 'left'; ctx.setLineDash([]);
  for (const [index, item] of [...items, ...(draft ? [draft] : [])].entries()) {
    const a = drawingPixel(item.a, m, options.timeframe), b = drawingPixel(item.b || item.a, m, options.timeframe);
    const color = item.color || '#2962ff';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = item.width || 2;
    ctx.beginPath();
    if (item.type === 'horizontal') {
      ctx.moveTo(m.left, a.y); ctx.lineTo(m.right, a.y); ctx.stroke();
      ctx.fillText(item.a.price.toFixed(2), m.left + 5, a.y - 5);
    } else if (item.type === 'vertical') {
      ctx.moveTo(a.x, m.top); ctx.lineTo(a.x, m.bottom); ctx.stroke();
    } else if (item.type === 'text') ctx.fillText(item.text || '', a.x, a.y);
    else if (item.type === 'rectangle' || item.type === 'measure') {
      ctx.globalAlpha = .12; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.globalAlpha = 1;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      if (item.type === 'measure') {
        const change = item.b.price - item.a.price, percent = item.a.price ? change / item.a.price * 100 : 0;
        ctx.fillText(`${change.toFixed(2)} (${percent.toFixed(2)}%) · ${Math.abs(Math.round(b.index - a.index))} bars`, Math.min(a.x, b.x) + 5, Math.min(a.y, b.y) - 8);
      }
    } else if (item.type === 'fib') {
      for (const [j, level] of [0, .236, .382, .5, .618, .786, 1].entries()) {
        const yy = b.y + (a.y - b.y) * level;
        ctx.strokeStyle = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#26a69a', '#42a5f5', '#ab47bc'][j];
        ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(b.x, yy); ctx.stroke();
        const price = item.b.price + (item.a.price - item.b.price) * level;
        ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${level} (${price.toFixed(2)})`, Math.min(a.x, b.x) + 4, yy - 4);
      }
    } else {
      let endpoint = b;
      if (item.type === 'ray') {
        const edge = b.x >= a.x ? m.right : m.left;
        const factor = Math.max(1, (edge - a.x) / (b.x - a.x || .001));
        endpoint = { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor };
      }
      ctx.moveTo(a.x, a.y); ctx.lineTo(endpoint.x, endpoint.y); ctx.stroke();
    }
    if (index === selected || item === draft) {
      for (const point of item.b ? [a, b] : [a]) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#000000'; ctx.fill(); ctx.strokeStyle = '#b2b5be'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  ctx.restore();
}
