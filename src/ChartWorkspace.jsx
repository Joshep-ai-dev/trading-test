import ChartIcon from './ChartIcon.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { CHART_TYPES, DRAWING_TOOLS, WORKSPACE_DEFAULTS } from './chart-workspace.js';

export function WorkspaceToolbar({ settings, update, drawings, controller, expanded, onExpand, requestedPanel }) {
  const [panel, setPanel] = useState(null);
  const root = useRef(null);
  useEffect(() => { if (requestedPanel) setPanel(requestedPanel.name); }, [requestedPanel]);
  useEffect(() => {
    if (!panel) return;
    const close = event => { if (event.key === 'Escape' || (event.type === 'pointerdown' && !root.current?.contains(event.target))) setPanel(null); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [panel]);
  const toggle = key => update({ [key]: !settings[key] });
  return <div className="workspace-tools" ref={root}>
    <label className="chart-type-picker"><span className="sr-only">Chart type</span><select aria-label="Chart type" value={settings.chartType} onChange={event => update({ chartType: event.target.value })}>{Object.entries(CHART_TYPES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    <span className="workspace-divider"/>
    <button aria-label="Undo drawing" title="Undo (Ctrl+Z)" disabled={!drawings.canUndo} onClick={() => controller.current?.undo()}><ChartIcon name="undo"/></button>
    <button aria-label="Redo drawing" title="Redo (Ctrl+Shift+Z)" disabled={!drawings.canRedo} onClick={() => controller.current?.redo()}><ChartIcon name="redo"/></button>
    <span className="workspace-divider"/>
    <label title="Drawing color"><span className="sr-only">Drawing color</span><input aria-label="Drawing color" type="color" value={settings.drawingColor} onChange={event => { update({ drawingColor: event.target.value }); controller.current?.styleDrawing({ color: event.target.value }); }}/></label>
    <select aria-label="Drawing thickness" title="Drawing thickness" value={settings.drawingWidth} onChange={event => { const width = Number(event.target.value); update({ drawingWidth: width }); controller.current?.styleDrawing({ width }); }}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}px</option>)}</select>
    <button aria-label="Magnet mode" title="Snap drawings to candle OHLC" aria-pressed={settings.magnet} onClick={() => toggle('magnet')}><ChartIcon name="magnet"/></button>
    <button aria-label="Stay in drawing mode" title="Keep selected drawing tool active" aria-pressed={settings.stayInDrawingMode} onClick={() => toggle('stayInDrawingMode')}><ChartIcon name="pencil"/></button>
    <button aria-label="Lock drawings" title="Lock all drawings" aria-pressed={settings.drawingsLocked} onClick={() => toggle('drawingsLocked')}><ChartIcon name={settings.drawingsLocked ? 'lock' : 'unlock'}/></button>
    <button aria-label="Hide drawings" title="Hide all drawings" aria-pressed={settings.drawingsHidden} onClick={() => toggle('drawingsHidden')}><ChartIcon name={settings.drawingsHidden ? 'eye-off' : 'eye'}/></button>
    <div className="workspace-tools-end"/>
    <button className="workspace-text-button" aria-label="Drawing objects" aria-expanded={panel === 'objects'} onClick={() => setPanel(panel === 'objects' ? null : 'objects')}><ChartIcon name="layers" size={16}/><span>Objects</span> <small>{drawings.items.length}</small></button>
    <button className="workspace-text-button" aria-label="Chart display settings" aria-expanded={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><ChartIcon name="settings" size={17}/> <span>Settings</span></button>
    <button aria-label="Chart shortcuts" title="Keyboard shortcuts" aria-expanded={panel === 'shortcuts'} onClick={() => setPanel(panel === 'shortcuts' ? null : 'shortcuts')}><ChartIcon name="help"/></button>
    <button aria-label={expanded ? 'Exit fullscreen chart' : 'Fullscreen chart'} title="Expand chart" aria-pressed={expanded} onClick={onExpand}><ChartIcon name={expanded ? 'minimize' : 'maximize'}/></button>
    {panel && <section className="workspace-popover" aria-label={panel === 'objects' ? 'Drawing object manager' : panel === 'settings' ? 'Chart display settings' : 'Keyboard shortcuts'}>
      <div className="workspace-popover-heading"><strong>{panel === 'objects' ? 'Object tree' : panel === 'settings' ? 'Chart settings' : 'Keyboard shortcuts'}</strong><button aria-label="Close chart panel" onClick={() => setPanel(null)}><ChartIcon name="close" size={16}/></button></div>
      {panel === 'settings' && <>
        <label className="workspace-setting">Time zone<select aria-label="Chart time zone" value={settings.timeZone} onChange={event => update({ timeZone: event.target.value })}>{[...new Set(['Asia/Tokyo', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Hong_Kong', settings.timeZone])].map(zone => <option key={zone}>{zone}</option>)}</select></label>
        <label className="workspace-setting">Price scale<select aria-label="Price scale" value={settings.scaleMode} onChange={event => update({ scaleMode: event.target.value })}><option value="linear">Regular</option><option value="log">Logarithmic</option><option value="percent">Percentage</option></select></label>
        {[['showGrid', 'Grid lines'], ['showVolume', 'Volume'], ['showLastPrice', 'Last price line'], ['showExecutions', 'Trade executions']].map(([key, label]) => <label className="workspace-setting" key={key}>{label}<input type="checkbox" checked={settings[key]} onChange={() => toggle(key)}/></label>)}
        <p>Heikin Ashi uses synthetic candles for display. Simulated orders and indicators use real market prices.</p>
        <button className="workspace-reset" onClick={() => update({ ...WORKSPACE_DEFAULTS, timeframe: settings.timeframe })}>Reset chart appearance</button>
      </>}
      {panel === 'objects' && <>
        {!drawings.items.length && <p>No drawings yet. Choose a tool on the left, then click the chart.</p>}
        <div className="drawing-object-list">{drawings.items.map((item, index) => <div className={drawings.selected === index ? 'selected' : ''} key={index}>
          <button aria-label={`Select drawing ${index + 1}`} onClick={() => controller.current?.selectDrawing(index)}><i style={{ background: item.color || '#81dfc2' }}/><span>{item.text || DRAWING_TOOLS.find(([key]) => key === item.type)?.[2]?.split(':')[0] || item.type}</span><small>#{index + 1}</small></button>
          <button aria-label={`Delete drawing ${index + 1}`} disabled={settings.drawingsLocked} onClick={() => controller.current?.deleteDrawing(index)}><ChartIcon name="close" size={16}/></button>
        </div>)}</div>
        <button className="workspace-reset" disabled={!drawings.items.length || settings.drawingsLocked} onClick={() => controller.current?.clearDrawings()}>Remove all drawings</button>
      </>}
      {panel === 'shortcuts' && <dl className="chart-shortcuts">{[['Undo / Redo', 'Ctrl Z / Ctrl Shift Z'], ['Trend / Horizontal', 'Alt T / Alt H'], ['Vertical / Rectangle / Fib', 'Alt V / Alt R / Alt F'], ['Play / Pause replay', 'Space'], ['Next replay candle', 'Alt →'], ['Pan chart', '← / → or Shift + scroll'], ['Zoom', '+ / − or scroll'], ['Delete selected drawing', 'Delete'], ['Latest replay bar', 'Home'], ['Cancel tool / Exit fullscreen', 'Esc']].map(([action, key]) => <React.Fragment key={action}><dt>{action}</dt><dd><kbd>{key}</kbd></dd></React.Fragment>)}</dl>}
    </section>}
  </div>;
}

export function ChartContextMenu({ position, onClose, controller, onSettings, onIndicators }) {
  const menu = useRef(null);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape' || (event.type === 'pointerdown' && !menu.current?.contains(event.target))) onClose(); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    menu.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [onClose]);
  return <div className="chart-context-menu" role="menu" aria-label="Chart actions" ref={menu} style={{ left: position.x, top: position.y }} onKeyDown={event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault(); const buttons = [...menu.current.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  }}>
    {[['Reset chart view', () => controller.current?.fit()], ['Auto scale price', () => controller.current?.autoScale()], ['Latest replay bar', () => controller.current?.latest()], ['Undo drawing', () => controller.current?.undo()], ['Remove selected drawing', () => controller.current?.deleteDrawing()], ['Indicators…', onIndicators], ['Chart settings…', onSettings]].map(([label, action]) => <button role="menuitem" key={label} onClick={() => { action(); onClose(); }}>{label}</button>)}
  </div>;
}
