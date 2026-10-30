import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplay } from './useReplay.js';
import { createChartController } from './chart-controller.js';
import { ExchangeHeader, MarketStrip, OrderTicket, TradingLedger, AccountSummary } from './TradingPanels.jsx';

const fmt = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const frames = [[1, '1m'], [5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [60, '1H'], [240, '4H'], [1440, '1D']];
const tools = [['cursor', '＋', 'Crosshair / Pan (Esc)'], ['trend', '╱', 'Trend line: click two points'], ['horizontal', '―', 'Horizontal line'], ['measure', '↔', 'Measure: click two points'], ['text', 'T', 'Add text'], ['zoom', '⌕', 'Zoom at pointer'], ['delete', '⌫', 'Delete all drawings']];
const { zonedTime, zonedCandidates, seekIndex } = globalThis.ChartUtils;

function CandleCanvas({ model, options, controller, onNeedEarlier, onHover }) {
  const canvas = useRef(null);
  const paneDrag = useRef(null);
  const [paneHeights, setPaneHeights] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem('argent-indicator-heights')); if (Number.isFinite(value?.rsi) && Number.isFinite(value?.macd)) return { rsi: Math.max(40, Math.min(500, value.rsi)), macd: Math.max(40, Math.min(500, value.macd)) }; } catch {}
    return { rsi: 70, macd: 100 };
  });
  const [layout, setLayout] = useState(null);
  const onPaneLayout = useCallback(next => setLayout(previous => previous?.rsi === next.rsi && previous?.macd === next.macd && previous?.budget === next.budget && previous?.rsiDivider === next.rsiDivider ? previous : next), []);
  const resizePane = (pane, value) => {
    if (!layout) return;
    const other = pane === 'rsi' ? 'macd' : 'rsi';
    const next = { rsi: layout.rsi, macd: layout.macd, [pane]: Math.max(40, Math.min(500, layout.budget - layout[other], Math.round(value))) };
    setPaneHeights(next);
    try { localStorage.setItem('argent-indicator-heights', JSON.stringify(next)); } catch {}
  };
  const stopPaneDrag = event => { paneDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const [annotation, setAnnotation] = useState(null);
  const requestText = useCallback((point, position) => setAnnotation({ point, position, text: '' }), []);
  useEffect(() => {
    const chart = createChartController(canvas.current);
    controller.current = chart;
    return () => { chart.destroy(); controller.current = null; };
  }, [controller]);
  useEffect(() => {
    controller.current?.update(model, { ...options, paneHeights, onPaneLayout, onNeedEarlier, onHover, onTextRequest: requestText });
  }, [model, options, paneHeights, onPaneLayout, controller, onNeedEarlier, onHover, requestText]);
  return <>
    <canvas id="chart" ref={canvas} tabIndex={0} aria-label="Candlestick chart. Drag to pan, scroll to zoom. Hover to inspect candle values. Drag axes to scale."/>
    {model.indicators && model.candles.length > 0 && layout && ['rsi', 'macd'].map(pane => <div key={pane} className="indicator-height-handle" style={{ top: layout[`${pane}Divider`] }} role="separator" aria-label={`Resize ${pane.toUpperCase()} height`} aria-orientation="horizontal" aria-valuemin={40} aria-valuemax={Math.min(500, layout.budget - layout[pane === 'rsi' ? 'macd' : 'rsi'])} aria-valuenow={Math.round(layout[pane])} tabIndex={0} title={`Drag to resize ${pane.toUpperCase()}. Double-click to reset.`}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); paneDrag.current = { pane, y: event.clientY, height: layout[pane] }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (paneDrag.current?.pane === pane) resizePane(pane, paneDrag.current.height - (event.clientY - paneDrag.current.y)); }}
      onPointerUp={stopPaneDrag} onPointerCancel={stopPaneDrag} onLostPointerCapture={() => { paneDrag.current = null; }}
      onDoubleClick={() => resizePane(pane, pane === 'rsi' ? 70 : 100)}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); resizePane(pane, layout[pane] + (event.key === 'ArrowUp' ? 10 : -10)); } else if (event.key === 'Home') { event.preventDefault(); resizePane(pane, pane === 'rsi' ? 70 : 100); } }}><span/><b>{pane.toUpperCase()}</b></div>)}
    {annotation && <input autoFocus className="drawing-text" aria-label="Chart annotation" maxLength={120} placeholder="Type note, Enter to save" value={annotation.text}
      style={{ left: Math.min(canvas.current.clientWidth - 170, annotation.position.x) + 44, top: annotation.position.y }}
      onChange={event => setAnnotation({ ...annotation, text: event.target.value })}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { if (event.key === 'Enter') controller.current.addText(annotation.point, annotation.text); setAnnotation(null); canvas.current.focus(); } }}/>} 
  </>;
}

