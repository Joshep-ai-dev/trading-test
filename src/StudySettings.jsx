import React, { useRef, useState } from 'react';
import { DEFAULT_INDICATORS, INDICATOR_DEFINITIONS, validateIndicators } from './indicators.js';

export default function StudySettings({ study, config, onApply, onCancel }) {
  const definition = INDICATOR_DEFINITIONS[study];
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_INDICATORS[study], ...config[study] }));
  const [tab, setTab] = useState('Inputs'), [error, setError] = useState(''), [offset, setOffset] = useState({ x: 0, y: 0 });
  const dialog = useRef(null), drag = useRef(null);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const stop = event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  return <div className="protection-overlay"><form ref={dialog} className="study-settings-window" role="dialog" aria-modal="true" aria-label={`${definition.name} settings`} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} onSubmit={event => {
    event.preventDefault();
    try { onApply(validateIndicators({ ...config, [study]: draft })); } catch (err) { setError(err.message); }
  }}>
    <div className="study-window-title" onPointerDown={event => { if (event.button !== 0 || event.target.closest('button')) return; event.preventDefault(); drag.current = { x: event.clientX, y: event.clientY, offset }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
      if (!drag.current) return;
      const maxX = Math.max(0, (window.innerWidth - dialog.current.offsetWidth) / 2 - 12), maxY = Math.max(0, (window.innerHeight - dialog.current.offsetHeight) / 2 - 12);
      setOffset({ x: Math.max(-maxX, Math.min(maxX, drag.current.offset.x + event.clientX - drag.current.x)), y: Math.max(-maxY, Math.min(maxY, drag.current.offset.y + event.clientY - drag.current.y)) });
    }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={() => { drag.current = null; }}><h2>{definition.name}</h2><button type="button" aria-label="Close settings" onClick={onCancel}>×</button></div>
    <div className="study-settings-tabs" role="tablist" aria-label="Indicator settings sections">{['Inputs', 'Style', 'Visibility'].map(value => <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{value}</button>)}</div>
    <div className="study-settings-body" role="tabpanel">
      {tab === 'Inputs' && Object.entries(definition.fields).map(([key, [label, , min, max, step]], index) => <label className="study-input-row" key={key}>{label}<input autoFocus={index === 0} aria-label={`${definition.name} ${label}`} type="number" required min={min} max={max} step={step} value={draft[key]} onChange={event => update(key, event.target.value)}/></label>)}
      {tab === 'Style' && <><label className="study-input-row">Line color<input aria-label="Line color" type="color" value={draft.color} onChange={event => update('color', event.target.value)}/></label><label className="study-input-row">Line thickness<select aria-label="Line thickness" value={draft.lineWidth} onChange={event => update('lineWidth', Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value} px</option>)}</select></label><label className="study-check-row"><input type="checkbox" checked={draft.showValue} onChange={event => update('showValue', event.target.checked)}/>Values in indicator header</label><p>Color changes the primary line. Signal and directional lines retain their distinct colors.</p></>}
      {tab === 'Visibility' && <><label className="study-check-row"><input type="checkbox" checked={!draft.hidden} onChange={event => update('hidden', !event.target.checked)}/>Show indicator</label><p>Applies to all chart timeframes. Hiding keeps the pane and parameters; removing the indicator closes its pane.</p></>}
      {error && <p className="negative" role="alert">{error}</p>}
    </div>
    <div className="study-window-actions"><button type="button" onClick={() => { setDraft({ ...DEFAULT_INDICATORS[study], enabled: true }); setError(''); }}>Defaults</button><div/><button type="button" onClick={onCancel}>Cancel</button><button type="submit">OK</button></div>
  </form></div>;
}
