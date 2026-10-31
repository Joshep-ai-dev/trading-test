const FIRST_DATE = '2026-01-28';
const DAY = 86400000;

function hostedCatalog(now = Date.now()) {
  const dates = [];
  const today = Math.floor(now / DAY) * DAY;
  for (let timestamp = Date.parse(`${FIRST_DATE}T00:00:00Z`); timestamp <= today; timestamp += DAY) dates.push(new Date(timestamp).toISOString().slice(0, 10));
  return { mode: 'hosted', source: 'OKX', dates, latestCandle: null };
}

module.exports = { hostedCatalog, FIRST_DATE };
