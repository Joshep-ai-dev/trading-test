import React, { useMemo, useState } from 'react';
import { INITIAL_BALANCE, FEE_RATE, pnl } from './trading.js';
import { journalCsv } from './journal.js';

export const fmt = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const optionalNumber = value => value === '' ? null : Number(value);
const tone = value => value >= 0 ? 'positive' : 'negative';
const signed = value => `${value >= 0 ? '+' : ''}${fmt(value)}`;
const time = timestamp => new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19);

export function accountValues(model) {
  const price = model.candles[model.index]?.close || 0;
  const unrealized = model.positions.reduce((sum, p) => sum + pnl(p, price), 0);
  const used = model.positions.reduce((sum, p) => sum + p.margin, 0);
  return { price, unrealized, used, equity: model.balance + unrealized, available: Math.max(0, model.balance + unrealized - used) };
}

export function ExchangeHeader({ replay, tab, onNavigate }) {
  return <header className="exchange-header">
    <a className="exchange-brand" href="#" onClick={event => { event.preventDefault(); onNavigate('positions'); }}><span className="exchange-logo">a<span/></span><strong>argent<span> / </span></strong></a>
    <nav aria-label="Main navigation"><button className={tab === 'positions' ? 'selected' : ''} onClick={() => onNavigate('positions')}>Trade</button><button className={tab === 'fills' ? 'selected' : ''} onClick={() => onNavigate('fills')}>Activity</button><button className={tab === 'performance' ? 'selected' : ''} onClick={() => onNavigate('performance')}>Performance</button></nav>
    <div className="header-right"><span className="connection-badge"><i/>Local archive</span><button className="header-sync-button" disabled={replay.syncState.running} onClick={replay.syncNow}>{replay.syncState.running ? 'Syncing…' : 'Sync now'}</button><span className="paper-badge">PAPER TRADING</span><div className="account-avatar" title="Local paper account">AG</div></div>
  </header>;
}

export function MarketStrip({ model }) {
  const current = model.candles[model.index];
  const stats = useMemo(() => {
    if (!current) return null;
    const day = model.candles.slice(0, model.index + 1).filter(c => c.timestamp > current.timestamp - 86400000);
    return { change: (current.close / day[0].open - 1) * 100, high: Math.max(...day.map(c => c.high)), low: Math.min(...day.map(c => c.low)), volume: day.reduce((sum, c) => sum + c.volume, 0) };
  }, [model.candles, model.index, current]);
  return <section className="market-strip" aria-label="Market summary"><div className="market-identity"><span className="silver-token">Ag</span><div><h1>XAG<span>/USDT</span><em>PERP</em></h1><p>Silver perpetual futures</p></div></div><div className="market-price"><strong className={stats ? tone(stats.change) : ''}>{current ? fmt(current.close) : '—'}</strong><span>Replay mark price</span></div><div className="market-metrics">{[['24h change', stats ? `${signed(stats.change)}%` : '—', stats ? tone(stats.change) : ''], ['24h high', stats ? fmt(stats.high) : '—'], ['24h low', stats ? fmt(stats.low) : '—'], ['24h volume · contracts', stats ? fmt(stats.volume, 0) : '—']].map(([label, value, color]) => <div key={label}><small>{label}</small><b className={color}>{value}</b></div>)}</div><span className="market-source"><i/>OKX historical feed</span></section>;
}

function ProtectionChoices({ fixed, setFixed, trailing, setTrailing }) {
  return <div className="protection-choices"><label><input type="checkbox" checked={fixed} onChange={event => setFixed(event.target.checked)}/>TP/SL</label><label><input type="checkbox" checked={trailing} onChange={event => setTrailing(event.target.checked)}/>Trailing SL</label></div>;
}

