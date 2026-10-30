import '../chart-utils.js';
const { priceTicks, timeStep, seekIndex, zonedTime, chartWindow, zoomWindow } = globalThis.ChartUtils;

export function createChartController(chart, initialOptions = {}) {
  const ctx = chart.getContext('2d');
  const fontFamily = getComputedStyle(chart).fontFamily;
  let options = { timeframe: 1, timeZone: 'UTC', ...initialOptions };
  const state = { candles: [], index: 0, rangeStart: 0, positions: [], visibleCount: 120, viewOffset: 0, hoverIndex: null, priceScale: 1, manualPrice: null, indicators: true, drawings: [], tool: 'cursor', draft: null, chartMeta: null };
  let barCache = {}, indicatorCache = {};
  const cleanup = [];
  function listen(type, handler, config) {
    chart.addEventListener(type, handler, config);
    cleanup.push(() => chart.removeEventListener(type, handler, config));
  }
function chartBars() {
  if (barCache.candles === state.candles && barCache.index === state.index && barCache.timeframe === options.timeframe) return barCache.bars;
  const size = Number(options.timeframe || 1), bars = [];
  for (const candle of state.candles.slice(0, state.index + 1)) {
    const minute = Math.floor(candle.minute / size) * size;
    let bar = bars[bars.length - 1];
    if (!bar || bar.minute !== minute) {
      bars.push({ ...candle, minute, endMinute:candle.minute });
    } else {
      bar.high=Math.max(bar.high,candle.high);bar.low=Math.min(bar.low,candle.low);bar.close=candle.close;bar.volume+=candle.volume;bar.endMinute=candle.minute;
    }
  }
  barCache = { candles: state.candles, index: state.index, timeframe: options.timeframe, bars };
  return bars;
}

function fmt(n, d=2){ return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function current(){ return state.candles[state.index]; }
function timestampFor(i){ const date=zonedTime(state.rangeStart+i*60000,options.timeZone);return `${date.value.replace('T',' ')} ${date.name}`; }
function ema(values,period){const result=Array(values.length).fill(null),k=2/(period+1);if(!values.length)return result;let value=values[0];result[0]=value;for(let i=1;i<values.length;i++){value=values[i]*k+value*(1-k);result[i]=value}return result}
function rsi(values,period=14){const result=Array(values.length).fill(null);if(values.length<=period)return result;let gain=0,loss=0;for(let i=1;i<=period;i++){const change=values[i]-values[i-1];gain+=Math.max(0,change);loss+=Math.max(0,-change)}gain/=period;loss/=period;result[period]=loss===0?100:100-100/(1+gain/loss);for(let i=period+1;i<values.length;i++){const change=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,change))/period;loss=(loss*(period-1)+Math.max(0,-change))/period;result[i]=loss===0?100:100-100/(1+gain/loss)}return result}
function macd(values){const fast=ema(values,12),slow=ema(values,26),line=values.map((_,i)=>fast[i]-slow[i]),signal=ema(line,9),histogram=line.map((v,i)=>v-signal[i]);return {line,signal,histogram}}
function draw(){
  const w=chart.clientWidth,h=chart.clientHeight; ctx.clearRect(0,0,w,h); if(!state.candles.length)return;
  const bars = chartBars(), view = chartWindow(bars.length, state.visibleCount, state.viewOffset);
  state.viewOffset = view.offset;
  const { start, end } = view, count = end - start + 1, data = bars.slice(start, end + 1);
  if (!data.length) return;
  if (indicatorCache.bars !== bars) {
    const closes = bars.map(b => b.close);
    indicatorCache = { bars, rsiData: rsi(closes), macdData: macd(closes) };
  }
  const { rsiData, macdData } = indicatorCache;
  const paneBudget = Math.max(80, h - 240);
  let rsiHeight = Math.max(40, Math.min(500, options.paneHeights?.rsi || 70));
  let macdHeight = Math.max(40, Math.min(500, options.paneHeights?.macd || 100));
  if (rsiHeight + macdHeight > paneBudget) {
    const scale = (paneBudget - 80) / (rsiHeight + macdHeight - 80 || 1);
    rsiHeight = 40 + (rsiHeight - 40) * scale;
    macdHeight = 40 + (macdHeight - 40) * scale;
  }
  const top = 30, bottom = state.indicators ? h - 90 - rsiHeight - macdHeight : h - 54, left = 12, right = w - 78;
  const volumeTop = bottom - 42, volumeBottom = bottom, rsiTop = bottom + 18, rsiBottom = rsiTop + rsiHeight, macdTop = rsiBottom + 18, macdBottom = state.indicators ? h - 54 : bottom;
  options.onPaneLayout?.({ rsi: rsiHeight, macd: macdHeight, rsiDivider: bottom + 9, macdDivider: rsiBottom + 9, budget: paneBudget });
  const rawMax = Math.max(...data.map(c => c.high)), rawMin = Math.min(...data.map(c => c.low));
  const baseRange = (rawMax - rawMin) || Math.max(rawMax * .001, .01), center = (rawMax + rawMin) / 2;
  const range = state.manualPrice ? state.manualPrice.max - state.manualPrice.min : baseRange * 1.12 / state.priceScale;
  const max = state.manualPrice ? state.manualPrice.max : center + range / 2, min = max - range;
  const y = p => top + (max - p) / range * (bottom - top), step = (right - left) / state.visibleCount;
  const xFor = i => left + (start + i - view.first + .5) * step;
  state.chartMeta = { bars, start, end, rsiData, macdData, top, bottom, left, right, min, max, range, step, first: view.first, y, xFor };
  options.onView?.({ offset: state.viewOffset, visibleCount: state.visibleCount });
  if (view.first < 20) options.onNeedEarlier?.();
  const quote = state.hoverIndex === null ? bars.at(-1) : bars[state.hoverIndex] || bars.at(-1);
  options.onHover?.(quote);
  ctx.font=`12px ${fontFamily}`;ctx.textAlign='left';ctx.setLineDash([2,4]);
  for (const tick of priceTicks(min, max, bottom-top, Number(options.priceGrid || 0))) {
    const yy = y(tick.price);
    ctx.strokeStyle = '#1b2c32';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    if (tick.label) { ctx.fillStyle='#aeb8c4';ctx.fillText(fmt(tick.price),right+8,yy+4); }
  }
  const gridMinutes = timeStep(Number(options.timeframe), step, Number(options.timeGrid || 0));
  let previousBucket = null, lastGridX = -Infinity, lastLabelX = -Infinity;
  ctx.font=`11px ${fontFamily}`;
  data.forEach((bar, i) => {
    const timestamp = state.rangeStart + bar.minute * 60000;
    const local = zonedTime(timestamp, options.timeZone);
    const bucket = Math.floor(local.wallTimestamp / (gridMinutes * 60000));
    if (bucket === previousBucket) return;
    previousBucket = bucket;
    if (i === 0 && local.wallTimestamp % (gridMinutes * 60000) !== 0 && data.length > 1) return;
    const x = xFor(i);
    if (x-lastGridX < 6) return;
    lastGridX = x;
    ctx.strokeStyle='#1b2c32';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,macdBottom);ctx.stroke();
    const labelX = Math.max(left+35,Math.min(right-35,x));
    if (labelX-lastLabelX < 76) return;
    lastLabelX = labelX;
    const date = local.value;
    ctx.textAlign='center';ctx.fillStyle='#c1cad5';ctx.fillText(date.slice(11,16),labelX,h-32);
    ctx.fillStyle='#96a4b4';ctx.fillText(date.slice(5,10),labelX,h-16);ctx.textAlign='left';
  });
  ctx.fillStyle='#96a4b4';ctx.fillText(zonedTime(data[data.length-1].timestamp,options.timeZone).name,right+4,h-16);
  ctx.setLineDash([]);
  ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  const maxVolume=Math.max(1,...data.map(c=>c.volume));
  data.forEach((c,i)=>{const x=xFor(i), up=c.close>=c.open,col=up?'#64d6b1':'#ee8595';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();const bw=Math.max(2,step*.62),yt=y(Math.max(c.open,c.close)),bh=Math.max(1,Math.abs(y(c.open)-y(c.close)));ctx.fillRect(x-bw/2,yt,bw,bh);const vh=(c.volume/maxVolume)*(volumeBottom-volumeTop);ctx.globalAlpha=.27;ctx.fillRect(x-bw/2,volumeBottom-vh,bw,vh);ctx.globalAlpha=1});
  ctx.restore();
  if (state.indicators) {
  ctx.font=`10px ${fontFamily}`;ctx.fillStyle='#8c72d9';ctx.fillText('RSI 14',left+4,rsiTop+10);[30,50,70].forEach(level=>{const yy=rsiBottom-(level/100)*(rsiBottom-rsiTop);ctx.strokeStyle=level===50?'#252a30':'#34303d';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle='#626a74';ctx.fillText(String(level),right+8,yy+3)});ctx.setLineDash([]);ctx.strokeStyle='#9b7bea';ctx.beginPath();let rsiStarted=false;for(let i=0;i<count;i++){const value=rsiData[start+i];if(value===null)continue;const xx=xFor(i),yy=rsiBottom-(value/100)*(rsiBottom-rsiTop);if(!rsiStarted){ctx.moveTo(xx,yy);rsiStarted=true}else ctx.lineTo(xx,yy)}ctx.stroke();
  const visibleMacd=macdData.line.slice(start,end+1).concat(macdData.signal.slice(start,end+1),macdData.histogram.slice(start,end+1)),macdMax=Math.max(...visibleMacd.map(Math.abs),.0001),macdZero=(macdTop+macdBottom)/2,macdY=value=>macdZero-value/macdMax*(macdBottom-macdTop)*.45;ctx.fillStyle='#65a5dd';ctx.fillText('MACD 12 26 9',left+4,macdTop+10);ctx.strokeStyle='#2b3036';ctx.beginPath();ctx.moveTo(left,macdZero);ctx.lineTo(right,macdZero);ctx.stroke();for(let i=0;i<count;i++){const value=macdData.histogram[start+i],xx=xFor(i),yy=macdY(value);ctx.fillStyle=value>=0?'#64d6b166':'#ee859566';ctx.fillRect(xx-Math.max(1,step*.3),Math.min(macdZero,yy),Math.max(2,step*.6),Math.abs(yy-macdZero))}[[macdData.line,'#4da3e6'],[macdData.signal,'#e6a84d']].forEach(([series,color])=>{ctx.strokeStyle=color;ctx.beginPath();let begun=false;for(let i=0;i<count;i++){const value=series[start+i];if(value===null)continue;const xx=xFor(i),yy=macdY(value);if(!begun){ctx.moveTo(xx,yy);begun=true}else ctx.lineTo(xx,yy)}ctx.stroke()});ctx.fillStyle='#626a74';ctx.fillText(macdMax.toFixed(3),right+8,macdTop+9);ctx.fillText((-macdMax).toFixed(3),right+8,macdBottom);
  }
  const last=bars.at(-1), ly=y(last.close);if(ly>=top&&ly<=bottom){ctx.strokeStyle='#81dfc2';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(left,ly);ctx.lineTo(right,ly);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#81dfc2';ctx.fillRect(right,ly-11,76,22);ctx.fillStyle='#0d2821';ctx.font=`bold 12px ${fontFamily}`;ctx.fillText(fmt(last.close),right+5,ly+4);}
  state.positions.forEach(p=>{const ey=y(p.entry);if(ey>=top&&ey<=bottom){ctx.strokeStyle=p.side==='LONG'?'#64d6b1':'#ee8595';ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(left,ey);ctx.lineTo(right,ey);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(`#${p.id} ${p.side} ${fmt(p.entry)}`,left+5,ey-5)}});

  drawProtectionLines();
  drawExecutions();
  drawAnnotations();
  if(state.hoverIndex!==null&&state.hoverIndex>=start&&state.hoverIndex<=end){const x=xFor(state.hoverIndex-start),hc=bars[state.hoverIndex],hy=Math.max(top,Math.min(bottom,state.crosshairY||y(hc.close)));ctx.strokeStyle='#7d858e';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,macdBottom);ctx.moveTo(left,hy);ctx.lineTo(right,hy);ctx.stroke();ctx.setLineDash([]);const pointerPrice=max-(hy-top)/(bottom-top)*range;ctx.fillStyle='#454c54';ctx.fillRect(right,hy-11,76,22);ctx.fillStyle='#f0f2f4';ctx.font=`12px ${fontFamily}`;ctx.fillText(fmt(pointerPrice),right+5,hy+4);const label=timestampFor(hc.minute).slice(5,16)+' '+zonedTime(state.rangeStart+hc.minute*60000,options.timeZone).name;ctx.textAlign='center';const tw=Math.max(58,ctx.measureText(label).width+16);ctx.fillStyle='#454c54';const labelX=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.fillRect(labelX-tw/2,h-47,tw,36);ctx.fillStyle='#f0f2f4';ctx.fillText(label,labelX,h-25);ctx.textAlign='left'}
}
function zoom(delta, fraction = .5) {
  if (!state.chartMeta) return;
  const view = zoomWindow(state.chartMeta.bars.length, state.visibleCount, state.viewOffset, state.visibleCount + delta, fraction);
  state.visibleCount = view.visibleCount;
  state.viewOffset = view.offset;
  state.hoverIndex = null;
  draw();
}

