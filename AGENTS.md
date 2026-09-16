# Repository Guidelines

## Project Structure & Module Organization

Argent Replay is a plain JavaScript browser simulator for XAGUSDT futures, backed by historical OKX candles. Orders and balances are simulated.

- `index.html`: page layout and controls.
- `app.js` and `chart-utils.js`: charts, grid calculations, replay state, and simulated trading.
- `styles.css`, `chart-tools.css`, `terminal.css`: stylesheets loaded in that order; preserve cascade behavior.
- `server.js`: local Node HTTP server, static files, and candle endpoint.
- `api/candles.js`: production Vercel candle function; `lib/candles.js` shares data loading with the local server.
- `vercel.json`: deployment configuration.

Source and styles live at the repository root. `tests/` contains Node tests; there is no dedicated asset directory.

## Build, Test, and Development Commands

Use Node.js with built-in `fetch` and `AbortSignal.timeout` support. No package dependencies or build step are configured.

- `npm start`: start the local server at `http://localhost:4173`; `PORT` overrides the port.
- `node --check app.js`: check frontend JavaScript syntax.
- `node --check server.js` and `node --check api/candles.js`: check server syntax.

`npm test` runs Node's built-in tests. No lint or formatting scripts are configured. Vercel serves the frontend as static files and deploys `api/candles.js`; keep `server.js` exclusive to local development.

## Coding Style & Naming Conventions

Follow existing vanilla JavaScript patterns: `const`/`let`, single-quoted strings, semicolons, and two-space indentation for expanded blocks. Use camelCase for functions and variables, UPPER_SNAKE_CASE for constants, and kebab-case for CSS classes. Server code uses CommonJS. Preserve DOM IDs referenced by `app.js`. Keep edits focused; avoid reformatting unrelated compact JavaScript or CSS.

## Testing Guidelines

Tests use `node:test` in `tests/*.test.js`; no coverage threshold is set. Run syntax checks and manually verify date loading, timeframe changes, playback, chart interactions, long/short orders, stop-loss/take-profit, and balance updates for relevant changes. Check browser console errors and responsive layout.

For candle changes, exercise `/api/candles?date=2026-08-09` and invalid dates. Verify UTC timestamps, chronological ordering, seven-day initial bounds, one-day extension, rate-limit retries, and error handling in both server implementations. Network access to OKX is required for real-data checks.

## Commit & Pull Request Guidelines

History uses brief messages such as `fix` and `fixed`; no formal convention is established. Prefer descriptive imperative messages such as `Fix replay timeframe aggregation`. PRs should explain the change, link relevant issues, record validation performed, and include screenshots for UI changes. Flag any endpoint or deployment impact.
