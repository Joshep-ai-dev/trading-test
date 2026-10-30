import React, { useState } from 'react';
import { INDICATOR_DEFINITIONS } from './indicators.js';

const DESCRIPTIONS = {
  rsi: ['Relative Strength Index', 'Momentum oscillator'],
  macd: ['Moving Average Convergence Divergence', 'Momentum and trend'],
  atr: ['Average True Range', 'Volatility'],
  adx: ['Average Directional Index', 'Trend strength · +DI / −DI'],
  supertrend: ['Supertrend', 'ATR-based trend overlay'],
  bb: ['Bollinger Bands', 'Moving average and volatility bands'],
};

export default function IndicatorLibrary({ config, onAdd, onConfigure, onCancel }) {
  const [search, setSearch] = useState(''), [category, setCategory] = useState('all');
  const entries = Object.entries(INDICATOR_DEFINITIONS).filter(([key, definition]) => (category !== 'active' || config[key].enabled) && `${key} ${definition.name} ${DESCRIPTIONS[key].join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="protection-overlay"><section className="indicator-library" role="dialog" aria-modal="true" aria-label="Indicator library" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }}>
    <div className="library-heading"><h2>Indicators</h2><button aria-label="Close indicator library" onClick={onCancel}>×</button></div>
    <div className="library-search"><span aria-hidden="true">⌕</span><input autoFocus aria-label="Search indicators" placeholder="Search indicators" value={search} onChange={event => setSearch(event.target.value)}/></div>
    <div className="library-body"><nav aria-label="Indicator categories"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>All studies <span>6</span></button><button className={category === 'active' ? 'active' : ''} onClick={() => setCategory('active')}>On chart <span>{Object.values(config).filter(value => value.enabled).length}</span></button></nav>
      <div className="library-results"><div className="library-column-heading">STUDY NAME <span>LOCATION</span></div>{entries.map(([key, definition]) => <div className="library-study" key={key}>
        <button className="library-study-name" aria-label={`Add ${definition.name}`} disabled={config[key].enabled} onClick={() => onAdd(key)}><strong>{definition.name}<small>{DESCRIPTIONS[key][0] !== definition.name ? DESCRIPTIONS[key][0] : ''}</small></strong><span>{DESCRIPTIONS[key][1]}</span></button>
        <span className="library-study-location">{definition.pane ? 'New pane' : 'Overlay'}</span>
        {config[key].enabled ? <button className="library-configure" aria-label={`Configure ${definition.name}`} onClick={() => onConfigure(key)}>⚙ Settings</button> : <button className="library-add" aria-label={`Add ${definition.name} to chart`} onClick={() => onAdd(key)}>＋ Add</button>}
      </div>)}{entries.length === 0 && <div className="library-no-results">No matching indicators.</div>}</div>
    </div>
    <div className="library-footer">Add a study, then use its gear icon to configure it individually.</div>
  </section></div>;
}