function priceZoom(factor, fraction = .5) {
  const m = state.chartMeta;
  if (!m) return;
  const anchor = m.max - fraction * m.range;
  const range = Math.max(.00001, Math.min(1e8, m.range / factor));
  state.manualPrice = { min: anchor - (1 - fraction) * range, max: anchor + fraction * range };
  draw();
}

function pointerPosition(event) {
  const rect = chart.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function candleAtPointer(event) {
  const m = state.chartMeta;
  if (!m) return null;
  const p = pointerPosition(event);
  state.crosshairY = p.y;
  const index = Math.floor(m.first + (p.x - m.left) / m.step);
  return p.x >= m.left && p.x <= m.right && index >= m.start && index <= m.end ? index : null;
}

function selectTool(tool) {
  state.tool = tool;
  state.draft = null;
  options.onToolChange?.(tool);
  chart.style.cursor = tool === 'cursor' ? 'crosshair' : tool === 'zoom' ? 'zoom-in' : 'crosshair';
  draw();
}

function drawingPoint(event) {
  const m = state.chartMeta, p = pointerPosition(event);
  const index = Math.max(0, Math.min(m.bars.length - 1, Math.floor(m.first + (p.x - m.left) / m.step)));
  return { minute: m.bars[index].minute, price: m.max - (p.y - m.top) / (m.bottom - m.top) * m.range };
}

function drawingClick(event) {
  if (state.tool === 'zoom') {
    const m = state.chartMeta, p = pointerPosition(event);
    zoom(-Math.round(state.visibleCount * .3), (p.x - m.left) / (m.right - m.left));
    selectTool('cursor'); return;
  }
  const point = drawingPoint(event);
  if (state.tool === 'horizontal') {
    state.drawings.push({ type: 'horizontal', a: point });
    selectTool('cursor');
  } else if (state.tool === 'text') {
    options.onTextRequest?.(point, pointerPosition(event));
  } else if (!state.draft) state.draft = { type: state.tool, a: point, b: point };
  else {
    state.draft.b = point;
    state.drawings.push(state.draft);
    selectTool('cursor');
  }
  draw();
}

function drawProtectionLines() {
  const m = state.chartMeta;
  if (!m) return;
  ctx.save(); ctx.font = `9px ${fontFamily}`; ctx.textAlign = 'left';
  for (const p of state.positions) {
    for (const [label, price, color] of [['TP', p.tp, '#81dfc2'], ['SL', p.sl, '#ee8595'], ['TRAIL', p.trailingStop, '#d2b480']]) {
      if (!price) continue;
      const y = m.y(price);
      if (y < m.top || y > m.bottom) continue;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.right, y); ctx.stroke();
      ctx.fillText(`#${p.id} ${label} ${price.toFixed(2)}`, m.left + 5, y - 5);
    }
  }
  ctx.restore();
}