export function OrderTicket({ replay }) {
  const [size, setSize] = useState('100'), [leverage, setLeverage] = useState(20), [sl, setSl] = useState(''), [tp, setTp] = useState(''), [trailing, setTrailing] = useState('');
  const [useFixed, setUseFixed] = useState(false), [useTrailing, setUseTrailing] = useState(false);
  const account = accountValues(replay.model), notional = Number(size) * leverage;
  return <section className="exchange-ticket">
    <div className="ticket-heading"><h2>Place order</h2><span>USDT perpetual</span></div>
    <div className="margin-controls"><span>Isolated margin</span><label htmlFor="leverage">Leverage <select id="leverage" value={leverage} onChange={event => setLeverage(Number(event.target.value))}>{[1, 2, 5, 10, 20, 50].map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div>
    <div className="order-type"><span>Market</span><small>Instant simulated execution</small></div>
    <div className="available-balance"><span>Available to trade</span><b>{fmt(account.available)} <small>USDT</small></b></div>
    <div className="order-field"><label htmlFor="size">Margin <span>USDT</span></label><div><input id="size" type="number" min="1" value={size} onChange={event => setSize(event.target.value)}/><span>USDT</span></div></div>
    <div className="allocation-buttons">{[25, 50, 75, 100].map(percent => <button key={percent} onClick={() => setSize((Math.floor(account.available * percent / 100 / (1 + leverage * FEE_RATE) * 100) / 100).toFixed(2))}>{percent}%</button>)}</div>
    <div className="ticket-protection"><span>Take profit / Stop loss</span><small>Optional</small></div>
    <ProtectionChoices fixed={useFixed} setFixed={setUseFixed} trailing={useTrailing} setTrailing={setUseTrailing}/>
    <div className="protection-fields"><div className="order-field"><label htmlFor="tp">Take profit</label><input id="tp" disabled={!useFixed} type="number" step=".01" placeholder="Price" value={tp} onChange={event => setTp(event.target.value)}/></div><div className="order-field"><label htmlFor="sl">Stop loss</label><input id="sl" disabled={!useFixed} type="number" step=".01" placeholder="Price" value={sl} onChange={event => setSl(event.target.value)}/></div></div>
    <div className="order-field trailing-field"><label htmlFor="trailing">Trailing stop <span>Distance %</span></label><input id="trailing" disabled={!useTrailing} type="number" min="0.01" max="99.99" step="0.01" placeholder="Optional, e.g. 1.0" value={trailing} onChange={event => setTrailing(event.target.value)}/><small>Follows favorable minute closes. Never moves backward.</small></div>
    <dl className="order-estimates"><div><dt>Order value</dt><dd id="margin">{fmt(notional)} USDT</dd></div><div><dt>Estimated size</dt><dd>{account.price ? fmt(notional / account.price, 4) : '—'} XAG</dd></div><div><dt>Entry fee (0.06%)</dt><dd>{fmt(notional * FEE_RATE, 4)} USDT</dd></div><div><dt>Exit fee</dt><dd>0.06% of exit value</dd></div><div><dt>Execution</dt><dd>Market · Full fill</dd></div></dl>
    <div className="exchange-order-buttons"><button id="longBtn" disabled={!account.price || replay.loading} className="buy-button" onClick={() => replay.enter('LONG', Number(size), leverage, useFixed ? optionalNumber(sl) : null, useFixed ? optionalNumber(tp) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null)}>Buy / Long <span>↗</span></button><button id="shortBtn" disabled={!account.price || replay.loading} className="sell-button" onClick={() => replay.enter('SHORT', Number(size), leverage, useFixed ? optionalNumber(sl) : null, useFixed ? optionalNumber(tp) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null)}>Sell / Short <span>↘</span></button></div>
    <p className="ticket-disclaimer"><i/> Paper orders · No real funds at risk</p>
  </section>;
}

function SyncStatus({ replay }) {
  const sync = replay.syncState;
  const stamp = value => value ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'Not synced yet';
  return <div className="sync-status-card"><div><strong>Local data sync</strong><span>Every 10 minutes</span></div><p>Saved through <b>{stamp(sync.latestCandle)}</b></p>{sync.running && <p className="positive">Syncing {sync.completedDays} / {sync.totalDays} days…</p>}{sync.error && <p className="negative" role="alert">{sync.error}</p>}<div><span>{sync.nextSync ? `Next: ${stamp(sync.nextSync)}` : 'Auto sync while server is running'}</span><button disabled={sync.running} onClick={replay.syncNow}>{sync.running ? 'Syncing…' : sync.error ? 'Retry sync' : 'Sync now'}</button></div></div>;
}

export function AccountSummary({ replay }) {
  const { model } = replay, account = accountValues(model);
  const utilization = account.equity > 0 ? Math.min(100, account.used / account.equity * 100) : 0;
  return <section className="account-summary"><div className="section-heading"><h2>Account overview</h2><span className="small-badge">PAPER</span></div><small className="equity-label">Account equity</small><strong id="equity" className="equity-value">{fmt(account.equity)}<small> USDT</small></strong><div className={`account-return ${tone(account.equity - INITIAL_BALANCE)}`}>{signed(account.equity - INITIAL_BALANCE)} USDT <span>({signed((account.equity / INITIAL_BALANCE - 1) * 100)}%)</span></div>
    <div className="utilization"><div><span>Margin utilization</span><b>{fmt(utilization, 1)}%</b></div><div className="utilization-track"><span style={{ width: `${utilization}%` }}/></div></div>
    <dl className="account-details">{[['Wallet balance', fmt(model.balance), 'balance'], ['Available margin', fmt(account.available), 'freeMargin'], ['Margin in use', fmt(account.used), 'usedMargin'], ['Unrealized P&L', signed(account.unrealized), 'pnl'], ['Realized P&L', signed(model.balance - INITIAL_BALANCE), 'realized']].map(([label, value, id]) => <div key={label}><dt>{label}</dt><dd id={id} className={label.includes('P&L') ? tone(id === 'pnl' ? account.unrealized : model.balance - INITIAL_BALANCE) : ''}>{value}</dd></div>)}</dl><div className="journal-save-state"><i/>{replay.recordStatus}</div>
    <SyncStatus replay={replay}/>
  </section>;
}

function ProtectionEditor({ position, onSave, onCancel, error }) {
  const [sl, setSl] = useState(position.sl ?? ''), [tp, setTp] = useState(position.tp ?? ''), [trailing, setTrailing] = useState(position.trailingPercent ?? '');
  const [useFixed, setUseFixed] = useState(!!(position.sl || position.tp)), [useTrailing, setUseTrailing] = useState(!!position.trailingPercent);
  return <div className="protection-overlay"><form className="protection-dialog" role="dialog" aria-modal="true" aria-label="Position protection" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} onSubmit={event => { event.preventDefault(); onSave(useFixed ? optionalNumber(sl) : null, useFixed ? optionalNumber(tp) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null); }}>
    <h2>Position protection</h2><p>XAGUSDT · {position.side} · Position #{position.id}</p>
    <ProtectionChoices fixed={useFixed} setFixed={setUseFixed} trailing={useTrailing} setTrailing={setUseTrailing}/>
    <div className="order-field"><label htmlFor="editTp">Take profit price</label><input autoFocus id="editTp" disabled={!useFixed} type="number" min="0.01" step="any" placeholder="Disabled" value={tp} onChange={event => setTp(event.target.value)}/></div>
    <div className="order-field"><label htmlFor="editSl">Stop loss price</label><input id="editSl" disabled={!useFixed} type="number" min="0.01" step="any" placeholder="Disabled" value={sl} onChange={event => setSl(event.target.value)}/></div>
    <div className="order-field"><label htmlFor="editTrailing">Trailing distance (%)</label><input id="editTrailing" disabled={!useTrailing} type="number" min="0.01" max="99.99" step="any" placeholder="Disabled" value={trailing} onChange={event => setTrailing(event.target.value)}/></div>
    <small>Select TP/SL, Trailing SL, or both. Uncheck a choice to disable it. Changed trailing distances restart from the current price.</small>
    {error && <p className="negative" role="alert">{error}</p>}
    <div className="protection-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">Save protection</button></div>
  </form></div>;
}

