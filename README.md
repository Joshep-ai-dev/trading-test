# Argent Replay

A React browser simulator for OKX XAG-USDT-SWAP futures. Orders and balances
are simulated. Local mode reads this computer's `.candle-data/` archive only.
Vercel mode loads packaged completed history from static CDN files; only newer
or missing days use the public OKX serverless API.

## Run

```bash
npm install
npm start
```

Open http://localhost:4173. Restart an older Node server after upgrading.
Vite serves the React app through the same local Node server, including hot reload.
React, styles, and chart code are bundled locally; no CDN is required.

## Local candles

```bash
npm run download:data
```

Download/resume all one-minute candles from the contract's January 28, 2026
start through the current UTC day. Daily JSON files are saved atomically in
`.candle-data/`, which is ignored by Git. Completed days are reused. Keep
`npm start` running to sync recent candles every 10 minutes. **Sync data**
triggers the independent background downloader; the chart still reads saved
files only. Internet access to OKX is needed for downloading, not for replay.

The app loads the complete available archive before replay, showing day-by-day
loading progress. The replay timeline spans the earliest saved candle through
the latest available candle, with both endpoints labeled. Changing the replay
start date reuses the loaded archive instead of limiting it to seven days.
Completed days are cached in the browser across reloads; history requests use
bounded concurrency. Today's data stays fresh, and sync retains completed history.
The visible timestamps, replay cursor, balances, and open positions are preserved.
Hover updates the OHLC readout and candle time. Later replay candles appear only
when deliberately browsing ahead, playing, or seeking. Playback never changes the timeline's
endpoint. Sync adds genuinely newer candles while preserving the replay cursor.
Dragging the chart synchronizes the progress bar with the rightmost visible
candle (labeled VIEW). Ordinary crosshair movement never moves the progress bar.
Releasing a horizontal chart drag selects that same candle as the actual replay
position, using the same seek action as the progress bar. The replay time and
saved journal update together; Play and Step continue from the selected candle.
As with the progress bar, close open positions before changing replay time.
Dragging toward newer dates reveals the later loaded candles continuously, up
to the latest saved candle. An unfinished/cancelled drag does not seek. The
Latest replay bar control returns to the execution cursor when browsing.
Missing/empty archive dates are handled without online chart requests.

Mouse wheel zooms around the pointer; drag the chart to pan. Shift-wheel or
horizontal trackpad scrolling pans. Drag price/time axes to scale them. Double-click
the price axis to restore auto scale. Two-finger pinch zooms on touch screens.
Close positions before seeking. Selecting a new date or restarting replay keeps recorded trades and balance.
Close open positions before changing the replay date.

## Chart workspace

The native chart workspace supports candles, hollow candles, OHLC bars, line,
area, and Heikin Ashi, with intervals including 3m. Heikin Ashi affects display
only; order settlement, the OHLC readout, and indicators use real market candles.
Settings include regular/logarithmic/percentage price scales, time zone, grid,
volume, last-price line, and trade markers. Percentage labels use the first
visible candle's close as their reference. Appearance and interval persist locally.
Auto fits the visible candle highs/lows and overlays while panning or zooming;
hovering does not change the scale. Scaling the price axis manually disables
Auto until the Auto or Fit button is pressed. Slightly diagonal chart drags keep
Auto enabled.

The left toolbar includes trend lines, rays, horizontal/vertical lines,
rectangles, Fibonacci retracements, measurement, text, and zoom. Click twice
for drawings with two anchors. In crosshair mode, select and drag a drawing or
its handles to edit it. Use the top toolbar for color, thickness, OHLC magnet,
continuous drawing mode, lock/hide, and undo/redo. The Objects panel selects and
removes individual drawings. Drawings persist across seeks, date changes, and
reloads; undo/redo history lasts for the current page session.

Right-click opens chart actions. Fullscreen expands the workspace; Escape exits.
The `?` button lists shortcuts while the chart has focus: Space plays/pauses,
Alt+Right advances one candle (including trade settlement), Ctrl/Cmd+Z undoes,
Ctrl/Cmd+Shift+Z redoes, Delete removes the selected or latest drawing, and Home
returns to the latest replay bar. Alt+T/H/V/R/F selects trend/horizontal/vertical/
rectangle/Fibonacci tools. Indicator panes retain their individual settings,
resize, reorder, maximize, hide, and removal controls.

This is the simulator's own chart workspace. Pine Script execution, TradingView
accounts/cloud layouts, and the full TradingView indicator catalog are not included.

## Build and validate

