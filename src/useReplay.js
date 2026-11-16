import { useCallback, useEffect, useRef, useState } from 'react';
import { dateOf, prependHistory, readLocalDay, readDays, replayDateIndex } from './data.js';
import { INITIAL_BALANCE, closeTrade, enterTrade, settleCandle, updateProtection, resetAccount } from './trading.js';
import { readJournal, writeJournal } from './journal.js';

const emptyModel = session => ({ session, candles: [], index: 0, rangeStart: 0, positions: [], history: [], fills: [], startingBalance: INITIAL_BALANCE, balance: INITIAL_BALANCE, nextId: 1 });

export function useReplay() {
  const [model, setModel] = useState(() => emptyModel(0));
  const ref = useRef(model), generation = useRef(0), controller = useRef(null);
  const [initialJournal] = useState(readJournal);
  const savedJournal = useRef(initialJournal), bootPending = useRef(true);
  const [recordStatus, setRecordStatus] = useState('Trade records save in this browser');
  const [removedRecord, setRemovedRecord] = useState(null);
  const cache = useRef(new Map()), available = useRef([]), archive = useRef(null);
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
    const accountState = { positions: account.positions, history: account.history, fills: account.fills || [], startingBalance: account.startingBalance || INITIAL_BALANCE, balance: account.balance, nextId: account.nextId };
    const session = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setDate(selected); setPlaying(false); setLoading(true);
    commit({ ...emptyModel(session), ...accountState });
    setStatus(modeRef.current === 'hosted' ? 'Loading historical OKX candles…' : 'Reading saved 1-minute candles…');
    try {
      const selectedDays = [...available.current];
      if (!selectedDays.includes(selected)) throw new Error('Choose a date within the available history.');
      const key = selectedDays.join(',');
      const candles = archive.current?.key === key ? archive.current.candles : await readDays(selectedDays, readDay, signal, 3, (completed, total) => {
        if (session === generation.current) setStatus(`Loading full history: ${completed} / ${total} days`);
      });
      if (session !== generation.current) return;
      if (!candles.length) throw new Error('No candles are available in the saved history.');
      archive.current = { key, candles };
      const restoredIndex = restore ? replayDateIndex(candles, selected, restore.timestamp) : -1;
      if (restore?.positions.length && restoredIndex < 0) throw new Error('The candle for your saved positions is unavailable. Restore that local day before continuing.');
      commit({ ...emptyModel(session), ...accountState, candles, index: restoredIndex >= 0 ? restoredIndex : replayDateIndex(candles, selected) });
      setStatus(`Full ${modeRef.current === 'hosted' ? 'OKX' : 'local'} history: ${candles.length.toLocaleString()} candles through ${dateOf(candles.at(-1).timestamp)}`);
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
      const changed = latest && latest !== lastWatermark.current;
      if (changed) {
        lastWatermark.current = latest;
        const changedDate = dateOf(Date.parse(latest));
        for (const day of cache.current.keys()) if (day >= changedDate) cache.current.delete(day);
      }
      const current = ref.current, session = generation.current;
      if (archive.current && current.candles.length) {
        const known = new Set(archive.current.key.split(','));
        const missing = catalog.dates.filter(day => !known.has(day));
        const tailDate = dateOf(current.candles.at(-1).timestamp);
        const days = [...new Set([...missing, ...(changed ? catalog.dates.filter(day => day >= tailDate) : [])])].sort();
        if (days.length) {
          const incoming = await readDays(days, readDay, controller.current.signal);
          if (session === generation.current) {
            commit(previous => prependHistory(previous, incoming));
            archive.current = { key: catalog.dates.join(','), candles: ref.current.candles };
          }
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

  // The complete archive is loaded before replay. Playback never extends a
  // seven-day window, so the scrubber's end always remains the latest candle.
  const loadEarlier = useCallback(() => {}, []);
  const stopAtEnd = useCallback(() => {
    setPlaying(false); setStatus('Latest available candle reached.');
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = ref.current;
      if (current.index >= current.candles.length - 1) { stopAtEnd(); return; }
      const index = current.index + 1;
      commit(settleCandle({ ...current, index }, current.candles[index]));
    }, Math.max(40, 700 / speed));
    return () => clearInterval(timer);
  }, [playing, speed, commit, stopAtEnd]);

  const togglePlay = useCallback(() => { if (ref.current.candles.length) setPlaying(value => !value); }, []);
  const step = useCallback(() => {
    setPlaying(false);
    const current = ref.current;
    if (!current.candles.length) return;
    if (current.index >= current.candles.length - 1) { stopAtEnd(); return; }
    const index = current.index + 1;
    commit(settleCandle({ ...current, index }, current.candles[index]));
  }, [commit, stopAtEnd]);

  const seek = useCallback(index => {
    if (ref.current.positions.length) { setStatus('Close open positions before seeking.'); return false; }
    if (!Number.isInteger(index) || !ref.current.candles.length) return false;
    setPlaying(false);
    commit(previous => ({ ...previous, index: Math.max(0, Math.min(previous.candles.length - 1, index)), session: previous.session + .001 }));
    return true;
  }, [commit]);
  return { model, dates, date, dataMode, loading, status, recordStatus, removedRecord, syncState, syncNow: () => refreshSync(true), playing, speed, setSpeed, loadDate, loadEarlier, seek,
    resetAccount(amount) {
      try {
        if (loading || !ref.current.candles.length) throw new Error('Wait for candles to load before resetting the account');
        const next = resetAccount(ref.current, amount);
        setPlaying(false); setRemovedRecord(null); commit(next);
        setStatus(`Paper account reset to ${next.startingBalance.toLocaleString()} USDT. Positions and trade records cleared.`);
        return true;
      } catch (error) { setStatus(error.message); return false; }
    },
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
    togglePlay, step,
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
