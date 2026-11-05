import React, { useMemo, useState } from 'react';
import { INITIAL_BALANCE, FEE_RATE, pnl, protectionPreview } from './trading.js';
import { journalCsv } from './journal.js';

export const fmt = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const protectionInput = (value, unit) => value === '' ? null : { value: Number(value), unit };
const optionalNumber = value => value === '' ? null : Number(value);
const tone = value => value >= 0 ? 'positive' : 'negative';
const signed = value => `${value >= 0 ? '+' : ''}${fmt(value)}`;
const time = timestamp => new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

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
    <div className="header-right"><span className="connection-badge"><i/>{replay.dataMode === 'hosted' ? 'OKX data' : 'Local archive'}</span><button className="header-sync-button" disabled={replay.syncState.running} onClick={replay.syncNow}>{replay.syncState.running ? 'Syncing…' : 'Sync now'}</button><span className="paper-badge">PAPER TRADING</span><div className="account-avatar" title="Local paper account">AG</div></div>
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

function ProtectionPreview({ position, tp, sl, unit }) {
  const preview = (value, kind) => {
    if (value === '') return null;
    try { return protectionPreview(protectionInput(value, unit), position, kind); } catch { return null; }
  };
  return <div className="protection-preview"><table aria-label="TP/SL outcome preview"><thead><tr><th>Trigger</th><th>Price (USDT)</th><th>Net P&amp;L</th><th>Price %</th></tr></thead><tbody>{[['TP', preview(tp, 'tp')], ['SL', preview(sl, 'sl')]].map(([label, result]) => <tr key={label}><th>{label} price</th><td>{result ? fmt(result.price, 4) : '—'}</td><td className={result ? tone(result.netProfit) : ''}>{result ? `${signed(result.netProfit)} USDT` : '—'}{result && <small>{signed(result.roe)}% ROE</small>}</td><td className={result ? tone(result.pricePercent) : ''}>{result ? `${signed(result.pricePercent)}%` : '—'}</td></tr>)}</tbody></table><small>Net P&amp;L includes both 0.06% fees. ROE is net return on margin.</small></div>;
}

function ProtectionUnit({ value, onChange, disabled }) {
  return <div className="protection-unit"><label>TP/SL units<select aria-label="TP/SL units" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="percent">% price move</option><option value="usdt">$ net P&amp;L (USDT)</option></select></label><small>{value === 'percent' ? 'Percent change from entry price, not leveraged return.' : 'Target profit or loss in USDT, including both fees.'} Changing units clears the inputs.</small></div>;
}

function ProtectionChoices({ fixed, setFixed, trailing, setTrailing }) {
  return <div className="protection-choices"><label><input type="checkbox" checked={fixed} onChange={event => setFixed(event.target.checked)}/>TP/SL</label><label><input type="checkbox" checked={trailing} onChange={event => setTrailing(event.target.checked)}/>Trailing SL</label></div>;
}