function ChartPanel({ replay }) {
  const { model, date, dates } = replay;
  const controller = useRef(null);
  const [timeframe, setTimeframe] = useState(1), [indicators, setIndicators] = useState(true), [tool, setTool] = useState('cursor');
  const [zone, setZone] = useState(() => { try { return localStorage.getItem('argent-time-zone') || 'UTC'; } catch { return 'UTC'; } });
  const [timeGrid, setTimeGrid] = useState(0), [priceGrid, setPriceGrid] = useState(0), [jump, setJump] = useState('');
  const [hover, setHover] = useState(null), [view, setView] = useState({ offset: 0, visibleCount: 120 });
  const [syncStatus, setSyncStatus] = useState('');
  const onHover = useCallback(candle => setHover(previous => previous?.timestamp === candle.timestamp && previous?.close === candle.close && previous?.high === candle.high && previous?.low === candle.low ? previous : candle), []);
  const onView = useCallback(next => setView(previous => previous.offset === next.offset && previous.visibleCount === next.visibleCount ? previous : next), []);
  const options = useMemo(() => ({ timeframe, timeZone: zone, timeGrid, priceGrid, onView, onToolChange: setTool }), [timeframe, zone, timeGrid, priceGrid, onView]);
  const chartModel = useMemo(() => ({ ...model, indicators }), [model, indicators]);
  const current = model.candles[model.index], quote = hover || current;
  const stamp = current ? zonedTime(current.timestamp, zone).value.replace('T', ' ') : '—';
  useEffect(() => setHover(null), [model.session]);
  const zones = useMemo(() => [...new Set(['UTC', Intl.DateTimeFormat().resolvedOptions().timeZone, 'Asia/Shanghai', 'America/New_York', 'Europe/London', ...(Intl.supportedValuesOf?.('timeZone') || [])])], []);
  const changeZone = value => { setZone(value); try { localStorage.setItem('argent-time-zone', value); } catch {} };
  const goTo = () => {
    const candidates = zonedCandidates(jump, zone);
    const index = candidates.length ? seekIndex(model.candles, candidates[0]) : -1;
    if (index < 0) { setSyncStatus('Choose a valid time within the loaded local candles.'); return; }
    replay.seek(index);
  };
  return <section className="chart-panel">
    <div className="toolbar chart-toolbar">
      <span className="chart-title">Chart</span>
      <div className="timeframe-tabs" id="timeframeTabs">{frames.map(([value, label]) => <button key={value} className={timeframe === value ? 'active' : ''} onClick={() => setTimeframe(value)}>{label}</button>)}</div>
      <div className="chart-view-actions"><button id="zoomOut" className="ghost" title="Zoom out" onClick={() => controller.current?.zoom(15)}>−</button><button id="zoomIn" className="ghost" title="Zoom in" onClick={() => controller.current?.zoom(-15)}>+</button><button id="zoomReset" className="ghost" onClick={() => controller.current?.fit()}>Fit</button><button id="priceZoomReset" className="ghost" onClick={() => controller.current?.autoScale()}>Auto</button></div>
    </div>
    <details className="chart-preferences"><summary>Chart settings <span>Time zone · Go to date · Grid</span></summary><div className="chart-settings">
      <label htmlFor="timeZone">TIME ZONE</label><select id="timeZone" value={zone} onChange={event => changeZone(event.target.value)}>{zones.map(value => <option key={value}>{value}</option>)}</select>
      <label htmlFor="jumpDate">GO TO ({zone})</label><input id="jumpDate" type="datetime-local" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') goTo(); }}/><button id="jumpBtn" className="ghost" disabled={!current} onClick={goTo}>Go</button>
      <label htmlFor="timeGrid">TIME GRID</label><select id="timeGrid" value={timeGrid} onChange={event => setTimeGrid(Number(event.target.value))}>{[0, 1, 5, 15, 30, 60, 240, 1440].map(value => <option key={value} value={value}>{value ? `${value} min` : 'Auto'}</option>)}</select>
      <label htmlFor="priceGrid">PRICE GRID</label><select id="priceGrid" value={priceGrid} onChange={event => setPriceGrid(Number(event.target.value))}>{[0, .01, .05, .1, .25, .5, 1, 2, 5].map(value => <option key={value} value={value}>{value || 'Auto'}</option>)}</select>
      {syncStatus && <span className="settings-message">{syncStatus}</span>}
    </div></details>
    <div className="quote-strip"><div className="chart-actions"><span className="candle-type">Candles</span><button id="indicatorBtn" className={indicators ? 'active' : ''} aria-pressed={indicators} onClick={() => setIndicators(value => !value)}>ƒx RSI · MACD</button><button id="snapshotBtn" onClick={() => { const link = document.createElement('a'); link.download = `XAGUSDT-${date}.png`; link.href = controller.current.snapshot(); link.click(); }}>⌁ Snapshot</button></div>
      {['open', 'high', 'low', 'close'].map(key => <div key={key}><small>{key.toUpperCase()}</small><b id={`${key}Val`}>{quote ? fmt(quote[key]) : '—'}</b></div>)}
    </div>
    <div className="chart-wrap">
      <nav className="drawing-tools" aria-label="Chart drawing tools">{tools.map(([value, icon, title]) => <button key={value} title={title} aria-label={title} aria-pressed={tool === value} className={tool === value ? 'active' : ''} onClick={() => value === 'delete' ? controller.current?.clearDrawings() : controller.current?.selectTool(value)}>{icon}</button>)}</nav>
      <div className="chart-legend"><b>XAGUSDT</b><span>· {frames.find(([value]) => value === timeframe)[1]} · LOCAL DATA</span>{quote && <span>{zonedTime(quote.timestamp, zone).value.replace('T', ' ')}</span>}</div>
      <CandleCanvas model={chartModel} options={options} controller={controller} onNeedEarlier={replay.loadEarlier} onHover={onHover}/>
      {!current && <div id="emptyHint" className="empty-hint"><b>{replay.loading ? 'Reading local candles…' : 'Local archive'}</b><span>{replay.status}</span></div>}
      {Math.abs(view.offset) > .01 && <button id="goLive" className="go-live" onClick={() => controller.current.latest()}>Latest replay bar</button>}
    </div>
    <div className="replay-controls">
      <span className="replay-mode"><i/>REPLAY</span>
      <button id="playBtn" className="play" aria-label={replay.playing ? 'Pause' : 'Play'} disabled={!current} onClick={replay.togglePlay}>{replay.playing ? 'Ⅱ' : '▶'}</button>
      <select id="speed" aria-label="Replay speed" value={replay.speed} onChange={event => replay.setSpeed(Number(event.target.value))}>{[1, 5, 15, 60, 240, 1440].map(value => <option key={value} value={value}>{value === 1440 ? '1 day/sec' : `${value}×`}</option>)}</select>
      <input id="replayDate" aria-label="Replay week start (UTC)" type="date" value={date} min={dates[0]} max={dates.at(-1)} disabled={replay.loading || !!model.positions.length} onChange={event => replay.loadDate(event.target.value)}/>
      <button id="resetBtn" className="ghost" title="Restart replay; keep recorded trades" disabled={!date || replay.loading || !!model.positions.length} onClick={() => replay.loadDate(date)}>↻</button>
      <b id="timeLabel">{stamp}</b>
    </div>
    <div className="timeline"><span>REPLAY · {zone}</span><input id="scrubber" aria-label="Replay position" type="range" min={0} max={Math.max(0, model.candles.length - 1)} value={model.index} disabled={!current || !!model.positions.length} onChange={event => replay.seek(Number(event.target.value))}/><span>{current ? `${model.index + 1} / ${model.candles.length.toLocaleString()}` : '—'}</span></div>
  </section>;
}

