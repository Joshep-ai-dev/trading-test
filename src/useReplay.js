import { useCallback, useEffect, useRef, useState } from 'react';
import { DAY, dateOf, mergeCandles, prependHistory, readLocalDay } from './data.js';
import { INITIAL_BALANCE, closeTrade, enterTrade, settleCandle, updateProtection } from './trading.js';
import { readJournal, writeJournal } from './journal.js';

const emptyModel = session => ({ session, candles: [], index: 0, rangeStart: 0, positions: [], history: [], fills: [], balance: INITIAL_BALANCE, nextId: 1 });

export function useReplay() {
  const [model, setModel] = useState(() => emptyModel(0));
  const ref = useRef(model), generation = useRef(0), controller = useRef(null);
  const [initialJournal] = useState(readJournal);
  const savedJournal = useRef(initialJournal), bootPending = useRef(true);
  const [recordStatus, setRecordStatus] = useState('Trade records save in this browser');
  const [removedRecord, setRemovedRecord] = useState(null);
  const cache = useRef(new Map()), historyBusy = useRef(false), nextBusy = useRef(false), available = useRef([]);
  const historyCursor = useRef(''), nextCursor = useRef('');
  const [dates, setDates] = useState([]), [date, setDate] = useState('');
  const [dataMode, setDataMode] = useState('local');
  const modeRef = useRef('local'), hostedRefreshAt = useRef(0);
  const [loading, setLoading] = useState(true), [status, setStatus] = useState('Reading local archive…');
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(15);
  const [syncState, setSyncState] = useState({ running: false, latestCandle: null, lastSync: null, error: null });
  const syncBusy = useRef(false), lastWatermark = useRef(null);
  const commit = useCallback(transform => {
    ref.current = typeof transform === 'function' ? transform(ref.current) : transform;
    setModel(ref.current);
  }, []);

  const readDay = useCallback(async (day, signal) => {
    if (cache.current.has(day)) return cache.current.get(day);
    const result = await readLocalDay(day, signal);
    // Today's archive can be updated by the independent sync process.
    if (day < dateOf(Date.now())) cache.current.set(day, result);
    return result;
  }, []);

  const loadDate = useCallback(async selected => {
    if (!bootPending.current && ref.current.positions.length) { setStatus('Close open positions before changing the replay date.'); return; }
    const restore = bootPending.current && savedJournal.current?.date === selected ? savedJournal.current : null;
    bootPending.current = false;
    const account = restore || ref.current;
    const accountState = { positions: account.positions, history: account.history, fills: account.fills || [], balance: account.balance, nextId: account.nextId };
    const session = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    historyBusy.current = false; nextBusy.current = false;
    setDate(selected); setPlaying(false); setLoading(true);
    commit({ ...emptyModel(session), ...accountState });
    setStatus(modeRef.current === 'hosted' ? 'Loading historical OKX candles…' : 'Reading saved 1-minute candles…');
    try {
      const start = Date.parse(`${selected}T00:00:00Z`);
      const restoreDate = restore ? dateOf(restore.timestamp) : null;
      const selectedDays = available.current.filter(day => {
        const timestamp = Date.parse(`${day}T00:00:00Z`);
        return (timestamp >= start && timestamp < start + DAY * 7) || day === restoreDate;
      });
      if (!selectedDays.length) throw new Error(modeRef.current === 'hosted' ? 'Choose a date within the available OKX history.' : 'No local candles for this week. Select a saved date or run npm run download:data.');
      let candles = [];
      for (const day of selectedDays) candles = mergeCandles(candles, await readDay(day, signal));
      if (session !== generation.current) return;
      historyCursor.current = selectedDays[0]; nextCursor.current = selectedDays.at(-1);
      if (!candles.length) throw new Error('No candles are available for this week. Choose another date.');
      const restoredIndex = restore ? candles.findIndex(candle => candle.timestamp === restore.timestamp) : -1;
      if (restore?.positions.length && restoredIndex < 0) throw new Error('The candle for your saved positions is unavailable. Restore that local day before continuing.');
      commit({ ...emptyModel(session), ...accountState, candles, index: restoredIndex >= 0 ? restoredIndex : Math.min(89, candles.length - 1) });
      setStatus(`${candles.length.toLocaleString()} ${modeRef.current === 'hosted' ? 'OKX' : 'local'} candles · pan left to load older days`);
      try { localStorage.setItem('argent-replay-date', selected); } catch {}
    } catch (error) {
      if (session === generation.current && error.name !== 'AbortError') setStatus(error.message);
    } finally { if (session === generation.current) setLoading(false); }
  }, [commit, readDay]);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/local-data', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('Market data API unavailable. Ensure /api/local-data is included in the deployment, or restart npm start locally.');
      return response.json();
    }).then(result => {
      modeRef.current = result.mode || 'local'; setDataMode(modeRef.current);
      available.current = result.dates;
      setDates(result.dates);
      if (!result.dates.length) { setStatus('No local candles yet. Run npm run download:data, then reload.'); setLoading(false); return; }
      let saved;
      try { saved = savedJournal.current?.date || localStorage.getItem('argent-replay-date'); } catch {}
      const selected = result.dates.includes(saved) ? saved : result.dates[Math.max(0, result.dates.length - 7)];
      loadDate(selected);
    }).catch(error => { if (error.name !== 'AbortError') { setStatus(error.message); setLoading(false); } });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [loadDate]);

  const refreshSync = useCallback(async (requestSync = false) => {
    if (syncBusy.current) return;
    syncBusy.current = true;
    try {
      const hostedRefresh = modeRef.current === 'hosted' && Date.now() - hostedRefreshAt.current >= 600000;
      const post = requestSync || hostedRefresh;
      if (post) { hostedRefreshAt.current = Date.now(); setSyncState(previous => ({ ...previous, running: true, error: null })); }
      const response = await fetch('/api/sync', { method: post ? 'POST' : 'GET', signal: AbortSignal.timeout(55000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Sync unavailable (${response.status})`);
      const catalogResponse = await fetch('/api/local-data', { signal: AbortSignal.timeout(15000) });
      if (!catalogResponse.ok) throw new Error('Cannot read market data catalog');
      const catalog = await catalogResponse.json();
      modeRef.current = catalog.mode || 'local'; setDataMode(modeRef.current);
      available.current = catalog.dates;
      setDates(previous => previous.join() === catalog.dates.join() ? previous : catalog.dates);
      const latest = [result.latestCandle, catalog.latestCandle, lastWatermark.current].filter(Boolean).sort().at(-1) || null;
      setSyncState(previous => ({ ...result, lastSync: result.lastSync || previous.lastSync, nextSync: result.nextSync || previous.nextSync, latestCandle: latest }));
      if (latest && latest !== lastWatermark.current) {
        lastWatermark.current = latest;
        cache.current.clear();
        const current = ref.current, session = generation.current;
        if (current.candles.length && current.candles.at(-1).timestamp >= Date.now() - DAY * 2 && !historyBusy.current && !nextBusy.current) {
          const lastDate = dateOf(current.candles.at(-1).timestamp);
          const recentDays = catalog.dates.filter(day => day >= lastDate).slice(-3);
          let incoming = [];
          for (const day of recentDays) incoming.push(...await readDay(day, controller.current.signal));
          if (session === generation.current) commit(previous => prependHistory(previous, incoming));
        }
      }
    } catch (error) { setSyncState(previous => ({ ...previous, error: error.message, running: false })); }
    finally { syncBusy.current = false; }
  }, [commit, readDay]);

  useEffect(() => {
    refreshSync();
    const timer = setInterval(refreshSync, 15000);
    return () => clearInterval(timer);
  }, [refreshSync]);

  useEffect(() => {
    if (!model.candles.length) return;
    try { writeJournal(model, date); setRecordStatus('All trades saved in this browser'); }
    catch { setRecordStatus('Storage unavailable — export CSV to keep your trades'); }
  }, [model, date]);

  const loadEarlier = useCallback(async () => {
    const current = ref.current;
    if (historyBusy.current || !current.candles.length) return;
    const earliest = historyCursor.current;
    const days = available.current.filter(day => day < earliest).slice(-7);
    if (!days.length) return;
    historyBusy.current = true;
    const session = generation.current;
    setStatus(modeRef.current === 'hosted' ? 'Loading older OKX candles…' : 'Reading older candles from local files…');
    try {
      let rows = [];
      for (const day of days) rows.push(...await readDay(day, controller.current.signal));
      if (session !== generation.current) return;
      historyCursor.current = days[0];
      commit(previous => prependHistory(previous, rows));
      setStatus(`Loaded older ${modeRef.current === 'hosted' ? 'OKX' : 'local'} candles · ${ref.current.candles.length.toLocaleString()} candles available`);
    } catch (error) {
      if (session === generation.current && error.name !== 'AbortError') setStatus(`Local history: ${error.message}`);
    } finally { if (session === generation.current) historyBusy.current = false; }
  }, [commit, readDay]);

  const loadNext = useCallback(async () => {
    if (nextBusy.current || !ref.current.candles.length) return;
    const last = nextCursor.current;
    const day = available.current.find(item => item > last);
    if (!day) { setPlaying(false); setStatus('End of saved local data.'); return; }
    nextBusy.current = true;
    const session = generation.current;
    try {
      const rows = await readDay(day, controller.current.signal);
      if (session !== generation.current) return;
      nextCursor.current = day;
      commit(previous => ({ ...previous, candles: mergeCandles(previous.candles, rows) }));
      setStatus(`Loaded ${day} from ${modeRef.current === 'hosted' ? 'OKX' : 'local storage'}`);
    } catch (error) {
      if (session === generation.current) { setStatus(error.message); setPlaying(false); }
    } finally { if (session === generation.current) nextBusy.current = false; }
  }, [commit, readDay]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = ref.current;
      if (current.index >= current.candles.length - 1) { loadNext(); return; }
      const index = current.index + 1;
      commit(settleCandle({ ...current, index }, current.candles[index]));
      if (index > current.candles.length - 60) loadNext();
    }, Math.max(40, 700 / speed));
    return () => clearInterval(timer);
  }, [playing, speed, commit, loadNext]);

  const seek = index => {
    if (ref.current.positions.length) { setStatus('Close open positions before seeking.'); return; }
    setPlaying(false);
    commit(previous => ({ ...previous, index: Math.max(0, Math.min(previous.candles.length - 1, index)), session: previous.session + .001 }));
  };
  return { model, dates, date, dataMode, loading, status, recordStatus, removedRecord, syncState, syncNow: () => refreshSync(true), playing, speed, setSpeed, loadDate, loadEarlier, seek,
    removeHistory(type, id) {
      if (!['fills', 'history'].includes(type)) return;
      const records = ref.current[type] || [], index = records.findIndex(record => record.id === id);
      if (index < 0) return;
      setRemovedRecord({ type, index, record: records[index] });
      commit(previous => ({ ...previous, [type]: previous[type].filter(record => record.id !== id) }));
      setStatus('History item removed. Balance and open positions are unchanged.');
    },
    undoHistoryRemoval() {
      if (!removedRecord) return;
      const { type, index, record } = removedRecord;
      commit(previous => {
        const records = [...(previous[type] || [])];
        if (!records.some(item => item.id === record.id)) records.splice(Math.min(index, records.length), 0, record);
        return { ...previous, [type]: records };
      });
      setRemovedRecord(null);
      setStatus('History item restored.');
    },
    togglePlay: () => { if (ref.current.candles.length) setPlaying(value => !value); },
    enter(side, margin, leverage, sl, tp, trailingPercent) {
      try { commit(enterTrade(ref.current, side, margin, leverage, sl, tp, trailingPercent)); setStatus(`${side} order opened`); }
      catch (error) { setStatus(error.message); }
    },
    updateProtection(id, sl, tp, trailingPercent) {
      try { commit(updateProtection(ref.current, id, sl, tp, trailingPercent)); setStatus('Position protection updated'); return true; }
      catch (error) { setStatus(error.message); return false; }
    },
    close(id) {
      const current = ref.current, candle = current.candles[current.index];
      if (candle) commit(closeTrade(current, id, candle.close, candle.timestamp));
    },
    closeAll() {
      const current = ref.current, candle = current.candles[current.index];
      if (candle) commit(current.positions.reduce((next, p) => closeTrade(next, p.id, candle.close, candle.timestamp), current));
    },
  };
}
