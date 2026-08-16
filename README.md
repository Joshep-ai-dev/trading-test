# Argent Replay

A browser-based XAGUSDT silver futures replay simulator using real historical `XAG-USDT-SWAP` candles from OKX. Selecting a UTC start date loads one continuous seven-day period. It includes 1-minute through 1-day chart timeframes, accelerated playback, long/short simulated orders, live P&L, stop-loss, take-profit, and session statistics.

The OKX contract began trading on January 28, 2026, so earlier dates have no market history. Market data is real; all orders and account balances remain simulated.

## Run

```bash
npm start
```

Then open `http://localhost:4173`.

## Deploy to Vercel

The frontend is deployed as static files and `api/candles.js` is deployed as the `/api/candles` Vercel Function. `server.js` is only used by `npm start` for local development; it must not be configured as a Vercel Function or production entrypoint.

The current price feed is deterministic simulated data, clearly labelled in the UI. Replace `makeCandles()` in `app.js` with an exchange or historical-data adapter when a real data source is selected.