function drawExecutions() {
  const m = state.chartMeta;
  if (!m || !state.fills?.length) return;
  const timeframe = Number(options.timeframe);
  ctx.save(); ctx.beginPath(); ctx.rect(m.left, m.top, m.right - m.left, m.bottom - m.top); ctx.clip();
  for (const fill of state.fills) {
    if (fill.timestamp > state.candles[state.index].timestamp) continue;
    const minute = Math.floor(fill.timestamp / 60000 / timeframe) * timeframe;
    const index = m.bars.findIndex(bar => bar.minute === minute);
    if (index < m.start || index > m.end) continue;
    const x = m.left + (index - m.first + .5) * m.step;
    const buy = fill.side === 'BUY';
    const y = m.y(buy ? m.bars[index].low : m.bars[index].high) + (buy ? 14 : -14);
    ctx.fillStyle = buy ? '#8ae7c7' : '#ee8595';
    ctx.beginPath(); ctx.moveTo(x, y + (buy ? -5 : 5)); ctx.lineTo(x - 4, y + (buy ? 3 : -3)); ctx.lineTo(x + 4, y + (buy ? 3 : -3)); ctx.closePath(); ctx.fill();
    ctx.font = `9px ${fontFamily}`; ctx.textAlign = 'center'; ctx.fillText(buy ? 'B' : 'S', x, y + (buy ? 15 : -8));
  }
  ctx.restore();
}

