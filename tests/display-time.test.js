const test = require('node:test');
const assert = require('node:assert/strict');

test('GMT+9 display accepts ISO sync times and numeric trade timestamps', async () => {
  const { displayTime } = await import('../src/display-time.mjs');
  const iso = '2026-11-05T20:30:00.000Z';
  assert.equal(displayTime(iso), '2026-11-06 05:30:00');
  assert.equal(displayTime(Date.parse(iso)), '2026-11-06 05:30:00');
  assert.equal(displayTime(0), '1970-01-01 09:00:00');
});

test('invalid or missing display timestamps do not crash rendering', async () => {
  const { displayTime } = await import('../src/display-time.mjs');
  for (const value of [null, undefined, '', 'invalid', NaN, Infinity, 8640000000000000]) {
    assert.equal(displayTime(value), 'Unavailable');
  }
});