function EmptyLedger({ title, detail }) {
  return <div className="ledger-empty"><div className="empty-ledger-icon"><span/><span/><span/></div><strong>{title}</strong><p>{detail}</p></div>;
}

function Performance({ model }) {
  const trades = model.history, net = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const wins = trades.filter(t => t.profit > 0), losses = trades.filter(t => t.profit < 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0), grossLoss = -losses.reduce((sum, t) => sum + t.profit, 0);
  let balance = INITIAL_BALANCE, peak = balance, drawdown = 0;
  const points = [0];
  for (const trade of [...trades].reverse()) { balance += trade.profit; peak = Math.max(peak, balance); drawdown = Math.max(drawdown, peak - balance); points.push(balance - INITIAL_BALANCE); }
  const min = Math.min(...points), span = Math.max(...points) - min || 1;
  const line = points.map((value, index) => `${10 + index / Math.max(1, points.length - 1) * 440},${100 - (value - min) / span * 80}`).join(' ');
  return <div className="performance-panel"><div className="performance-curve"><small>CUMULATIVE REALIZED P&amp;L</small><strong className={tone(net)}>{signed(net)} <span>USDT</span></strong><svg viewBox="0 0 460 120" role="img" aria-label="Cumulative realized profit and loss"><line x1="10" y1="100" x2="450" y2="100" stroke="#26373b"/><polyline points={line} fill="none" stroke={net >= 0 ? '#7ee2c1' : '#ee8292'} strokeWidth="2"/></svg></div><div className="performance-metrics">{[['Closed trades', trades.length], ['Win rate', trades.length ? `${fmt(wins.length / trades.length * 100, 1)}%` : '—'], ['Profit factor', grossLoss ? fmt(grossProfit / grossLoss) : grossProfit ? '∞' : '—'], ['Max drawdown', `${fmt(drawdown)} USDT`], ['Average trade', `${signed(net / (trades.length || 1))} USDT`], ['Wins / Losses', `${wins.length} / ${losses.length}`]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></div>;
}

export function TradingLedger({ replay, tab, setTab }) {
  const { model } = replay, account = accountValues(model);
  const [side, setSide] = useState('ALL');
  const [editing, setEditing] = useState(null), [protectionError, setProtectionError] = useState('');
  const editProtection = position => { if (replay.playing) replay.togglePlay(); setProtectionError(''); setEditing(position); };
  const triggers = model.positions.flatMap(p => [['Stop loss', p.sl], ['Take profit', p.tp], ['Trailing stop', p.trailingStop]].filter(([, price]) => price).map(([type, price]) => ({ ...p, type, price })));
  const fills = (model.fills || []).filter(fill => side === 'ALL' || fill.side === side);
  const closed = model.history.filter(trade => side === 'ALL' || trade.side === (side === 'BUY' ? 'LONG' : 'SHORT'));
  const tabs = [['positions', 'Positions', model.positions.length], ['triggers', 'TP / SL', triggers.length], ['fills', 'Trade history', model.fills?.length || 0], ['closed', 'Closed P&L', model.history.length], ['performance', 'Performance', null]];
  const exportTrades = () => {
    const url = URL.createObjectURL(new Blob([journalCsv(model.fills || [])], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'argent-trade-history.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="trading-ledger" id="activity" aria-label="Trading activity"><div className="ledger-tabs" role="tablist" aria-label="Trading records">{tabs.map(([value, label, count]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}{count !== null && <span>{count}</span>}</button>)}<button className="export-button" onClick={exportTrades} title="Export every execution as CSV">↓ Export CSV</button></div>
    <div className="ledger-toolbar"><span id="positionStatus">{model.positions.length ? `${model.positions.length} active trades` : 'No active trades'}</span><span className="ledger-instrument">XAG / USDT perpetual</span><div/>{['fills', 'closed'].includes(tab) && <select aria-label="Filter trade side" value={side} onChange={event => setSide(event.target.value)}><option value="ALL">All sides</option><option value="BUY">Buy / Long</option><option value="SELL">Sell / Short</option></select>}{model.positions.length > 0 && <button id="closeBtn" onClick={replay.closeAll}>Close all positions</button>}<span className="record-indicator"><i/>Recorded locally</span></div>
    {editing && <ProtectionEditor position={editing} error={protectionError} onCancel={() => setEditing(null)} onSave={(sl, tp, trailing) => { if (replay.updateProtection(editing.id, sl, tp, trailing)) setEditing(null); else setProtectionError('Invalid protection. TP and SL must be on the correct side of the current price; trailing distance must be between 0% and 100%.'); }}/>} 
    <div className="ledger-content" role="tabpanel">
      {tab === 'positions' && (model.positions.length ? <div className="table-scroll"><table><thead><tr>{['Market / Side', 'Size / Value', 'Entry price', 'Mark price', 'Unrealized P&L', 'Liq. price', 'Margin', 'TP / SL', ''].map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>{model.positions.map(p => { const profit = pnl(p, account.price); return <tr key={p.id} className="position-row"><td><strong>XAGUSDT</strong><small className={p.side === 'LONG' ? 'positive' : 'negative'}>{p.side} · {p.leverage}× Isolated</small></td><td>{fmt(p.quantity, 4)} XAG<small>{fmt(p.quantity * account.price)} USDT</small></td><td>{fmt(p.entry)}</td><td>{fmt(account.price)}</td><td className={tone(profit)}><strong>{signed(profit)} USDT</strong><small>{signed(profit / p.margin * 100)}%</small></td><td className="liquidation-price">{fmt(p.liquidation)}</td><td>{fmt(p.margin)}<small>USDT</small></td><td><button className="table-action" aria-label={`Edit protection for position ${p.id}`} onClick={() => editProtection(p)}>Edit TP / SL</button><small>TP {p.tp || '-'} / SL {p.sl || '-'}</small>{p.trailingStop && <small>Trail {p.trailingPercent}% / {fmt(p.trailingStop)}</small>}</td><td><button className="table-action" onClick={() => replay.close(p.id)}>Market close</button></td></tr>; })}</tbody></table></div> : <EmptyLedger title="Your next trade starts here" detail="Open a long or short position. Track its size, margin and P&L here."/>)}
      {tab === 'triggers' && (triggers.length ? <div className="table-scroll"><table><thead><tr><th>Market</th><th>Position</th><th>Type</th><th>Trigger price</th><th>Size</th><th>Status</th></tr></thead><tbody>{triggers.map(p => <tr key={`${p.id}-${p.type}`}><td>XAGUSDT</td><td>#{p.id} {p.side}</td><td>{p.type}</td><td>{fmt(p.price)}</td><td>{fmt(p.quantity, 4)} XAG</td><td><span className="status-pill">Waiting for trigger</span></td></tr>)}</tbody></table></div> : <EmptyLedger title="No trigger orders" detail="Add a take-profit or stop-loss price when opening a position."/>)}
      {tab === 'fills' && (fills.length ? <div className="table-scroll"><table><thead><tr>{['Time (UTC)', 'Market', 'Action', 'Price', 'Size (XAG)', 'Value (USDT)', 'Fee (USDT)', 'Net P&L', 'Order ID'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{fills.map(fill => <tr className="fill-row" key={fill.id}><td>{time(fill.timestamp)}</td><td><strong>XAGUSDT</strong></td><td className={fill.side === 'BUY' ? 'positive' : 'negative'}>{fill.action}</td><td>{fmt(fill.price)}</td><td>{fmt(fill.quantity, 4)}</td><td>{fmt(fill.price * fill.quantity)}</td><td>{fmt(fill.fee || 0, 4)}</td><td className={tone(fill.profit)}>{signed(fill.profit)}</td><td className="muted">#{fill.id}</td></tr>)}</tbody></table></div> : <EmptyLedger title="No executions yet" detail="Every market entry and exit is recorded here automatically."/>)}
      {tab === 'closed' && (closed.length ? <div className="table-scroll"><table><thead><tr>{['Closed (UTC)', 'Market / Side', 'Size (XAG)', 'Entry / Exit', 'Total fees', 'Net P&L', 'Return on margin', 'Exit reason'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{closed.map(trade => <tr className="history-row" key={trade.id}><td>{time(trade.closeTime)}</td><td><strong>XAGUSDT</strong><small className={trade.side === 'LONG' ? 'positive' : 'negative'}>{trade.side} · {trade.leverage}×</small></td><td>{fmt(trade.quantity, 4)}</td><td>{fmt(trade.entry)} / {fmt(trade.exit)}</td><td>{fmt(trade.fees || 0, 4)}</td><td className={tone(trade.profit)}><strong>{signed(trade.profit)} USDT</strong></td><td className={tone(trade.profit)}>{signed(trade.profit / trade.margin * 100)}%</td><td>{trade.reason}</td></tr>)}</tbody></table></div> : <EmptyLedger title="No closed positions" detail="Realized results appear here when a position is closed."/>)}
      {tab === 'performance' && <Performance model={model}/>}
    </div>
  </section>;
}