```bash
npm test
npm run build
npm run test:e2e
npm run preview
```

Unit tests cover rate limiting, UTC boundaries, archive persistence and local-only
reads, history merging, and trading settlement. Browser tests require an installed
Chrome and downloaded candle files; they cover local-only requests, hover, scrolling,
orders, playback, timeframe controls, and phone layout. Screenshots are saved in
`test-results/`. Production preview serves `dist/` with the same local candle API.

## Structure

- `src/App.jsx`: React UI components.
- `src/useReplay.js`: React replay/trading state and progressive local data loading.
- `src/chart-controller.js`: canvas rendering, indicators, pointer interactions, drawings.
- `src/ChartWorkspace.jsx`, `src/chart-workspace.js`: workspace controls, drawing history, geometry, and display transformations.
- `src/data.js`, `src/trading.js`: candle merging and pure trading calculations.
- `chart-utils.js`: shared axis, time zone, and viewport calculations.
- `styles.css`, `chart-tools.css`, `terminal.css`: styles imported in this order.
- `server.js`: Vite/static frontend and local archive/sync APIs.
- `lib/archive.js`, `lib/candles.js`, `lib/rate-limit.js`: disk archive and downloader.

## Deploy to Vercel

Deploy the repository root using the included `vercel.json`. Build command:
`npm run build`; output directory: `dist`. Vercel also deploys the root `api/`
functions. Do not deploy only the `dist/` folder, since that omits the data API.
Redeploy after adding or changing these API files.

### Fast hosted startup

The completed public candle snapshot in `public/candle-archive/` is copied into
the Vite build. Monthly compact OHLCV files are gzip-compressed and named by
content hash, with immutable browser/CDN caching. The small manifest is
revalidated on reload. The frontend downloads each month once, shares the result
between day requests, and falls back to `/api/candles` for unpackaged days or
unavailable packs. Today's incomplete candles never enter the static snapshot.
The full replay timeline remains available; no seven-day loading limit returns.

To refresh the snapshot after downloading/syncing local history:

```bash
npm run package:data
npm run build
```

Include `public/candle-archive/` and the updated `vercel.json` when committing
and redeploying. Packaging exports only timestamp/OHLCV fields from completed
daily archive files, not accounts or trading records. It runs locally against
`.candle-data/`; Vercel builds use the checked-in snapshot without downloading
months of history during deployment. No extra database service is required.

- `/api/local-data`: hosted date catalog from January 28, 2026 through today (UTC).
- `/api/candles?date=YYYY-MM-DD&days=1`: historical OKX candles, with serialized
  pagination and rate-limit retries. Completed days use browser/CDN caching;
  current-day responses are not cached.
- `/api/sync`: GET reports hosted mode; POST refreshes current-day OKX data. The
  page requests a refresh every 10 minutes while open. No background disk writer
  is expected to run inside a Vercel Function.

No environment variables or private exchange credentials are needed. Vercel must
be able to reach OKX. Exchange availability/rate limits are shown as API errors.
The date catalog represents selectable dates, and does not imply every date has
candles. Your computer's ignored `.candle-data/` files are not uploaded by Git.
The packaged snapshot provides a deployed copy of completed public candles;
days outside it use OKX on demand. Local `npm start` continues to serve saved files without an online
chart fallback. Trade records and preferences remain browser-local and separate
for each hostname/port.

If the default port 4173 is occupied, `npm start` tries the next available port
and prints the URL to open. An explicitly configured `PORT` is respected; if it
is occupied, startup prints an error instead of switching ports.


## Trading workspace and records

The exchange-style workspace places the chart beside order entry and the account
margin overview, with a full-width ledger underneath. Its tabs show positions,
TP/SL triggers, every entry/exit execution, closed P&L and performance. Executed
buys and sells are marked on the chart. Percentage buttons size margin from the
available account balance. The market summary uses the available replay history;
it is not a live quote or order book.

The trading journal saves balance, open positions, closed trades, executions and
replay time in this browser's local storage. Reload restores the account at the
saved candle. Date changes keep records, and are blocked while positions are open.
**Export CSV** downloads execution times, sides, sizes, prices, values and realized
P&L. Browser data is separate from candle files; export records before clearing
browser storage or switching browsers. Simulated fills use the existing price/spread
model and charge 0.06% on entry notional and 0.06% on exit notional; funding is not simulated.

