const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimitedFetch } = require('../lib/rate-limit');

test('429 honors Retry-After and concurrent calls remain spaced and serialized', async () => {
  let clock = 0, active = 0, maximum = 0;
  const times = [];
  const fetchPage = createRateLimitedFetch({
    now: () => clock,
    sleep: async ms => { clock += ms; },
    request: async () => {
      active++; maximum = Math.max(maximum, active); times.push(clock);
      await Promise.resolve(); active--;
      return times.length === 1
        ? { status: 429, ok: false, headers: { get: () => '3' } }
        : { ok: true, json: async () => ({ code: '0', data: [] }) };
    },
  });
  await Promise.all([fetchPage('first'), fetchPage('second')]);
  assert.deepEqual(times, [0, 3000, 3400]);
  assert.equal(maximum, 1);
});

test('exchange rate-limit codes back off and stop after four attempts', async () => {
  let clock = 0, attempts = 0;
  const fetchPage = createRateLimitedFetch({
    now: () => clock, sleep: async ms => { clock += ms; },
    request: async () => { attempts++; return { ok: true, json: async () => ({ code: '50011' }) }; },
  });
  await assert.rejects(fetchPage('test'), error => error.status === 429 && error.retryAfter === 8);
  assert.equal(attempts, 4);
  assert.equal(clock, 7000);
});

test('long Retry-After is surfaced without retrying prematurely', async () => {
  let attempts = 0;
  const fetchPage = createRateLimitedFetch({
    now: () => 0, sleep: async () => {},
    request: async () => { attempts++; return { status: 429, ok: false, headers: { get: () => '60' } }; },
  });
  await assert.rejects(fetchPage('test'), error => error.status === 429 && error.retryAfter === 60);
  assert.equal(attempts, 1);
});
