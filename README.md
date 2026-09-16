# Argent Replay

A browser-based XAGUSDT silver futures replay simulator using real historical `XAG-USDT-SWAP` candles from OKX. Selecting a UTC start date loads one continuous month (ending on the same date next month, clamped to that month's last day). It includes 1-minute through 1-day chart timeframes, accelerated playback, long/short simulated orders, live P&L, stop-loss, take-profit, and session statistics.

The OKX contract began trading on January 28, 2026, so earlier dates have no market history. Market data is real; all orders and account balances remain simulated.

## Run

```bash
npm start
```

Then open `http://localhost:4173`.

## Deploy to Vercel

The frontend is deployed as static files and `api/candles.js` is deployed as the `/api/candles` Vercel Function. `server.js` is only used by `npm start` for local development; it must not be configured as a Vercel Function or production entrypoint.

## Chart navigation

Choose **TIME ZONE** for chart labels, tooltips, the replay clock, trade history, and **GO TO**. The selection is saved in your browser. Named zones follow daylight saving automatically. The month-start date and data boundaries remain UTC.

Use **GO TO** to jump to a loaded date and minute in the selected zone. Nonexistent daylight-saving times are rejected; repeated times select the earlier occurrence with a notice. Missing minutes move to the next available candle. Close open positions before seeking. The scrubber also seeks and pauses playback.

**TIME GRID** and **PRICE GRID** control grid spacing. Auto uses readable time intervals and round price increments; select `1.00` for whole-price levels such as `75.00` and `76.00`. Labels thin out when necessary to avoid overlap. Use the zoom buttons or mouse wheel for finer detail; drag the price axis to adjust vertical scale.

Month data loads in daily batches with progress shown. `/api/candles?date=2026-08-09` returns one month; add `&days=1` for a single day. Both local and Vercel endpoints use `lib/candles.js`. Empty trading days are allowed; exchange failures abort loading instead of silently omitting data.

## Validate

Run `npm test` for month boundaries, price ticks, seeking, and mocked exchange pagination. Run `node --check app.js` for frontend syntax. Real market-data checks require access to OKX.