function ResizableChart({ replay }) {
  const container = useRef(null), drag = useRef(null);
  const [height, setHeight] = useState(() => {
    try { const value = Number(localStorage.getItem('argent-chart-height')); return value >= 500 && value <= 1400 ? value : null; } catch { return null; }
  });
  const defaultHeight = () => window.innerWidth <= 850 ? 610 : Math.max(540, Math.min(730, window.innerHeight * .64));
  const resize = value => {
    const next = Math.max(500, Math.min(1400, Math.round(value)));
    setHeight(next);
    try { localStorage.setItem('argent-chart-height', String(next)); } catch {}
  };
  const resetHeight = () => { setHeight(null); try { localStorage.removeItem('argent-chart-height'); } catch {} };
  const stopDrag = event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  return <div ref={container} className="resizable-chart" style={{ '--chart-height': height ? `${height}px` : undefined }}>
    <ChartPanel replay={replay}/>
    <div className="chart-height-handle" role="separator" aria-label="Resize chart height" aria-orientation="horizontal" aria-valuemin={500} aria-valuemax={1400} aria-valuenow={height ?? Math.round(defaultHeight())} tabIndex={0} title="Drag to resize chart. Double-click to reset."
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { y: event.clientY, height: container.current.querySelector('.chart-panel').getBoundingClientRect().height }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.height + event.clientY - drag.current.y); }}
      onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { drag.current = null; }} onDoubleClick={resetHeight}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); resize((height ?? defaultHeight()) + (event.key === 'ArrowDown' ? 20 : -20)); } else if (event.key === 'Home') { event.preventDefault(); resetHeight(); } }}><span/></div>
  </div>;
}

export default function App() {
  const replay = useReplay();
  const [tab, setTab] = useState('positions');
  const navigate = next => { setTab(next); if (next !== 'positions') document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  return <div className="exchange-app">
    <ExchangeHeader replay={replay} tab={tab} onNavigate={navigate}/>
    <MarketStrip model={replay.model}/>
    <main className="exchange-workspace"><div className="trading-workspace"><ResizableChart replay={replay}/><TradingLedger replay={replay} tab={tab} setTab={setTab}/></div><aside className="exchange-sidebar"><OrderTicket replay={replay}/><AccountSummary replay={replay}/></aside></main>
    <footer className="exchange-footer"><span className="connection-badge"><i/>{replay.dates.length} local data days</span><span id="dataStatus" role="status">{replay.status}</span><span>SIMULATED TRADING · LOCAL RECORDS</span></footer>
  </div>;
}