export function OrderTicket({ replay }) {
  const [size, setSize] = useState('100'), [leverage, setLeverage] = useState(20), [sl, setSl] = useState(''), [tp, setTp] = useState(''), [trailing, setTrailing] = useState('');
  const [unit, setUnit] = useState('percent');
  const [previewSide, setPreviewSide] = useState('LONG');
  const [useFixed, setUseFixed] = useState(false), [useTrailing, setUseTrailing] = useState(false);
  const account = accountValues(replay.model), notional = Number(size) * leverage;
  const previewEntry = account.price > 0 ? account.price + (previewSide === 'LONG' ? .003 : -.003) : NaN;
  const previewPosition = { side: previewSide, entry: previewEntry, quantity: notional / previewEntry, entryFee: notional * FEE_RATE, margin: Number(size) };
  return <section className="exchange-ticket">
    <div className="ticket-heading"><h2>Place order</h2><span>USDT perpetual</span></div>
    <div className="margin-controls"><span>Isolated margin</span><label htmlFor="leverage">Leverage <select id="leverage" value={leverage} onChange={event => setLeverage(Number(event.target.value))}>{[1, 2, 5, 10, 20, 50].map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div>
    <div className="order-type"><span>Market</span><small>Instant simulated execution</small></div>
    <div className="available-balance"><span>Available to trade</span><b>{fmt(account.available)} <small>USDT</small></b></div>
    <div className="order-field"><label htmlFor="size">Margin <span>USDT</span></label><div><input id="size" type="number" min="1" value={size} onChange={event => setSize(event.target.value)}/><span>USDT</span></div></div>
    <div className="allocation-buttons">{[25, 50, 75, 100].map(percent => <button key={percent} onClick={() => setSize((Math.floor(account.available * percent / 100 / (1 + leverage * FEE_RATE) * 100) / 100).toFixed(2))}>{percent}%</button>)}</div>
    <div className="ticket-protection"><span>Take profit / Stop loss</span><small>Optional</small></div>
    <ProtectionChoices fixed={useFixed} setFixed={setUseFixed} trailing={useTrailing} setTrailing={setUseTrailing}/>
    <ProtectionUnit value={unit} disabled={!useFixed} onChange={value => { setUnit(value); setTp(''); setSl(''); }}/>
    <div className="protection-fields"><div className="order-field"><label htmlFor="tp">Take profit</label><input id="tp" disabled={!useFixed} type="number" step=".01" placeholder={unit === 'percent' ? 'Price move %' : 'Net profit USDT'} value={tp} onChange={event => setTp(event.target.value)}/></div><div className="order-field"><label htmlFor="sl">Stop loss</label><input id="sl" disabled={!useFixed} type="number" step=".01" placeholder={unit === 'percent' ? 'Price move %' : 'Net loss USDT'} value={sl} onChange={event => setSl(event.target.value)}/></div></div>
    {useFixed && <><div className="protection-preview-side"><span>Preview side</span>{['LONG', 'SHORT'].map(side => <button key={side} aria-pressed={previewSide === side} onClick={() => setPreviewSide(side)}>{side}</button>)}</div><ProtectionPreview position={previewPosition} tp={tp} sl={sl} unit={unit}/></>}
    <div className="order-field trailing-field"><label htmlFor="trailing">Trailing stop <span>Distance %</span></label><input id="trailing" disabled={!useTrailing} type="number" min="0.01" max="99.99" step="0.01" placeholder="Optional, e.g. 1.0" value={trailing} onChange={event => setTrailing(event.target.value)}/><small>Follows favorable minute closes. Never moves backward.</small></div>
    <dl className="order-estimates"><div><dt>Order value</dt><dd id="margin">{fmt(notional)} USDT</dd></div><div><dt>Estimated size</dt><dd>{account.price ? fmt(notional / account.price, 4) : '—'} XAG</dd></div><div><dt>Entry fee (0.06%)</dt><dd>{fmt(notional * FEE_RATE, 4)} USDT</dd></div><div><dt>Exit fee</dt><dd>0.06% of exit value</dd></div><div><dt>Execution</dt><dd>Market · Full fill</dd></div></dl>
    <div className="exchange-order-buttons"><button id="longBtn" disabled={!account.price || replay.loading} className="buy-button" onClick={() => replay.enter('LONG', Number(size), leverage, useFixed ? protectionInput(sl, unit) : null, useFixed ? protectionInput(tp, unit) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null)}>Buy / Long <span>↗</span></button><button id="shortBtn" disabled={!account.price || replay.loading} className="sell-button" onClick={() => replay.enter('SHORT', Number(size), leverage, useFixed ? protectionInput(sl, unit) : null, useFixed ? protectionInput(tp, unit) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null)}>Sell / Short <span>↘</span></button></div>
    <p className="ticket-disclaimer"><i/> Paper orders · No real funds at risk</p>
  </section>;
}

function SyncStatus({ replay }) {
  const sync = replay.syncState;
  const stamp = value => value ? time(value).slice(0, 16) + ' GMT+9' : 'Not synced yet';
  return <div className="sync-status-card"><div><strong>{replay.dataMode === 'hosted' ? 'Market data refresh' : 'Local data sync'}</strong><span>Every 10 minutes</span></div><p>{replay.dataMode === 'hosted' ? 'Available through' : 'Saved through'} <b>{stamp(sync.latestCandle)}</b></p>{sync.running && <p className="positive">Syncing {sync.completedDays} / {sync.totalDays} days…</p>}{sync.error && <p className="negative" role="alert">{sync.error}</p>}<div><span>{sync.nextSync ? `Next: ${stamp(sync.nextSync)}` : replay.dataMode === 'hosted' ? 'Refreshes while this page is open' : 'Auto sync while server is running'}</span><button disabled={sync.running} onClick={replay.syncNow}>{sync.running ? 'Syncing…' : sync.error ? 'Retry sync' : 'Sync now'}</button></div></div>;
}

export function AccountSummary({ replay }) {
  const { model } = replay, account = accountValues(model);
  const startingBalance = model.startingBalance || INITIAL_BALANCE;
  const [resetAmount, setResetAmount] = useState('');
  const utilization = account.equity > 0 ? Math.min(100, account.used / account.equity * 100) : 0;
  return <section className="account-summary"><div className="section-heading"><h2>Account overview</h2><span className="small-badge">PAPER</span></div><small className="equity-label">Account equity</small><strong id="equity" className="equity-value">{fmt(account.equity)}<small> USDT</small></strong><div className={`account-return ${tone(account.equity - startingBalance)}`}>{signed(account.equity - startingBalance)} USDT <span>({signed((account.equity / startingBalance - 1) * 100)}%)</span></div>
    <div className="utilization"><div><span>Margin utilization</span><b>{fmt(utilization, 1)}%</b></div><div className="utilization-track"><span style={{ width: `${utilization}%` }}/></div></div>
    <dl className="account-details">{[['Wallet balance', fmt(model.balance), 'balance'], ['Available margin', fmt(account.available), 'freeMargin'], ['Margin in use', fmt(account.used), 'usedMargin'], ['Unrealized P&L', signed(account.unrealized), 'pnl'], ['Realized P&L', signed(model.balance - startingBalance), 'realized']].map(([label, value, id]) => <div key={label}><dt>{label}</dt><dd id={id} className={label.includes('P&L') ? tone(id === 'pnl' ? account.unrealized : model.balance - startingBalance) : ''}>{value}</dd></div>)}</dl><div className="journal-save-state"><i/>{replay.recordStatus}</div>
    <form className="account-reset" onSubmit={event => { event.preventDefault(); if (replay.resetAccount(Number(resetAmount || startingBalance))) setResetAmount(''); }}>
      <label htmlFor="startingAmount">Starting amount <span>USDT</span></label>
      <div><input id="startingAmount" aria-label="Starting amount" type="number" min="0.01" max="1000000000" step="0.01" placeholder={String(startingBalance)} value={resetAmount} onChange={event => setResetAmount(event.target.value)}/><button type="submit" disabled={replay.loading || !model.candles.length}>Reset account</button></div>
      <small>Clears all open positions and trade records. Keeps the current replay time.</small>
    </form>
    <SyncStatus replay={replay}/>
  </section>;
}

function ProtectionEditor({ position, onSave, onCancel, error }) {
  const [unit, setUnit] = useState('percent');
  const percentTarget = (price, kind) => price ? Number(((position.side === 'LONG' ? 1 : -1) * (kind === 'tp' ? price - position.entry : position.entry - price) / position.entry * 100).toPrecision(12)) : '';
  const [sl, setSl] = useState(() => percentTarget(position.sl, 'sl')), [tp, setTp] = useState(() => percentTarget(position.tp, 'tp')), [trailing, setTrailing] = useState(position.trailingPercent ?? '');
  const [useFixed, setUseFixed] = useState(!!(position.sl || position.tp)), [useTrailing, setUseTrailing] = useState(!!position.trailingPercent);
  return <div className="protection-overlay"><form className="protection-dialog" role="dialog" aria-modal="true" aria-label="Position protection" onKeyDown={event => { if (event.key === 'Escape') onCancel(); }} onSubmit={event => { event.preventDefault(); onSave(useFixed ? protectionInput(sl, unit) : null, useFixed ? protectionInput(tp, unit) : null, useTrailing ? (trailing === '' ? NaN : Number(trailing)) : null); }}>
    <h2>Position protection</h2><p>XAGUSDT · {position.side} · Position #{position.id}</p>
    <ProtectionChoices fixed={useFixed} setFixed={setUseFixed} trailing={useTrailing} setTrailing={setUseTrailing}/>
    <ProtectionUnit value={unit} disabled={!useFixed} onChange={value => { setUnit(value); setTp(''); setSl(''); }}/>
    <div className="order-field"><label htmlFor="editTp">Take profit {unit === 'percent' ? '%' : 'USDT'}</label><input autoFocus id="editTp" disabled={!useFixed} type="number" min="0.01" step="any" placeholder="Disabled" value={tp} onChange={event => setTp(event.target.value)}/></div>
    <div className="order-field"><label htmlFor="editSl">Stop loss {unit === 'percent' ? '%' : 'USDT'}</label><input id="editSl" disabled={!useFixed} type="number" min="0.01" step="any" placeholder="Disabled" value={sl} onChange={event => setSl(event.target.value)}/></div>
    {useFixed && <ProtectionPreview position={position} tp={tp} sl={sl} unit={unit}/>}
    <div className="order-field"><label htmlFor="editTrailing">Trailing distance (%)</label><input id="editTrailing" disabled={!useTrailing} type="number" min="0.01" max="99.99" step="any" placeholder="Disabled" value={trailing} onChange={event => setTrailing(event.target.value)}/></div>
    <small>Select TP/SL, Trailing SL, or both. Uncheck a choice to disable it. Changed trailing distances restart from the current price.</small>
    {error && <p className="negative" role="alert">{error}</p>}
    <div className="protection-dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit">Save protection</button></div>
  </form></div>;
}

function EmptyLedger({ title, detail }) {
  return <div className="ledger-empty"><div className="empty-ledger-icon"><span/><span/><span/></div><strong>{title}</strong><p>{detail}</p></div>;
}

function ClosedPnlGrid({ records, replay }) {
  if (!records.length) return <EmptyLedger title="No closed positions" detail="Closed trade results appear here."/>;
  return <div className="closed-pnl-grid">{records.map(trade => <article key={trade.id} className={`closed-pnl-card ${trade.profit >= 0 ? 'profit' : 'loss'}`} title={`XAGUSDT / ${trade.side} / ${trade.reason}`}>
    <div><span>{trade.side}</span><button aria-label={`Remove closed trade ${trade.id}`} title="Remove record" onClick={() => replay.removeHistory('history', trade.id)}>&times;</button></div>
    <strong className={tone(trade.profit)}>{signed(trade.profit)} <small>USDT</small></strong>
    <time>{time(trade.closeTime).slice(5, 16)} GMT+9</time>
  </article>)}</div>;
}

function Performance({ model }) {
  const trades = model.history, net = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const wins = trades.filter(t => t.profit > 0), losses = trades.filter(t => t.profit < 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0), grossLoss = -losses.reduce((sum, t) => sum + t.profit, 0);
  const startingBalance = model.startingBalance || INITIAL_BALANCE;
  let balance = startingBalance, peak = balance, drawdown = 0;
  const points = [0];
  for (const trade of [...trades].reverse()) { balance += trade.profit; peak = Math.max(peak, balance); drawdown = Math.max(drawdown, peak - balance); points.push(balance - startingBalance); }
  const min = Math.min(...points), span = Math.max(...points) - min || 1;
  const line = points.map((value, index) => `${10 + index / Math.max(1, points.length - 1) * 440},${100 - (value - min) / span * 80}`).join(' ');
  const metrics = [
    ['Net realized P&L', `${signed(net)} USDT`, tone(net)],
    ['Closed trades', trades.length],
    ['Win rate', trades.length ? `${fmt(wins.length / trades.length * 100, 1)}%` : '-'],
    ['Profit factor', grossLoss ? fmt(grossProfit / grossLoss) : grossProfit ? 'Infinity' : '-'],
    ['Total fees', `${fmt(trades.reduce((sum, trade) => sum + (trade.fees || 0), 0), 4)} USDT`],
    ['Max drawdown', `${fmt(drawdown)} USDT`],
    ['Average trade', `${signed(net / (trades.length || 1))} USDT`],
    ['Wins / Losses', `${wins.length} / ${losses.length}`],
  ];
  return <div className="performance-panel"><div className="performance-curve"><small>CUMULATIVE REALIZED P&amp;L</small><strong className={tone(net)}>{signed(net)} <span>USDT</span></strong><svg viewBox="0 0 460 120" role="img" aria-label="Cumulative realized profit and loss"><line x1="10" y1="100" x2="450" y2="100" stroke="#26373b"/><polyline points={line} fill="none" stroke={net >= 0 ? '#7ee2c1' : '#ee8292'} strokeWidth="2"/></svg></div><div className="performance-table-wrap"><table aria-label="P&L performance summary"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>{metrics.map(([label, value, color]) => <tr key={label}><td>{label}</td><td className={color || ''}>{value}</td></tr>)}</tbody></table></div></div>;

}

export function TradingLedger({ replay, tab, setTab }) {
  const { model } = replay, account = accountValues(model);
  const [side, setSide] = useState('ALL');
  const [view, setView] = useState(() => { try { return localStorage.getItem('argent-ledger-view') === 'grid' ? 'grid' : 'table'; } catch { return 'table'; } });
  const changeView = value => { setView(value); try { localStorage.setItem('argent-ledger-view', value); } catch {} };
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
    <div className="ledger-toolbar"><span id="positionStatus">{model.positions.length ? `${model.positions.length} active trades` : 'No active trades'}</span>{tab === 'closed' && <div className="ledger-view-switch" role="group" aria-label="Record layout"><button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>Grid</button><button aria-label="Table view" aria-pressed={view === 'table'} onClick={() => changeView('table')}>Table</button></div>}<span className="ledger-instrument">XAG / USDT perpetual</span><div/>{['fills', 'closed'].includes(tab) && <select aria-label="Filter trade side" value={side} onChange={event => setSide(event.target.value)}><option value="ALL">All sides</option><option value="BUY">Buy / Long</option><option value="SELL">Sell / Short</option></select>}{model.positions.length > 0 && <button id="closeBtn" onClick={replay.closeAll}>Close all positions</button>}{replay.removedRecord && <button className="undo-record" onClick={replay.undoHistoryRemoval}>Undo removal</button>}<span className="record-indicator"><i/>Recorded locally</span></div>
    {editing && <ProtectionEditor position={editing} error={protectionError} onCancel={() => setEditing(null)} onSave={(sl, tp, trailing) => { if (replay.updateProtection(editing.id, sl, tp, trailing)) setEditing(null); else setProtectionError('Invalid protection. TP and SL must be on the correct side of the current price; trailing distance must be between 0% and 100%.'); }}/>} 
    <div className="ledger-content" role="tabpanel">
      {tab === 'positions' && <div className="table-scroll"><table aria-label="Open positions"><thead><tr>{['Opened (GMT+9)', 'Market / Side', 'Size (XAG)', 'Entry / Mark', 'Entry fee', 'Unrealized P&L', 'Return on margin', 'Margin (USDT)', 'Liq. price', 'TP / SL', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {model.positions.map(p => {
          const profit = pnl(p, account.price);
          return <tr key={p.id} className="position-row">
            <td>{time(p.openTime)}</td>
            <td><strong>XAGUSDT</strong><small className={p.side === 'LONG' ? 'positive' : 'negative'}>{p.side} / {p.leverage}x Isolated</small></td>
            <td>{fmt(p.quantity, 4)}<small>{fmt(p.quantity * account.price)} USDT</small></td>
            <td>{fmt(p.entry)} / {fmt(account.price)}</td>
            <td>{fmt(p.entryFee || 0, 4)}</td>
            <td className={tone(profit)}><strong>{signed(profit)} USDT</strong></td>
            <td className={tone(profit)}>{signed(profit / p.margin * 100)}%</td>
            <td>{fmt(p.margin)}</td>
            <td className="liquidation-price">{fmt(p.liquidation)}</td>
            <td><button className="table-action" aria-label={`Edit protection for position ${p.id}`} onClick={() => editProtection(p)}>Edit TP / SL</button><small>TP {p.tp ? fmt(p.tp) : '-'} / SL {p.sl ? fmt(p.sl) : '-'}</small>{p.trailingStop && <small>Trail {p.trailingPercent}% / {fmt(p.trailingStop)}</small>}</td>
            <td><button className="table-action" aria-label={`Close position ${p.id} at market`} onClick={() => replay.close(p.id)}>Market close</button></td>
          </tr>;
        })}
        {!model.positions.length && <tr><td colSpan={11} className="empty-positions-cell"><EmptyLedger title="No open positions" detail="Open a long or short trade to see its opening time, size and live P&L here."/></td></tr>}
      </tbody></table></div>}

      {tab === 'triggers' && (triggers.length ? <div className="table-scroll"><table><thead><tr><th>Market</th><th>Position</th><th>Type</th><th>Trigger price</th><th>Size</th><th>Status</th></tr></thead><tbody>{triggers.map(p => <tr key={`${p.id}-${p.type}`}><td>XAGUSDT</td><td>#{p.id} {p.side}</td><td>{p.type}</td><td>{fmt(p.price)}</td><td>{fmt(p.quantity, 4)} XAG</td><td><span className="status-pill">Waiting for trigger</span></td></tr>)}</tbody></table></div> : <EmptyLedger title="No trigger orders" detail="Add a take-profit or stop-loss price when opening a position."/>)}
      {tab === 'fills' && (fills.length ? <div className="table-scroll"><table><thead><tr>{['Time (GMT+9)', 'Market', 'Action', 'Price', 'Size (XAG)', 'Value (USDT)', 'Fee (USDT)', 'Net P&L', 'Order ID', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{fills.map(fill => <tr className="fill-row" key={fill.id}><td>{time(fill.timestamp)}</td><td><strong>XAGUSDT</strong></td><td className={fill.side === 'BUY' ? 'positive' : 'negative'}>{fill.action}</td><td>{fmt(fill.price)}</td><td>{fmt(fill.quantity, 4)}</td><td>{fmt(fill.price * fill.quantity)}</td><td>{fmt(fill.fee || 0, 4)}</td><td className={tone(fill.profit)}>{signed(fill.profit)}</td><td className="muted">#{fill.id}</td><td><button className="table-action remove-record" aria-label={`Remove execution ${fill.id}`} title="Remove record; balance is unchanged" onClick={() => replay.removeHistory('fills', fill.id)}>Remove</button></td></tr>)}</tbody></table></div> : <EmptyLedger title="No executions yet" detail="Every market entry and exit is recorded here automatically."/>)}
      {tab === 'closed' && (view === 'grid' ? <ClosedPnlGrid records={closed} replay={replay}/> : closed.length ? <div className="table-scroll"><table><thead><tr>{['Closed (GMT+9)', 'Market / Side', 'Size (XAG)', 'Entry / Exit', 'Total fees', 'Net P&L', 'Return on margin', 'Exit reason', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{closed.map(trade => <tr className="history-row" key={trade.id}><td>{time(trade.closeTime)}</td><td><strong>XAGUSDT</strong><small className={trade.side === 'LONG' ? 'positive' : 'negative'}>{trade.side} · {trade.leverage}×</small></td><td>{fmt(trade.quantity, 4)}</td><td>{fmt(trade.entry)} / {fmt(trade.exit)}</td><td>{fmt(trade.fees || 0, 4)}</td><td className={tone(trade.profit)}><strong>{signed(trade.profit)} USDT</strong></td><td className={tone(trade.profit)}>{signed(trade.profit / trade.margin * 100)}%</td><td>{trade.reason}</td><td><button className="table-action remove-record" aria-label={`Remove closed trade ${trade.id}`} title="Remove record; balance is unchanged" onClick={() => replay.removeHistory('history', trade.id)}>Remove</button></td></tr>)}</tbody></table></div> : <EmptyLedger title="No closed positions" detail="Realized results appear here when a position is closed."/>)}
      {tab === 'performance' && <Performance model={model}/>}
    </div>
  </section>;
}