**Sync now** (header or account panel) catches up missing days and refreshes recent
one-minute candles. The account panel shows the newest saved candle in UTC, progress
and sync errors. The React app polls local sync metadata every 15 seconds, refreshes
the saved-date list, and merges new recent candles without moving the replay cursor
or changing open positions. Automatic downloads run every 10 minutes while the Node
server is running; stopped servers catch up when restarted. Chart data still comes
from disk, including after a sync. The current minute can be revised by the next sync.

Entry fees are deducted immediately, and free margin must cover margin plus the fee.
Exit fees apply to all close paths, including TP/SL and liquidation. Closed-trade
P&L includes both fees; execution rows and CSV report individual fees. Existing
saved trades retain their original recorded fees.

## Position protection

Set TP and SL prices and an optional trailing-stop distance (%) in the order ticket.
Use **Edit TP / SL** in the Positions table to add, modify or clear protection on
an existing position. Editing pauses playback. The TP/SL tab lists active triggers;
all settings and the trailing anchor persist in the browser journal. Chart lines
show TP, SL and the current trailing stop when in the visible price range.

Trailing stops start immediately and ratchet using favorable one-minute **closes**,
not intrabar highs/lows. Existing stops are checked before the next close ratchets
the trail, so the simulator does not invent the path inside an OHLC candle. Long
trails never decrease; short trails never increase. A new distance resets its anchor
to the current price; editing other protection preserves an unchanged trail. The
tighter fixed/trailing stop takes precedence, and stops take precedence over TP
when both are touched in one candle (liquidation retains priority). Gaps through a
stop fill at the adverse opening price. Exits record their reason and both trading
fees. Clear fields to disable protection.

## Indicator studies

Click **Indicators** above the chart to search and add individual studies:
RSI (length), MACD (fast/slow/signal lengths), ATR (length), ADX (DI length and ADX
smoothing), Supertrend (ATR length and factor), and Bollinger Bands (length and
standard-deviation multiplier). The eye icon toggles the complete study set.
Use each study's visible gear icon (or the library's Settings button) for its own Inputs, Style and Visibility window. There is no combined parameter form. Settings persist in the browser. Invalid parameters are rejected; MACD's fast
length must be shorter than its slow length.

ATR and ADX have separate resizable panes alongside RSI and MACD. ADX also displays
+DI and -DI. Supertrend and BB overlay the price chart. BB uses a close-price SMA
and population standard deviation; ATR and ADX use Wilder RMA smoothing. EMA-based
MACD uses an SMA seed. Values remain unavailable until the warm-up period completes.
Calculations use aggregated candles only up to the replay cursor. Loading more
historical candles supplies additional warm-up history; no future replay data is used.
The chart reserves a minimum readable space for enabled panes, so enabling more
studies can increase its minimum height.

Formula references: [ATR](https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/),
[ADX](https://www.tradingview.com/support/solutions/43000589099-average-directional-index-adx/),
[Supertrend](https://www.tradingview.com/support/solutions/43000634738-supertrend/),
[Bollinger Bands](https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/).

### Indicator windows and individual settings

Hover an indicator header for its Settings, Hide/Show, Move up/down, Maximize/Restore,
and Remove controls. Price overlays have Settings, Hide/Show and Remove controls.
Double-click a study name to open its own movable settings window. Drag that window
by its title bar. Its tabs separate **Inputs**, **Style** (primary line color,
thickness, header values), and **Visibility**. OK applies changes; Cancel discards
changes; Defaults resets that study's draft. Settings and pane order persist in the
browser. Hide retains pane space, while Remove closes the pane; use **Indicators**
to add a removed study again. Maximizing a study temporarily uses the entire chart
canvas, and Restore brings back the original panes and their sizes.

TP/SL supports only **% price move** and **$ net P&L (USDT)** in the
order ticket and position editor. Percent targets are relative to the original
entry price, not leveraged ROE. USDT targets solve for a trigger price including
both entry and exit fees. Enter positive profit/loss magnitudes. Changing the unit
clears both inputs. Positions persist resolved trigger prices; reopening the editor
starts in Percent mode, converting the existing trigger prices to entry-price percentages. Gaps/liquidation can produce different actual exit results.

TP/SL includes a live outcome preview showing each trigger price, fee-adjusted net
P&L, price-change percentage and net ROE on margin together. Order entry has a
Long/Short preview selector; the position editor uses the position's actual side,
entry, size and paid entry fee. The target inputs remain percent or USDT.

In **Account overview**, enter a **Starting amount** and click **Reset account**.
This resets the paper balance to that amount, clears positions and trade records,
and pauses playback without changing replay time or candles. The custom baseline
persists in the browser journal and is used for account returns and P&L statistics.
