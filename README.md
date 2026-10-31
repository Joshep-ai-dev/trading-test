# Argent Replay

A React browser simulator for OKX XAG-USDT-SWAP futures. Orders and balances
are simulated. Local mode reads this computer's `.candle-data/` archive only.
Vercel mode loads public OKX candles through serverless API functions and caches completed days.

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

The app selects a saved week by default and remembers your date selection.
Pan/scroll left to read earlier days from local files in seven-day batches.
The visible timestamps, replay cursor, balances, and open positions are preserved.
Hover updates the OHLC readout and candle time. Future replay candles stay hidden
until playback or seeking reaches them. Playback appends newer saved days as needed.
Missing/empty archive dates are handled without online chart requests.

Mouse wheel zooms around the pointer; drag the chart to pan. Shift-wheel or
horizontal trackpad scrolling pans. Drag price/time axes to scale them. Double-click
the price axis to restore auto scale. Drawing tools support trend lines, horizontal
lines, measurement, and text; Escape cancels and Delete removes the last drawing.
RSI/MACD can be toggled. Chart settings include time zone, grid spacing, and time
jump. Close positions before seeking. Selecting a new week or restarting replay keeps recorded trades and balance.
Close open positions before changing the replay date.

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
Hosted mode uses OKX on demand; it does not provide a durable hosted copy of your
local archive. Local `npm start` continues to serve saved files without an online
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
