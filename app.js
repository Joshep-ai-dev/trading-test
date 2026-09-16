const $ = id => document.getElementById(id);
const state = { candles: [], index: 30, playing: false, timer: null, balance: 10000, realized: 0, trades: 0, positions: [], nextPositionId: 1, history: [], visibleCount: 90, viewOffset: 0, hoverIndex: null, dragging: false, dragX: 0, priceScale: 1, priceDragging: false, priceDragY: 0 };
const chart = $('chart'), ctx = chart.getContext('2d');
const INITIAL_BALANCE = 10000;
const { monthEnd, priceTicks, timeStep, seekIndex, zonedTime, zonedCandidates } = ChartUtils;

let timeZone = 'UTC';
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = [...new Set(['UTC', localZone, 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', ...(Intl.supportedValuesOf?.('timeZone') || [])])];
for (const zone of zones) {
  const option = document.createElement('option');
  option.value = zone;
  option.textContent = zone === localZone ? `${zone} (local)` : zone;
  $('timeZone').appendChild(option);
}
try { const saved = localStorage.getItem('argent-time-zone'); if (zones.includes(saved)) timeZone = saved; } catch {}
$('timeZone').value = timeZone;

function refreshTimeLabels() {
  $('jumpLabel').textContent = `GO TO (${timeZone})`;
  $('jumpDate').setAttribute('aria-label', `Jump to date and time in ${timeZone}`);
  $('timelineLabel').textContent = `MONTH PROGRESS | ${timeZone}`;
  if (!state.candles.length) return;
  const now = zonedTime(current().timestamp, timeZone);
  $('timeLabel').textContent = now.value.slice(5, 16).replace('T', ' ');
  $('dateLabel').textContent = `${zonedTime(state.rangeStart, timeZone).value.slice(5, 10)} - ${zonedTime(state.rangeEnd - 60000, timeZone).value.slice(5, 10)} ${now.name}`;
  $('dateLabel').title = timeZone;
}

function refreshJumpTime() {
  if (!state.candles.length) return;
  $('jumpDate').min = zonedTime(state.candles[0].timestamp, timeZone).value.slice(0, 16);
  $('jumpDate').max = zonedTime(state.candles.at(-1).timestamp, timeZone).value.slice(0, 16);
  $('jumpDate').value = zonedTime(current().timestamp, timeZone).value.slice(0, 16);
}

$('timeZone').onchange = () => {
  timeZone = $('timeZone').value;
  try { localStorage.setItem('argent-time-zone', timeZone); } catch {}
  state.hoverIndex = null;
  $('chartTooltip').classList.add('hidden');
  refreshTimeLabels();
  refreshJumpTime();
  renderHistory();
  draw();
};
refreshTimeLabels();

function chartBars() {
  const size = Number($('timeframe').value || 1), bars = [];
  for (const candle of state.candles.slice(0, state.index + 1)) {
    const minute = Math.floor(candle.minute / size) * size;
    let bar = bars[bars.length - 1];
    if (!bar || bar.minute !== minute) {
      bars.push({ ...candle, minute, endMinute:candle.minute });
    } else {
      bar.high=Math.max(bar.high,candle.high);bar.low=Math.min(bar.low,candle.low);bar.close=candle.close;bar.volume+=candle.volume;bar.endMinute=candle.minute;
    }
  }
  return bars;
}

function fmt(n, d=2){ return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function current(){ return state.candles[state.index]; }
function timestampFor(i){ const date=zonedTime(state.rangeStart+i*60000,timeZone);return `${date.value.replace('T',' ')} ${date.name}`; }
function ema(values,period){const result=Array(values.length).fill(null),k=2/(period+1);if(!values.length)return result;let value=values[0];result[0]=value;for(let i=1;i<values.length;i++){value=values[i]*k+value*(1-k);result[i]=value}return result}
function rsi(values,period=14){const result=Array(values.length).fill(null);if(values.length<=period)return result;let gain=0,loss=0;for(let i=1;i<=period;i++){const change=values[i]-values[i-1];gain+=Math.max(0,change);loss+=Math.max(0,-change)}gain/=period;loss/=period;result[period]=loss===0?100:100-100/(1+gain/loss);for(let i=period+1;i<values.length;i++){const change=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,change))/period;loss=(loss*(period-1)+Math.max(0,-change))/period;result[i]=loss===0?100:100-100/(1+gain/loss)}return result}
function macd(values){const fast=ema(values,12),slow=ema(values,26),line=values.map((_,i)=>fast[i]-slow[i]),signal=ema(line,9),histogram=line.map((v,i)=>v-signal[i]);return {line,signal,histogram}}
function resize(){ const r=chart.getBoundingClientRect(), d=devicePixelRatio||1; chart.width=r.width*d; chart.height=r.height*d; ctx.setTransform(d,0,0,d,0,0); draw(); }

function draw(){
  const w=chart.clientWidth,h=chart.clientHeight; ctx.clearRect(0,0,w,h); if(!state.candles.length)return;
  const bars=chartBars(), end=Math.max(0,bars.length-1-state.viewOffset), count=Math.min(state.visibleCount,end+1), start=end-count+1, data=bars.slice(start,end+1),closes=bars.map(b=>b.close),rsiData=rsi(closes),macdData=macd(closes);state.chartMeta={bars,start,end,rsiData,macdData};
  const top=22,bottom=h-225,left=12,right=w-78,volumeTop=bottom-42,volumeBottom=bottom,rsiTop=bottom+18,rsiBottom=rsiTop+55,macdTop=rsiBottom+18,macdBottom=h-54,rawMax=Math.max(...data.map(c=>c.high)),rawMin=Math.min(...data.map(c=>c.low)),baseRange=(rawMax-rawMin)||1,center=(rawMax+rawMin)/2,range=baseRange*1.12/state.priceScale,max=center+range/2,min=center-range/2;
  const y=p=>top+(max-p)/range*(bottom-top), step=(right-left)/state.visibleCount,slotOffset=state.visibleCount-count,xFor=i=>left+(slotOffset+i+.5)*step;
  ctx.font='12px ui-monospace';ctx.textAlign='left';ctx.setLineDash([2,4]);
  for (const tick of priceTicks(min, max, bottom-top, Number($('priceGrid').value))) {
    const yy = y(tick.price);
    ctx.strokeStyle = '#303840';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    if (tick.label) { ctx.fillStyle='#aeb8c4';ctx.fillText(fmt(tick.price),right+8,yy+4); }
  }
  const gridMinutes = timeStep(Number($('timeframe').value), step, Number($('timeGrid').value));
  let previousBucket = null, lastGridX = -Infinity, lastLabelX = -Infinity;
  ctx.font='11px ui-monospace';
  data.forEach((bar, i) => {
    const timestamp = state.rangeStart + bar.minute * 60000;
    const local = zonedTime(timestamp, timeZone);
    const bucket = Math.floor(local.wallTimestamp / (gridMinutes * 60000));
    if (bucket === previousBucket) return;
    previousBucket = bucket;
    if (i === 0 && local.wallTimestamp % (gridMinutes * 60000) !== 0 && data.length > 1) return;
    const x = xFor(i);
    if (x-lastGridX < 6) return;
    lastGridX = x;
    ctx.strokeStyle='#29323c';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,macdBottom);ctx.stroke();
    const labelX = Math.max(left+35,Math.min(right-35,x));
    if (labelX-lastLabelX < 76) return;
    lastLabelX = labelX;
    const date = local.value;
    ctx.textAlign='center';ctx.fillStyle='#c1cad5';ctx.fillText(date.slice(11,16),labelX,h-32);
    ctx.fillStyle='#96a4b4';ctx.fillText(date.slice(5,10),labelX,h-16);ctx.textAlign='left';
  });
  ctx.fillStyle='#96a4b4';ctx.fillText(zonedTime(data[data.length-1].timestamp,timeZone).name,right+4,h-16);
  ctx.setLineDash([]);
  ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  const maxVolume=Math.max(1,...data.map(c=>c.volume));
  data.forEach((c,i)=>{const x=xFor(i), up=c.close>=c.open,col=up?'#2acb8b':'#ef5c68';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();const bw=Math.max(2,step*.62),yt=y(Math.max(c.open,c.close)),bh=Math.max(1,Math.abs(y(c.open)-y(c.close)));ctx.fillRect(x-bw/2,yt,bw,bh);const vh=(c.volume/maxVolume)*(volumeBottom-volumeTop);ctx.globalAlpha=.27;ctx.fillRect(x-bw/2,volumeBottom-vh,bw,vh);ctx.globalAlpha=1});
  ctx.restore();
  ctx.font='10px ui-monospace';ctx.fillStyle='#8c72d9';ctx.fillText('RSI 14',left+4,rsiTop+10);[30,50,70].forEach(level=>{const yy=rsiBottom-(level/100)*(rsiBottom-rsiTop);ctx.strokeStyle=level===50?'#252a30':'#34303d';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillStyle='#626a74';ctx.fillText(String(level),right+8,yy+3)});ctx.setLineDash([]);ctx.strokeStyle='#9b7bea';ctx.beginPath();let rsiStarted=false;for(let i=0;i<count;i++){const value=rsiData[start+i];if(value===null)continue;const xx=xFor(i),yy=rsiBottom-(value/100)*(rsiBottom-rsiTop);if(!rsiStarted){ctx.moveTo(xx,yy);rsiStarted=true}else ctx.lineTo(xx,yy)}ctx.stroke();
  const visibleMacd=macdData.line.slice(start,end+1).concat(macdData.signal.slice(start,end+1),macdData.histogram.slice(start,end+1)),macdMax=Math.max(...visibleMacd.map(Math.abs),.0001),macdZero=(macdTop+macdBottom)/2,macdY=value=>macdZero-value/macdMax*(macdBottom-macdTop)*.45;ctx.fillStyle='#65a5dd';ctx.fillText('MACD 12 26 9',left+4,macdTop+10);ctx.strokeStyle='#2b3036';ctx.beginPath();ctx.moveTo(left,macdZero);ctx.lineTo(right,macdZero);ctx.stroke();for(let i=0;i<count;i++){const value=macdData.histogram[start+i],xx=xFor(i),yy=macdY(value);ctx.fillStyle=value>=0?'#2acb8b66':'#ef5c6866';ctx.fillRect(xx-Math.max(1,step*.3),Math.min(macdZero,yy),Math.max(2,step*.6),Math.abs(yy-macdZero))}[[macdData.line,'#4da3e6'],[macdData.signal,'#e6a84d']].forEach(([series,color])=>{ctx.strokeStyle=color;ctx.beginPath();let begun=false;for(let i=0;i<count;i++){const value=series[start+i];if(value===null)continue;const xx=xFor(i),yy=macdY(value);if(!begun){ctx.moveTo(xx,yy);begun=true}else ctx.lineTo(xx,yy)}ctx.stroke()});ctx.fillStyle='#626a74';ctx.fillText(macdMax.toFixed(3),right+8,macdTop+9);ctx.fillText((-macdMax).toFixed(3),right+8,macdBottom);
  const last=data[data.length-1], ly=y(last.close);if(ly>=top&&ly<=bottom){ctx.strokeStyle='#d6ad61';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(left,ly);ctx.lineTo(right,ly);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#d6ad61';ctx.fillRect(right,ly-11,76,22);ctx.fillStyle='#111';ctx.font='bold 12px ui-monospace';ctx.fillText(fmt(last.close),right+5,ly+4);}
  state.positions.forEach(p=>{const ey=y(p.entry);if(ey>=top&&ey<=bottom){ctx.strokeStyle=p.side==='LONG'?'#2acb8b':'#ef5c68';ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(left,ey);ctx.lineTo(right,ey);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(`#${p.id} ${p.side} ${fmt(p.entry)}`,left+5,ey-5)}});

  if(state.hoverIndex!==null&&state.hoverIndex>=start&&state.hoverIndex<=end){const x=xFor(state.hoverIndex-start),hc=bars[state.hoverIndex],hy=Math.max(top,Math.min(bottom,state.crosshairY||y(hc.close)));ctx.strokeStyle='#7d858e';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,volumeBottom);ctx.moveTo(left,hy);ctx.lineTo(right,hy);ctx.stroke();ctx.setLineDash([]);const pointerPrice=max-(hy-top)/(bottom-top)*range;ctx.fillStyle='#454c54';ctx.fillRect(right,hy-11,76,22);ctx.fillStyle='#f0f2f4';ctx.font='12px ui-monospace';ctx.fillText(fmt(pointerPrice),right+5,hy+4);const label=timestampFor(hc.minute).slice(5,16)+' '+zonedTime(state.rangeStart+hc.minute*60000,timeZone).name;ctx.textAlign='center';const tw=Math.max(58,ctx.measureText(label).width+16);ctx.fillStyle='#454c54';const labelX=Math.max(left+tw/2,Math.min(right-tw/2,x));ctx.fillRect(labelX-tw/2,h-47,tw,36);ctx.fillStyle='#f0f2f4';ctx.fillText(label,labelX,h-25);ctx.textAlign='left'}
}
function positionPnl(p,price=current().close){const diff=price-p.entry;return (p.side==='LONG'?diff:-diff)*p.quantity}
function totalPnl(){return state.positions.reduce((sum,p)=>sum+positionPnl(p),0)}
function usedMargin(){return state.positions.reduce((sum,p)=>sum+p.margin,0)}
function resultValue(id,text,value){const el=$(id);el.textContent=text;el.className=value>0?'positive':value<0?'negative':''}
function renderResults(){const trades=state.history,wins=trades.filter(t=>t.profit>0),losses=trades.filter(t=>t.profit<0),net=trades.reduce((sum,t)=>sum+t.profit,0),grossProfit=wins.reduce((sum,t)=>sum+t.profit,0),grossLoss=Math.abs(losses.reduce((sum,t)=>sum+t.profit,0));let equity=INITIAL_BALANCE,peak=equity,maxDrawdown=0;[...trades].reverse().forEach(t=>{equity+=t.profit;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)});resultValue('resultNet',`${net>=0?'+':''}${fmt(net)} USDT`,net);resultValue('resultReturn',`${net>=0?'+':''}${(net/INITIAL_BALANCE*100).toFixed(2)}%`,net);$('resultWinRate').textContent=trades.length?`${(wins.length/trades.length*100).toFixed(1)}%`:'—';$('resultWL').textContent=`${wins.length} / ${losses.length}`;resultValue('resultAverage',trades.length?`${fmt(net/trades.length)} USDT`:'0.00 USDT',net);$('resultFactor').textContent=grossLoss?`${(grossProfit/grossLoss).toFixed(2)}`:grossProfit?'∞':'—';resultValue('resultDrawdown',`${fmt(maxDrawdown)} USDT`,-maxDrawdown);const open=totalPnl();resultValue('resultOpen',`${open>=0?'+':''}${fmt(open)} USDT`,open)}
function renderPositions(){const list=$('positionsList');$('positionStatus').textContent=state.positions.length?`${state.positions.length} active trade${state.positions.length===1?'':'s'}`:'No active trades';$('noPosition').classList.toggle('hidden',state.positions.length>0);$('positionData').classList.toggle('hidden',state.positions.length===0);if(!state.positions.length)return;list.innerHTML=state.positions.map(p=>{const profit=positionPnl(p);return `<div class="position-item"><div class="position-item-head"><b class="${p.side==='LONG'?'positive':'negative'}">#${p.id} ${p.side} · ${p.leverage}×</b><button data-close-position="${p.id}">CLOSE</button></div><div class="position-item-grid"><span><small>ENTRY</small><b>${fmt(p.entry)}</b></span><span><small>NOTIONAL</small><b>${fmt(p.notional)} USDT</b></span><span><small>P&amp;L</small><b class="${profit>=0?'positive':'negative'}">${profit>=0?'+':''}${fmt(profit)}</b></span><span><small>MARGIN</small><b>${fmt(p.margin)} USDT</b></span><span><small>XAG QTY</small><b>${fmt(p.quantity,4)}</b></span><span><small>LIQ. PRICE</small><b class="negative">${fmt(p.liquidation)}</b></span><span><small>SL / TP</small><b>${p.sl?fmt(p.sl):'—'} / ${p.tp?fmt(p.tp):'—'}</b></span><span><small>TIME</small><b>${current().minute-p.openMinute}m</b></span></div></div>`}).join('');list.querySelectorAll('[data-close-position]').forEach(button=>button.onclick=()=>closePosition(Number(button.dataset.closePosition)))}
function update(){
  if (!state.candles.length) return;
  const c=current(), spread=.006; $('openVal').textContent=fmt(c.open);$('highVal').textContent=fmt(c.high);$('lowVal').textContent=fmt(c.low);$('closeVal').textContent=fmt(c.close);
  $('bid').textContent=fmt(c.close-spread/2);$('ask').textContent=fmt(c.close+spread/2);refreshTimeLabels();$('progress').textContent=`Day ${Math.floor(c.minute/1440)+1} / ${state.rangeDays} · ${state.index+1} / ${state.candles.length}`;$('scrubber').value=state.index;
  const mv=(c.close-state.candles[0].open)/state.candles[0].open*100,b=$('moveBadge');b.textContent=`${mv>=0?'+':''}${mv.toFixed(2)}%`;b.className=mv>=0?'positive':'negative';
  const amount=Number($('size').value)||0,leverage=Number($('leverage').value)||1;$('margin').textContent=`${fmt(amount*leverage)} USDT`;
  const profit=totalPnl(),marginUsed=usedMargin(),roe=marginUsed?profit/marginUsed*100:0;$('pnl').textContent=`${profit>=0?'+':''}${fmt(profit)} USDT`;$('pnl').className=profit>=0?'positive':'negative';$('roe').textContent=`${roe>=0?'+':''}${roe.toFixed(2)}%`;$('roe').className=roe>=0?'positive':'negative';$('equity').textContent=`${fmt(state.balance+profit)} USDT`;renderPositions();
  $('balance').textContent=`${fmt(state.balance)} USDT`;$('usedMargin').textContent=`${fmt(marginUsed)} USDT`;$('freeMargin').textContent=`${fmt(Math.max(0,state.balance+profit-marginUsed))} USDT`;$('realized').textContent=`${fmt(state.realized)} USDT`;$('trades').textContent=state.trades;renderResults();draw();
  const liquidated=state.positions.find(p=>(p.side==='LONG'&&c.low<=p.liquidation)||(p.side==='SHORT'&&c.high>=p.liquidation));if(liquidated){closePosition(liquidated.id,'Liquidated',liquidated.liquidation);return}const triggered=state.positions.find(p=>p.sl&&((p.side==='LONG'&&c.low<=p.sl)||(p.side==='SHORT'&&c.high>=p.sl))||p.tp&&((p.side==='LONG'&&c.high>=p.tp)||(p.side==='SHORT'&&c.low<=p.tp)));if(triggered){const isSl=triggered.sl&&((triggered.side==='LONG'&&c.low<=triggered.sl)||(triggered.side==='SHORT'&&c.high>=triggered.sl));closePosition(triggered.id,isSl?'Stop loss triggered':'Take profit triggered',isSl?triggered.sl:triggered.tp)}
}
function play(){if(!state.candles.length)return toast('Load real market data first');state.playing=!state.playing;$('playBtn').textContent=state.playing?'Ⅱ':'▶';clearInterval(state.timer);if(state.playing)state.timer=setInterval(()=>{if(state.index>=state.candles.length-1){state.playing=false;clearInterval(state.timer);$('playBtn').textContent='▶';return}state.index++;update()},Math.max(40,700/Number($('speed').value)));}
function pauseReplay(){if(!state.playing)return;state.playing=false;clearInterval(state.timer);$('playBtn').textContent='▶'}
function openPosition(side){if(!state.candles.length)return toast('Load market data first');const margin=Number($('size').value),leverage=Number($('leverage').value);if(!margin||margin<=0)return toast('Enter a valid USDT margin');const c=current(),entry=c.close+(side==='LONG'?.003:-.003),notional=margin*leverage,quantity=notional/entry,liquidation=side==='LONG'?entry-entry/leverage:entry+entry/leverage,freeMargin=state.balance+totalPnl()-usedMargin(),sl=Number($('sl').value)||null,tp=Number($('tp').value)||null;if(margin>freeMargin)return toast(`Insufficient free margin · need ${fmt(margin)} USDT`);if(sl&&((side==='LONG'&&sl>=entry)||(side==='SHORT'&&sl<=entry)))return toast('Stop loss must be beyond the entry price');if(tp&&((side==='LONG'&&tp<=entry)||(side==='SHORT'&&tp>=entry)))return toast('Take profit must be beyond the entry price');const id=state.nextPositionId++;state.positions.push({id,side,entry,leverage,margin,notional,quantity,liquidation,sl,tp,openIndex:state.index,openMinute:c.minute});toast(`#${id} ${side} · ${fmt(margin)} USDT margin · ${leverage}×`);update();}
function closePosition(id,reason='Position closed',fill=current().close){const index=state.positions.findIndex(p=>p.id===id);if(index<0)return;const p=state.positions[index],profit=positionPnl(p,fill);state.balance+=profit;state.realized+=profit;state.trades++;state.history.unshift({id:p.id,side:p.side,entry:p.entry,exit:fill,profit,reason,leverage:p.leverage,margin:p.margin,notional:p.notional,openMinute:p.openMinute,closeMinute:current().minute});state.positions.splice(index,1);renderHistory();toast(`#${p.id} ${reason} · ${profit>=0?'+':''}${fmt(profit)} USDT`);update();}
function closeAllPositions(){if(!state.positions.length)return;const ids=state.positions.map(p=>p.id);ids.forEach(id=>closePosition(id,'Closed all',current().close))}
function renderHistory(){const list=$('historyList');$('historyCount').textContent=state.history.length;if(!state.history.length){list.innerHTML='<div class="history-empty">No closed trades yet</div>';return}list.innerHTML=state.history.map(t=>`<div class="history-row"><span><b class="${t.side==='LONG'?'positive':'negative'}">${t.side}</b><small>${fmt(t.margin)} USDT · ${t.leverage}× · ${t.reason}</small></span><span><b>${fmt(t.entry)} → ${fmt(t.exit)}</b><small>${timestampFor(t.openMinute)}<br>${timestampFor(t.closeMinute)}</small></span><span><b class="${t.profit>=0?'positive':'negative'}">${t.profit>=0?'+':''}${fmt(t.profit)}</b><small>USDT</small></span></div>`).join('')}
let toastTimer;function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
async function reset() {
  state.loadController?.abort();
  const controller = new AbortController();
  state.loadController = controller;
  const requestId = (state.loadId || 0) + 1;
  state.loadId = requestId;
  pauseReplay();
  Object.assign(state, { index: 0, balance: INITIAL_BALANCE, realized: 0, trades: 0, visibleCount: 90, viewOffset: 0, hoverIndex: null, candles: [], chartMeta: null, priceScale: 1, positions: [], history: [], nextPositionId: 1 });
  ['playBtn', 'scrubber', 'jumpDate', 'jumpBtn'].forEach(id => $(id).disabled = true);
  $('chartTooltip').classList.add('hidden');
  $('goLive').classList.add('hidden');
  $('emptyHint').style.display = 'flex';
  $('emptyHint').innerHTML = '<b>Loading one month of OKX candles...</b><span>0 days loaded | UTC</span>';
  $('progress').textContent = 'Loading...';
  renderHistory();
  renderResults();
  renderPositions();
  draw();
  try {
    const start = Date.parse(`${$('replayDate').value}T00:00:00Z`);
    if (!Number.isFinite(start)) throw new Error('Choose a valid start date');
    const end = monthEnd(start), days = (end - start) / 86400000;
    const chunks = new Array(days);
    let next = 0, completed = 0;
    async function worker() {
      while (next < days) {
        const day = next++;
        const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
        const response = await fetch(`/api/candles?date=${date}&days=1`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Market data request failed');
        if (requestId !== state.loadId) return;
        chunks[day] = payload.candles;
        completed++;
        $('emptyHint').querySelector('span').textContent = `${completed} / ${days} days loaded | UTC`;
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (requestId !== state.loadId) return;
    const candles = chunks.flat().filter(c => c.timestamp >= start && c.timestamp < end)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((c, i, all) => !i || c.timestamp !== all[i - 1].timestamp)
      .map(c => ({ ...c, minute: Math.floor((c.timestamp - start) / 60000) }));
    if (!candles.length) throw new Error('No XAGUSDT candles exist for this month');
    Object.assign(state, { candles, rangeStart: start, rangeEnd: end, rangeDays: days, index: Math.min(89, candles.length - 1) });
    $('scrubber').max = candles.length - 1;
    refreshJumpTime();
    $('emptyHint').style.display = 'none';
    ['playBtn', 'scrubber', 'jumpDate', 'jumpBtn'].forEach(id => $(id).disabled = false);
    toast(`Loaded ${candles.length} real OKX candles`);
    update();
  } catch (error) {
    controller.abort();
    if (requestId !== state.loadId) return;
    $('emptyHint').innerHTML = '<b>Real market data unavailable</b><span></span>';
    $('emptyHint').querySelector('span').textContent = error.message;
    $('progress').textContent = 'Load failed';
    toast(error.message);
  }
}

function seekTo(index) {
  if (!state.candles.length) return;
  if (state.positions.length) { $('scrubber').value = state.index; return toast('Close all positions before seeking'); }
  pauseReplay();
  state.index = Math.max(0, Math.min(state.candles.length - 1, index));
  state.viewOffset = 0;
  state.hoverIndex = null;
  $('chartTooltip').classList.add('hidden');
  $('goLive').classList.add('hidden');
  refreshJumpTime();
  update();
}

function jumpToDate() {
  const candidates = zonedCandidates($('jumpDate').value, timeZone);
  if (!candidates.length) return toast('Invalid local time (it may be skipped by daylight saving)');
  const timestamp = candidates[0];
  const index = seekIndex(state.candles, timestamp);
  if (index < 0) return toast(`Choose a date and time within the loaded candles (${timeZone})`);
  seekTo(index);
  if (!state.positions.length && candidates.length > 1) toast('This time occurs twice; using the earlier occurrence');
  if (!state.positions.length && state.candles[index].timestamp !== timestamp) toast('No candle at that time; moved to the next available minute');
}


function zoom(delta){state.visibleCount=Math.max(15,Math.min(1500,state.visibleCount+delta));draw();}
function priceZoom(factor){state.priceScale=Math.max(.25,Math.min(12,state.priceScale*factor));draw();}
function candleAtPointer(event){if(!state.chartMeta||!state.candles.length)return null;const rect=chart.getBoundingClientRect(),right=rect.width-78,{start,end}=state.chartMeta;state.crosshairY=event.clientY-rect.top;const count=end-start+1,step=(right-12)/state.visibleCount,firstX=12+(state.visibleCount-count)*step;if(event.clientX-rect.left<firstX||event.clientX-rect.left>right)return null;return Math.max(start,Math.min(end,start+Math.floor((event.clientX-rect.left-firstX)/step)));}
chart.addEventListener('wheel',e=>{e.preventDefault();const x=e.clientX-chart.getBoundingClientRect().left;if(x>chart.clientWidth-78)priceZoom(e.deltaY>0?.9:1.1);else zoom(e.deltaY<0?10:-10)},{passive:false});
chart.addEventListener('mousemove',e=>{if(state.dragging&&state.chartMeta){const pixels=e.clientX-state.dragX,perCandle=(chart.clientWidth-90)/state.visibleCount;if(Math.abs(pixels)>=perCandle){state.viewOffset=Math.max(0,Math.min(state.chartMeta.bars.length-1,state.viewOffset+Math.round(-pixels/perCandle)));state.dragX=e.clientX;draw()}return}state.hoverIndex=candleAtPointer(e);const tip=$('chartTooltip');if(state.hoverIndex===null){tip.classList.add('hidden');draw();return}const c=state.chartMeta.bars[state.hoverIndex],rect=chart.getBoundingClientRect(),period=Number($('timeframe').value),range=period===1?timestampFor(c.minute):`${timestampFor(c.minute)} — ${timestampFor(c.endMinute)}`;tip.innerHTML=`<b>${range}</b><br><span>O</span> ${fmt(c.open)} &nbsp; <span>H</span> ${fmt(c.high)}<br><span>L</span> ${fmt(c.low)} &nbsp; <span>C</span> ${fmt(c.close)}`;tip.classList.remove('hidden');tip.style.left=`${Math.min(rect.width-220,Math.max(8,e.clientX-rect.left+14))}px`;tip.style.top=`${Math.max(8,e.clientY-rect.top-62)}px`;draw()});
chart.addEventListener('mouseleave',()=>{state.hoverIndex=null;state.dragging=false;chart.classList.remove('dragging');$('chartTooltip').classList.add('hidden');draw()});
chart.addEventListener('mousedown',e=>{if(!state.candles.length)return;const x=e.clientX-chart.getBoundingClientRect().left;if(x>chart.clientWidth-78){state.priceDragging=true;state.priceDragY=e.clientY}else{state.dragging=true;state.dragX=e.clientX}chart.classList.add('dragging')});
chart.addEventListener('mousemove',e=>{if(!state.priceDragging)return;const dy=state.priceDragY-e.clientY;if(Math.abs(dy)>2){priceZoom(Math.exp(dy*.008));state.priceDragY=e.clientY}});
window.addEventListener('mouseup',()=>{state.dragging=false;state.priceDragging=false;chart.classList.remove('dragging')});
$('playBtn').onclick=play;$('longBtn').onclick=()=>openPosition('LONG');$('shortBtn').onclick=()=>openPosition('SHORT');$('speed').onchange=()=>{if(state.playing){play();play()}};document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{$('size').value=Math.max(.1,(Number($('size').value)+Number(b.dataset.step))).toFixed(1);update()});$('size').oninput=update;window.addEventListener('resize',resize);new ResizeObserver(resize).observe(chart);reset();resize();
$('zoomIn').onclick=()=>zoom(-10);
$('zoomOut').onclick=()=>zoom(10);
$('zoomReset').onclick=()=>{ state.visibleCount=90; state.viewOffset=0; draw(); };
$('priceZoomIn').onclick=()=>priceZoom(1.2);
$('priceZoomOut').onclick=()=>priceZoom(.8);
$('priceZoomReset').onclick=()=>{state.priceScale=1;draw()};
$('timeframe').onchange=()=>{ state.viewOffset=0; state.hoverIndex=null; $('chartTooltip').classList.add('hidden'); draw(); };
document.querySelectorAll('[data-timeframe]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-timeframe]').forEach(b=>b.classList.remove('active'));button.classList.add('active');$('timeframe').value=button.dataset.timeframe;$('legendTimeframe').textContent=button.textContent;state.viewOffset=0;state.hoverIndex=null;$('goLive').classList.add('hidden');draw()});
chart.addEventListener('mousemove',event=>{state.crosshairY=event.clientY-chart.getBoundingClientRect().top;$('goLive').classList.toggle('hidden',state.viewOffset===0)});
$('goLive').onclick=()=>{state.viewOffset=0;$('goLive').classList.add('hidden');draw()};
$('indicatorBtn').onclick=()=>toast('RSI 14 and MACD 12/26/9 are active');
$('snapshotBtn').onclick=()=>{const link=document.createElement('a');link.download=`XAGUSDT-${$('replayDate').value}-${$('legendTimeframe').textContent}.png`;link.href=chart.toDataURL('image/png');link.click();toast('Chart snapshot saved')};
document.querySelectorAll('.drawing-tools button').forEach(button=>button.onclick=()=>{document.querySelectorAll('.drawing-tools button').forEach(b=>b.classList.remove('active'));button.classList.add('active');toast(`${button.title} tool selected`)});
$('replayDate').addEventListener('change',()=>{state.history=[];renderHistory();renderResults()});
$('closeBtn').onclick=closeAllPositions;
$('resetBtn').onclick=()=>{state.positions=[];state.history=[];state.nextPositionId=1;renderHistory();renderResults();reset()};
$('replayDate').onchange=()=>{state.positions=[];state.nextPositionId=1;reset()};
$('scrubber').oninput=e=>seekTo(Number(e.target.value));
$('jumpBtn').onclick=jumpToDate;
$('jumpDate').addEventListener('keydown', event => { if (event.key === 'Enter') jumpToDate(); });
$('timeGrid').onchange=draw;
$('priceGrid').onchange=draw;
$('leverage').onchange=update;
$('positionsList').addEventListener('pointerdown',event=>{if(event.target.closest('[data-close-position]'))pauseReplay()});
$('positionsList').addEventListener('click',event=>{const button=event.target.closest('[data-close-position]');if(!button)return;event.preventDefault();event.stopPropagation();closePosition(Number(button.dataset.closePosition))});
