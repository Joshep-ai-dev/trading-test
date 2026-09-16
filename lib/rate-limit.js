function createRateLimitedFetch({ request = (...args) => fetch(...args), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  let queue = Promise.resolve();
  let nextRequest = 0;
  return function fetchPage(url) {
    const result = queue.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await sleep(Math.max(0, nextRequest - now()));
        const response = await request(url, { headers: { 'User-Agent': 'Argent-Replay/1.0' }, signal: AbortSignal.timeout(15000) });
        nextRequest = now() + 400;
        const payload = response.ok ? await response.json() : null;
        if (response.status === 429 || ['50011', '50040'].includes(payload?.code)) {
          const header = response.headers?.get('retry-after');
          const retryAfter = header ? (Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - now()) : 0;
          const delay = Math.max(1000 * 2 ** attempt, retryAfter || 0);
          nextRequest = now() + delay;
          if (attempt === 3 || delay > 15000) {
            const error = new Error('OKX rate limit reached (429). Please retry shortly.');
            error.status = 429;
            error.retryAfter = Math.ceil(delay / 1000);
            throw error;
          }
          continue;
        }
        if (!response.ok) throw new Error(`OKX returned HTTP ${response.status}`);
        if (payload.code !== '0') throw new Error(payload.msg || `OKX error ${payload.code}`);
        return payload;
      }
    });
    queue = result.catch(() => {});
    return result;
  };
}

module.exports = { createRateLimitedFetch };
