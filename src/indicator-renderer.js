import { INDICATOR_DEFINITIONS } from './indicators.js';

function plot(ctx, values, color, m, y, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  let started = false;
  for (let i = m.start; i <= m.end; i++) {
    if (!Number.isFinite(values[i])) { started = false; continue; }
    const x = m.xFor(i - m.start), yy = y(values[i]);
    if (started) ctx.lineTo(x, yy); else { ctx.moveTo(x, yy); started = true; }
  }
  ctx.stroke();
}

export function drawIndicatorPanes(ctx, data, config, layout, m, font) {
  const index = m.hoverIndex ?? m.bars.length - 1;
  for (const pane of layout.panes) {
    const key = pane.key, settings = config[key];
    if (settings.hidden) continue;
    const series = key === 'macd' || key === 'adx' ? data[key].line : data[key];
    const visible = (key === 'macd' ? [data.macd.line, data.macd.signal, data.macd.histogram] : key === 'adx' ? [data.adx.line, data.adx.plus, data.adx.minus] : [series]).flatMap(values => values.slice(m.start, m.end + 1).filter(Number.isFinite));
    const maximum = key === 'rsi' || key === 'adx' ? 100 : Math.max(.000001, ...visible.map(Math.abs)) * 1.1;
    const minimum = key === 'macd' ? -maximum : 0;
    const plotTop = pane.top + 16, plotBottom = pane.bottom - 4;
    const y = value => plotBottom - (value - minimum) / (maximum - minimum) * (plotBottom - plotTop);
    ctx.save(); ctx.setLineDash([]); ctx.textAlign = 'left'; ctx.font = `9px ${font}`;
    const parameters = Object.keys(INDICATOR_DEFINITIONS[key].fields).map(field => settings[field]).join(' ');
    ctx.fillStyle = '#9bb6bf';
    if (!m.windowHeaders) ctx.fillText(`${INDICATOR_DEFINITIONS[key].name} ${parameters}   ${Number.isFinite(series[index]) ? series[index].toFixed(key === 'atr' || key === 'macd' ? 4 : 2) : 'Warming up'}`, m.left + 4, pane.top + 10);
    const ticks = key === 'rsi' ? [30, 50, 70] : key === 'adx' ? [0, 25, 50, 100] : [minimum, 0, maximum].filter((value, i, all) => all.indexOf(value) === i);
    for (const tick of ticks) {
      ctx.strokeStyle = '#26363d'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(m.left, y(tick)); ctx.lineTo(m.right, y(tick)); ctx.stroke();
      ctx.fillStyle = '#6f8b96'; ctx.fillText(tick.toFixed(key === 'atr' || key === 'macd' ? 3 : 0), m.right + 7, y(tick) + 3);
    }
    ctx.setLineDash([]); ctx.beginPath(); ctx.rect(m.left, plotTop, m.right - m.left, plotBottom - plotTop); ctx.clip();
    if (key === 'macd') {
      for (let i = m.start; i <= m.end; i++) {
        const value = data.macd.histogram[i]; if (!Number.isFinite(value)) continue;
        const yy = y(value), zero = y(0), width = Math.max(1, m.step * .65);
        ctx.fillStyle = value >= 0 ? '#64d6b177' : '#ee859577'; ctx.fillRect(m.xFor(i - m.start) - width / 2, Math.min(yy, zero), width, Math.abs(yy - zero));
      }
      plot(ctx, data.macd.line, settings.color, m, y, settings.lineWidth); plot(ctx, data.macd.signal, '#e4b56a', m, y, settings.lineWidth);
    } else if (key === 'adx') {
      plot(ctx, data.adx.plus, '#64d6b1', m, y, settings.lineWidth); plot(ctx, data.adx.minus, '#ee8595', m, y, settings.lineWidth); plot(ctx, data.adx.line, settings.color, m, y, settings.lineWidth);
    } else plot(ctx, series, settings.color, m, y, settings.lineWidth);
    ctx.restore();
  }
}

function fillToPrice(ctx, values, color, m) {
  ctx.save(); ctx.fillStyle = color; ctx.globalAlpha *= .14;
  let run = [];
  const fill = () => {
    if (!run.length) return;
    ctx.beginPath();
    for (let j = 0; j < run.length; j++) {
      const i = run[j], x = m.xFor(i - m.start), y = m.y(values[i]);
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    for (let j = run.length - 1; j >= 0; j--) {
      const i = run[j]; ctx.lineTo(m.xFor(i - m.start), m.y(m.bars[i].close));
    }
    ctx.closePath(); ctx.fill(); run = [];
  };
  for (let i = Math.max(0, m.start - 1); i <= Math.min(m.bars.length - 1, m.end + 1); i++) {
    if (Number.isFinite(values[i])) run.push(i); else fill();
  }
  fill(); ctx.restore();
}

export function drawPriceIndicators(ctx, data, config, m, font) {
  ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.rect(m.left, m.top, m.right - m.left, m.bottom - m.top); ctx.clip();
  if (data.bb && !config.bb.hidden) {
    const indices = Array.from({ length: m.end - m.start + 1 }, (_, i) => i + m.start).filter(i => Number.isFinite(data.bb.upper[i]));
    if (indices.length) {
      ctx.beginPath(); indices.forEach((index, i) => { const x = m.xFor(index - m.start), y = m.y(data.bb.upper[index]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      [...indices].reverse().forEach(index => ctx.lineTo(m.xFor(index - m.start), m.y(data.bb.lower[index])));
      ctx.closePath(); ctx.fillStyle = '#6b9fdf13'; ctx.fill();
    }
    plot(ctx, data.bb.upper, config.bb.color, m, m.y, config.bb.lineWidth); plot(ctx, data.bb.lower, config.bb.color, m, m.y, config.bb.lineWidth); plot(ctx, data.bb.basis, '#c5a86a', m, m.y, config.bb.lineWidth);
  }
  if (data.supertrend && !config.supertrend.hidden) {
    fillToPrice(ctx, data.supertrend.up, config.supertrend.color, m);
    fillToPrice(ctx, data.supertrend.down, '#ee8595', m);
    plot(ctx, data.supertrend.up, config.supertrend.color, m, m.y, config.supertrend.lineWidth);
    plot(ctx, data.supertrend.down, '#ee8595', m, m.y, config.supertrend.lineWidth);
  }
  ctx.restore();
  ctx.save(); ctx.font = `9px ${font}`; ctx.fillStyle = '#8eacb6'; ctx.textAlign = 'left';
  let yy = m.top + 12;
  for (const key of ['bb', 'supertrend']) {
    if (!data[key] || config[key].hidden || m.windowHeaders) continue;
    const parameters = Object.keys(INDICATOR_DEFINITIONS[key].fields).map(field => config[key][field]).join(' ');
    if (!m.windowHeaders) ctx.fillText(`${INDICATOR_DEFINITIONS[key].name} ${parameters}`, m.left + 4, yy); yy += 14;
  }
  ctx.restore();
}