function drawAnnotations() {
  const m = state.chartMeta;
  if (!m) return;
  const point = anchor => {
    const minute = Math.floor(anchor.minute / Number(options.timeframe)) * Number(options.timeframe);
    let index = m.bars.findIndex(b => b.minute >= minute);
    if (index < 0) index = m.bars.length - 1;
    return { x: m.left + (index - m.first + .5) * m.step, y: m.y(anchor.price), index };
  };
  ctx.save(); ctx.beginPath(); ctx.rect(m.left, m.top, m.right - m.left, m.bottom - m.top); ctx.clip();
  ctx.strokeStyle = '#92dccb'; ctx.fillStyle = '#92dccb'; ctx.lineWidth = 1.5; ctx.font = `12px ${fontFamily}`;
  for (const item of [...state.drawings, ...(state.draft ? [state.draft] : [])]) {
    const a = point(item.a), b = point(item.b || item.a);
    ctx.beginPath();
    if (item.type === 'horizontal') {
      ctx.moveTo(m.left, a.y); ctx.lineTo(m.right, a.y); ctx.stroke();
      ctx.fillText(fmt(item.a.price), m.left + 5, a.y - 5);
    } else if (item.type === 'text') ctx.fillText(item.text, a.x, a.y);
    else if (item.type === 'measure') {
      ctx.fillStyle = '#81dfc222'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fillStyle = '#92dccb';
      const change = item.b.price - item.a.price, percent = item.a.price ? change / item.a.price * 100 : 0;
      ctx.fillText(`${change >= 0 ? '+' : ''}${fmt(change)} (${percent.toFixed(2)}%) · ${Math.abs(b.index - a.index)} bars`, Math.min(a.x, b.x) + 5, Math.min(a.y, b.y) - 8);
    } else {
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

function initializeChartInteractions() {
  let gesture = null;
  listen('wheel', event => {
    if (!state.chartMeta) return;
    event.preventDefault();
    const p = pointerPosition(event), m = state.chartMeta;
    if (p.x > m.right) priceZoom(Math.exp(-event.deltaY * .002), Math.max(0, Math.min(1, (p.y - m.top) / (m.bottom - m.top))));
    else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      state.viewOffset += (event.deltaX || event.deltaY) / m.step; draw();
    } else {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? chart.clientHeight : 1);
      zoom(Math.round(state.visibleCount * (Math.exp(delta * .0015) - 1)) || (delta > 0 ? 1 : -1), Math.max(0, Math.min(1, (p.x - m.left) / (m.right - m.left))));
    }
  }, { passive: false });
  listen('pointerdown', event => {
    if (!state.chartMeta || event.button !== 0) return;
    const p = pointerPosition(event), m = state.chartMeta;
    chart.focus({ preventScroll: true });
    if (p.x < m.right && p.y < m.bottom && state.tool !== 'cursor') { drawingClick(event); return; }
    const mode = p.x >= m.right ? 'price' : p.y > chart.clientHeight - 50 ? 'time' : 'pan';
    gesture = { mode, x: p.x, y: p.y, offset: state.viewOffset, count: state.visibleCount, step: m.step, min: m.min, max: m.max, range: m.range, height: m.bottom - m.top };
    state.hoverIndex = null;
    chart.setPointerCapture(event.pointerId);
    chart.classList.add('dragging');
  });
  listen('pointermove', event => {
    if (!state.chartMeta) return;
    const p = pointerPosition(event);
    if (gesture) {
      const dx = p.x - gesture.x, dy = p.y - gesture.y;
      if (gesture.mode === 'price') {
        const range = Math.max(.00001, Math.min(1e8, gesture.range * Math.exp(dy * .008))), center = (gesture.max + gesture.min) / 2;
        state.manualPrice = { min: center - range / 2, max: center + range / 2 };
      } else if (gesture.mode === 'time') {
        const view = zoomWindow(state.chartMeta.bars.length, gesture.count, gesture.offset, Math.round(gesture.count * Math.exp(-dx * .005)), 1);
        state.visibleCount = view.visibleCount; state.viewOffset = view.offset;
      } else {
        state.viewOffset = gesture.offset + dx / gesture.step;
        if (Math.abs(dy) > 3) state.manualPrice = { min: gesture.min + dy / gesture.height * gesture.range, max: gesture.max + dy / gesture.height * gesture.range };
      }
      draw(); return;
    }
    state.hoverIndex = candleAtPointer(event);
    if (state.draft) state.draft.b = drawingPoint(event);
    chart.style.cursor = p.x >= state.chartMeta.right ? 'ns-resize' : p.y > chart.clientHeight - 50 ? 'ew-resize' : state.tool === 'zoom' ? 'zoom-in' : 'crosshair';
    draw();
  });
  function endGesture(event) {
    gesture = null;
    if (chart.hasPointerCapture(event.pointerId)) chart.releasePointerCapture(event.pointerId);
    chart.classList.remove('dragging');
  }
  listen('pointerup', endGesture);
  listen('pointercancel', endGesture);
  listen('lostpointercapture', () => { gesture = null; chart.classList.remove('dragging'); });
  listen('pointerleave', () => { if (!gesture) { state.hoverIndex = null; draw(); } });
  listen('dblclick', event => {
    const p = pointerPosition(event);
    if (!state.chartMeta || p.x < state.chartMeta.right) { state.visibleCount = 90; state.viewOffset = 0; }
    state.manualPrice = null; state.priceScale = 1; draw();
  });
  listen('keydown', event => {
    if (event.key === 'Escape') { state.draft = null; selectTool('cursor'); }
    else if (event.key === 'Delete' || event.key === 'Backspace') state.drawings.pop();
    else if (event.key === 'ArrowLeft') state.viewOffset += 5;
    else if (event.key === 'ArrowRight') state.viewOffset -= 5;
    else if (event.key === '+' || event.key === '=') zoom(-10);
    else if (event.key === '-') zoom(10);
    else return;
    event.preventDefault(); draw();
  });
}

  initializeChartInteractions();
  function resize() {
    const rect = chart.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    chart.width = rect.width * dpr; chart.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(chart); resize();
  return {
    update(model, nextOptions) {
      const oldMeta = state.chartMeta;
      const hoverMinute = oldMeta?.bars[state.hoverIndex]?.minute;
      const changedFrame = options.timeframe !== nextOptions.timeframe;
      const centerMinute = oldMeta?.bars[Math.max(0, Math.min(oldMeta.bars.length - 1, Math.round(oldMeta.first + state.visibleCount / 2)))]?.minute;
      options = { ...options, ...nextOptions };
      const reset = model.session !== state.session;
      if (!reset && state.chartMeta && Math.abs(state.viewOffset) > .01 && model.candles === state.candles && model.index !== state.index) {
        const previous = chartBars().length;
        Object.assign(state, model);
        state.viewOffset += chartBars().length - previous;
      } else Object.assign(state, model);
      if (reset) Object.assign(state, { viewOffset: 0, manualPrice: null, hoverIndex: null, drawings: [], draft: null, priceScale: 1 });
      if (changedFrame && !reset && Math.abs(state.viewOffset) > .01 && centerMinute !== undefined) {
        const bars = chartBars();
        let index = bars.findIndex(bar => bar.minute >= centerMinute);
        if (index < 0) index = bars.length - 1;
        state.viewOffset = bars.length + 6 - state.visibleCount / 2 - index - .5;
      }
      if (changedFrame) { state.hoverIndex = null; state.draft = null; }
      else if (!reset && hoverMinute !== undefined) {
        const index = chartBars().findIndex(bar => bar.minute === hoverMinute);
        state.hoverIndex = index < 0 ? null : index;
      }
      draw();
    },
    zoom, priceZoom, selectTool,
    fit() { state.visibleCount = 120; state.viewOffset = 0; state.manualPrice = null; draw(); },
    latest() { state.viewOffset = 0; draw(); },
    autoScale() { state.manualPrice = null; state.priceScale = 1; draw(); },
    clearDrawings() { state.drawings = []; state.draft = null; draw(); },
    addText(point, text) { if (text.trim()) state.drawings.push({ type: 'text', a: point, text: text.trim() }); selectTool('cursor'); },
    snapshot() { return chart.toDataURL('image/png'); },
    destroy() { observer.disconnect(); cleanup.forEach(remove => remove()); },
  };
}
