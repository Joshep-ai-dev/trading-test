import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplay } from './useReplay.js';
import IndicatorLibrary from './IndicatorLibrary.jsx';
import StudySettings from './StudySettings.jsx';
import { readIndicatorSettings, INDICATOR_DEFINITIONS } from './indicators.js';
import { createChartController } from './chart-controller.js';
import { ExchangeHeader, MarketStrip, OrderTicket, TradingLedger, AccountSummary } from './TradingPanels.jsx';

const fmt = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const frames = [[1, '1m'], [5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [60, '1H'], [240, '4H'], [1440, '1D']];
const tools = [['cursor', '＋', 'Crosshair / Pan (Esc)'], ['trend', '╱', 'Trend line: click two points'], ['horizontal', '―', 'Horizontal line'], ['measure', '↔', 'Measure: click two points'], ['text', 'T', 'Add text'], ['zoom', '⌕', 'Zoom at pointer'], ['delete', '⌫', 'Delete all drawings']];
const { zonedTime, zonedCandidates, seekIndex } = globalThis.ChartUtils;

function StudyWindowHeader({ study, top, maximized, overlay, onAction }) {
  return <div className={`study-pane-header${study.hidden ? ' study-hidden' : ''}${overlay ? ' overlay-study-header' : ''}`} style={{ top }}>
    <button className="study-pane-name" title="Double-click to open settings" onDoubleClick={() => onAction(study.key, 'settings')}><strong>{study.name}</strong><span>{study.parameters}</span>{study.value && <b>{study.value}</b>}</button>
    <div className="study-pane-controls">
      <button title="Indicator settings" aria-label={`${study.name} settings`} onClick={() => onAction(study.key, 'settings')}>⚙</button>
      <button title={study.hidden ? 'Show indicator' : 'Hide indicator'} aria-label={`${study.hidden ? 'Show' : 'Hide'} ${study.name}`} onClick={() => onAction(study.key, 'hide')}>{study.hidden ? '◌' : '◉'}</button>
      {!overlay && <><button className="study-move" aria-label={`Move ${study.name} up`} onClick={() => onAction(study.key, 'up')}>↑</button><button className="study-move" aria-label={`Move ${study.name} down`} onClick={() => onAction(study.key, 'down')}>↓</button><button title={maximized ? 'Restore pane' : 'Maximize pane'} aria-label={`${maximized ? 'Restore' : 'Maximize'} ${study.name}`} onClick={() => onAction(study.key, 'maximize')}>{maximized ? '▣' : '□'}</button></>}
      <button title="Remove indicator" aria-label={`Remove ${study.name}`} onClick={() => onAction(study.key, 'remove')}>×</button>
    </div>
  </div>;
}

function CandleCanvas({ model, options, controller, onNeedEarlier, onHover }) {
  const canvas = useRef(null);
  const paneDrag = useRef(null);
  const [paneHeights, setPaneHeights] = useState(() => {
    const defaults = { rsi: 70, macd: 100, atr: 70, adx: 70 };
    try { const saved = JSON.parse(localStorage.getItem('argent-indicator-heights')); for (const key of Object.keys(defaults)) if (Number.isFinite(saved?.[key])) defaults[key] = Math.max(40, Math.min(500, saved[key])); } catch {}
    return defaults;
  });
  const [layout, setLayout] = useState(null);
  const onPaneLayout = useCallback(next => setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next), []);
  const resizePane = (pane, value) => {
    if (!layout) return;
    const others = layout.panes.filter(item => item.key !== pane).reduce((sum, item) => sum + item.height, 0);
    const active = Object.fromEntries(layout.panes.map(item => [item.key, item.height]));
    const next = { ...paneHeights, ...active, [pane]: Math.max(layout.minimum, Math.min(500, layout.budget - others, Math.round(value))) };
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
    {model.indicators && model.candles.length > 0 && layout && <>{layout.panes.map(pane => <StudyWindowHeader key={pane.key} study={pane} top={pane.top - 1} maximized={layout.maximized === pane.key} onAction={options.onStudyAction}/>)}{layout.overlays?.map((study, index) => <StudyWindowHeader key={study.key} study={study} top={30 + index * 24} overlay onAction={options.onStudyAction}/>)}</>}
    {model.indicators && model.candles.length > 0 && layout && !layout.maximized && layout.panes.map(({ key: pane, divider }) => <div key={pane} className="indicator-height-handle" style={{ top: divider }} role="separator" aria-label={`Resize ${pane.toUpperCase()} height`} aria-orientation="horizontal" aria-valuemin={layout.minimum} aria-valuemax={Math.min(500, layout.budget - layout.panes.filter(item => item.key !== pane).reduce((sum, item) => sum + item.height, 0))} aria-valuenow={Math.round(layout[pane])} tabIndex={0} title={`Drag to resize ${pane.toUpperCase()}. Double-click to reset.`}
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
  const [indicatorConfig, setIndicatorConfig] = useState(readIndicatorSettings), [showIndicatorSettings, setShowIndicatorSettings] = useState(false);
  const [activeStudy, setActiveStudy] = useState(null), [maximizedPane, setMaximizedPane] = useState(null);
  const [paneOrder, setPaneOrder] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('argent-pane-order')); if (Array.isArray(saved)) return [...new Set([...saved.filter(key => INDICATOR_DEFINITIONS[key]?.pane), 'rsi', 'macd', 'atr', 'adx'])]; } catch {}
    return ['rsi', 'macd', 'atr', 'adx'];
  });
  const onStudyAction = useCallback((key, action) => {
    if (action === 'settings') setActiveStudy(key);
    if (action === 'hide') setIndicatorConfig(previous => ({ ...previous, [key]: { ...previous[key], hidden: !previous[key].hidden } }));
    if (action === 'remove') { setIndicatorConfig(previous => ({ ...previous, [key]: { ...previous[key], enabled: false } })); setMaximizedPane(previous => previous === key ? null : previous); }
    if (action === 'maximize') setMaximizedPane(previous => previous === key ? null : key);
    if (action === 'up' || action === 'down') setPaneOrder(previous => {
      const next = [...previous], active = previous.filter(item => indicatorConfig[item].enabled), current = active.indexOf(key), target = current + (action === 'up' ? -1 : 1);
      if (target >= 0 && target < active.length) { const a = next.indexOf(key), b = next.indexOf(active[target]); [next[a], next[b]] = [next[b], next[a]]; }
      return next;
    });
  }, [indicatorConfig]);
  useEffect(() => { try { localStorage.setItem('argent-indicator-settings', JSON.stringify(indicatorConfig)); } catch {} if (maximizedPane && !indicatorConfig[maximizedPane].enabled) setMaximizedPane(null); }, [indicatorConfig, maximizedPane]);
  useEffect(() => { try { localStorage.setItem('argent-pane-order', JSON.stringify(paneOrder)); } catch {} }, [paneOrder]);
  const [zone, setZone] = useState(() => {
    try {
      if (!localStorage.getItem('argent-gmt9-default')) {
        localStorage.setItem('argent-time-zone', 'Asia/Tokyo');
        localStorage.setItem('argent-gmt9-default', '1');
      }
      return localStorage.getItem('argent-time-zone') || 'Asia/Tokyo';
    } catch { return 'Asia/Tokyo'; }
  });
  const [timeGrid, setTimeGrid] = useState(0), [priceGrid, setPriceGrid] = useState(0), [jump, setJump] = useState('');
  const [hover, setHover] = useState(null), [view, setView] = useState({ offset: 0, visibleCount: 120 });
  const [syncStatus, setSyncStatus] = useState('');
  const onHover = useCallback(candle => setHover(previous => previous?.timestamp === candle.timestamp && previous?.close === candle.close && previous?.high === candle.high && previous?.low === candle.low ? previous : candle), []);
  const onView = useCallback(next => setView(previous => previous.offset === next.offset && previous.visibleCount === next.visibleCount ? previous : next), []);
  const options = useMemo(() => ({ timeframe, timeZone: zone, timeGrid, priceGrid, indicatorConfig, paneOrder, maximizedPane, onStudyAction, onView, onToolChange: setTool }), [timeframe, zone, timeGrid, priceGrid, indicatorConfig, paneOrder, maximizedPane, onStudyAction, onView]);
  const chartModel = useMemo(() => ({ ...model, indicators }), [model, indicators]);
  const current = model.candles[model.index], quote = hover || current;
  const stamp = current ? zonedTime(current.timestamp, zone).value.replace('T', ' ') : '—';
  useEffect(() => setHover(null), [model.session]);
  const zones = useMemo(() => [...new Set(['Asia/Tokyo', 'UTC', Intl.DateTimeFormat().resolvedOptions().timeZone, 'Asia/Shanghai', 'America/New_York', 'Europe/London', ...(Intl.supportedValuesOf?.('timeZone') || [])])], []);
  const changeZone = value => { setZone(value); try { localStorage.setItem('argent-time-zone', value); } catch {} };
  const goTo = () => {
    const candidates = zonedCandidates(jump, zone);
    const index = candidates.length ? seekIndex(model.candles, candidates[0]) : -1;
    if (index < 0) { setSyncStatus('Choose a valid time within the loaded local candles.'); return; }
    replay.seek(index);
  };
  return <section className="chart-panel" style={{ '--min-chart-height': `${400 + (indicators ? Object.keys(INDICATOR_DEFINITIONS).filter(key => INDICATOR_DEFINITIONS[key].pane && indicatorConfig[key].enabled).length : 0) * 58}px` }}>
    {activeStudy && <StudySettings key={activeStudy} study={activeStudy} config={indicatorConfig} onCancel={() => setActiveStudy(null)} onApply={config => { setIndicatorConfig(config); setActiveStudy(null); }}/>}
    {showIndicatorSettings && <IndicatorLibrary config={indicatorConfig} onCancel={() => setShowIndicatorSettings(false)} onAdd={key => { setIndicatorConfig(previous => ({ ...previous, [key]: { ...previous[key], enabled: true, hidden: false } })); setIndicators(true); }} onConfigure={key => { setShowIndicatorSettings(false); setActiveStudy(key); }}/>}
    <div className="toolbar chart-toolbar">
      <span className="chart-title">Chart</span>
      <div className="timeframe-tabs" id="timeframeTabs">{frames.map(([value, label]) => <button key={value} className={timeframe === value ? 'active' : ''} onClick={() => setTimeframe(value)}>{label}</button>)}</div>
      <div className="chart-view-actions"><button id="zoomOut" className="ghost" title="Zoom out" onClick={() => controller.current?.zoom(15)}>−</button><button id="zoomIn" className="ghost" title="Zoom in" onClick={() => controller.current?.zoom(-15)}>+</button><button id="zoomReset" className="ghost" onClick={() => controller.current?.fit()}>Fit</button><button id="priceZoomReset" className="ghost" onClick={() => controller.current?.autoScale()}>Auto</button></div>
    </div>
    <details className="chart-preferences"><summary>Chart settings <span>Time zone · Go to date · Grid</span></summary><div className="chart-settings">
      <label htmlFor="timeZone">TIME ZONE</label><select id="timeZone" value={zone} onChange={event => changeZone(event.target.value)}>{zones.map(value => <option key={value} value={value}>{value === 'Asia/Tokyo' ? 'GMT+9 (Tokyo)' : value}</option>)}</select>
      <label htmlFor="jumpDate">GO TO ({zone})</label><input id="jumpDate" type="datetime-local" value={jump} onChange={event => setJump(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') goTo(); }}/><button id="jumpBtn" className="ghost" disabled={!current} onClick={goTo}>Go</button>
      <label htmlFor="timeGrid">TIME GRID</label><select id="timeGrid" value={timeGrid} onChange={event => setTimeGrid(Number(event.target.value))}>{[0, 1, 5, 15, 30, 60, 240, 1440].map(value => <option key={value} value={value}>{value ? `${value} min` : 'Auto'}</option>)}</select>
      <label htmlFor="priceGrid">PRICE GRID</label><select id="priceGrid" value={priceGrid} onChange={event => setPriceGrid(Number(event.target.value))}>{[0, .01, .05, .1, .25, .5, 1, 2, 5].map(value => <option key={value} value={value}>{value || 'Auto'}</option>)}</select>
      {syncStatus && <span className="settings-message">{syncStatus}</span>}
    </div></details>
    <div className="quote-strip"><div className="chart-actions"><span className="candle-type">Candles</span><button id="indicatorSettings" className="indicator-library-trigger" aria-label="Open indicator library" onClick={() => setShowIndicatorSettings(true)}><span>fx</span> Indicators</button><button id="indicatorBtn" className="indicator-master-visibility" title={indicators ? 'Hide all indicators' : 'Show all indicators'} aria-label={indicators ? 'Hide all indicators' : 'Show all indicators'} aria-pressed={indicators} onClick={() => setIndicators(value => !value)}>{indicators ? '\u25c9' : '\u25cc'}</button><button id="snapshotBtn" onClick={() => { const link = document.createElement('a'); link.download = `XAGUSDT-${date}.png`; link.href = controller.current.snapshot(); link.click(); }}>⌁ Snapshot</button></div>
      {['open', 'high', 'low', 'close'].map(key => <div key={key}><small>{key.toUpperCase()}</small><b id={`${key}Val`}>{quote ? fmt(quote[key]) : '—'}</b></div>)}
    </div>
    <div className="chart-wrap">
      <nav className="drawing-tools" style={{ visibility: maximizedPane && indicators ? 'hidden' : undefined }} aria-label="Chart drawing tools">{tools.map(([value, icon, title]) => <button key={value} title={title} aria-label={title} aria-pressed={tool === value} className={tool === value ? 'active' : ''} onClick={() => value === 'delete' ? controller.current?.clearDrawings() : controller.current?.selectTool(value)}>{icon}</button>)}</nav>
      <div className="chart-legend" style={{ display: maximizedPane && indicators ? 'none' : undefined }}><b>XAGUSDT</b><span>· {frames.find(([value]) => value === timeframe)[1]} · {replay.dataMode === 'hosted' ? 'OKX DATA' : 'LOCAL DATA'}</span>{quote && <span>{zonedTime(quote.timestamp, zone).value.replace('T', ' ')}</span>}</div>
      <CandleCanvas model={chartModel} options={options} controller={controller} onNeedEarlier={replay.loadEarlier} onHover={onHover}/>
      {!current && <div id="emptyHint" className="empty-hint"><b>{replay.loading ? 'Loading candles...' : replay.dataMode === 'hosted' ? 'Historical market data' : 'Local archive'}</b><span>{replay.status}</span></div>}
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
  const titlePrice = replay.model.candles[replay.model.index]?.close;
  useEffect(() => {
    document.title = Number.isFinite(titlePrice) ? `${fmt(titlePrice)} | XAGUSDT · Argent Replay` : 'XAGUSDT | Argent Replay';
  }, [titlePrice]);
  const [tab, setTab] = useState('positions');
  const navigate = next => { setTab(next); if (next !== 'positions') document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  return <div className="exchange-app">
    <ExchangeHeader replay={replay} tab={tab} onNavigate={navigate}/>
    <MarketStrip model={replay.model}/>
    <main className="exchange-workspace"><div className="trading-workspace"><ResizableChart replay={replay}/><TradingLedger replay={replay} tab={tab} setTab={setTab}/></div><aside className="exchange-sidebar"><OrderTicket replay={replay}/><AccountSummary replay={replay}/></aside></main>
    <footer className="exchange-footer"><span className="connection-badge"><i/>{replay.dates.length} {replay.dataMode === 'hosted' ? 'available' : 'local data'} days</span><span id="dataStatus" role="status">{replay.status}</span><span>SIMULATED TRADING · LOCAL RECORDS</span></footer>
  </div>;
}
