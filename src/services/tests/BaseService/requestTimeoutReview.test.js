import test from 'tape'
import { BaseService, __inflightGetsForTests } from '../../BaseService.js'

const REQUEST_TIMEOUT = 'REQUEST_TIMEOUT'

// Review of the REST request timeout (REQUEST_TIMEOUT):
//   (a) the bound covers the BODY read too — a server that sends headers and
//       then stalls the body must not hold the caller for ever;
//   (b) a caller-owned `signal` and `timeoutMs` combine — either one ends it;
//   (c) identical in-flight GETs dedupe only with the SAME bound — a caller
//       with a short bound never waits on a peer's longer one;
//   (d) the four retry-safe session calls (getMe, setActiveOrganization,
//       setActiveWorkspace, endPersona) retry ONCE on a timeout; nothing else.
// Every case races a 3 s guard, so a hang turns red instead of blocking.

const GUARD_MS = 3000
const HANG = Symbol('hang')

const makeService = () => {
  const svc = new BaseService()
  svc._apiUrl = 'https://api.test'
  return svc
}

const abortError = () => {
  const e = new Error('The operation was aborted.')
  e.name = 'AbortError'
  return e
}

// Never answers; rejects on abort, like a real fetch.
const hangingFetch = (calls) => (url, init = {}) => {
  calls.push({ url, init })
  return new Promise((resolve, reject) => {
    const sig = init.signal
    if (sig) {
      if (sig.aborted) return reject(abortError())
      sig.addEventListener('abort', () => reject(abortError()))
    }
  })
}

// Headers arrive at once; the body stalls. `honourAbort` = the body read
// rejects when the request signal aborts (a real fetch does).
const stalledBodyFetch = (calls, { honourAbort = true } = {}) => (url, init = {}) => {
  calls.push({ url, init })
  const stall = () => new Promise((resolve, reject) => {
    if (honourAbort && init.signal) {
      if (init.signal.aborted) return reject(abortError())
      init.signal.addEventListener('abort', () => reject(abortError()))
    }
  })
  return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: stall, text: stall })
}

const guarded = (p) =>
  Promise.race([
    p.then((value) => ({ value }), (error) => ({ error })),
    new Promise((resolve) => setTimeout(() => resolve(HANG), GUARD_MS))
  ])

const withFetch = async (stub, fn) => {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await fn()
  } finally {
    globalThis.fetch = original
    __inflightGetsForTests.clear()
  }
}

// ── (a) body read ──────────────────────────────────────────────────────────
test('(a) _request: headers then a stalled body → REQUEST_TIMEOUT at timeoutMs', async (t) => {
  const calls = []
  await withFetch(stalledBodyFetch(calls), async () => {
    const out = await guarded(makeService()._request('/projects', { method: 'GET', timeoutMs: 100 }))
    t.notEqual(out, HANG, 'settles instead of waiting on the body for ever')
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
  })
  t.end()
})

test('(a) _request: a body read that ignores abort is still cut at timeoutMs', async (t) => {
  const calls = []
  await withFetch(stalledBodyFetch(calls, { honourAbort: false }), async () => {
    const out = await guarded(makeService()._request('/projects', { method: 'GET', timeoutMs: 100 }))
    t.notEqual(out, HANG, 'settles')
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
  })
  t.end()
})

test('(a) _requestExternal: headers then a stalled body → REQUEST_TIMEOUT', async (t) => {
  const calls = []
  await withFetch(stalledBodyFetch(calls), async () => {
    const out = await guarded(makeService()._requestExternal('https://kv.test/x', { method: 'GET', timeoutMs: 100 }))
    t.notEqual(out, HANG, 'settles')
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
  })
  t.end()
})

// ── (b) caller signal + timeoutMs ──────────────────────────────────────────
test('(b) _request: caller signal + timeoutMs — the caller abort still cancels', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const ctl = new AbortController()
    const t0 = Date.now()
    const p = guarded(makeService()._request('/stream', { method: 'GET', signal: ctl.signal, timeoutMs: 2500 }))
    setTimeout(() => ctl.abort(), 50)
    const out = await p
    t.notEqual(out, HANG, 'settles')
    t.ok(Date.now() - t0 < 1000, 'ends at the caller abort, not at the 2.5 s bound')
    t.notEqual(out.error && out.error.code, REQUEST_TIMEOUT, 'a caller abort is not a timeout')
    t.equal(calls.length, 1, 'a caller abort is not retried')
  })
  t.end()
})

test('(b) _request: caller signal + timeoutMs — the bound still applies', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const ctl = new AbortController()
    const out = await guarded(makeService()._request('/stream', { method: 'GET', signal: ctl.signal, timeoutMs: 100 }))
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
    t.equal(ctl.signal.aborted, false, 'the timer never aborts the caller\'s own controller')
  })
  t.end()
})

test('(b) _requestExternal: caller signal + timeoutMs — the caller abort still cancels', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const ctl = new AbortController()
    const t0 = Date.now()
    const p = guarded(makeService()._requestExternal('https://kv.test/x', { method: 'GET', signal: ctl.signal, timeoutMs: 2500 }))
    setTimeout(() => ctl.abort(), 50)
    const out = await p
    t.notEqual(out, HANG, 'settles')
    t.ok(Date.now() - t0 < 1000, 'ends at the caller abort')
    t.notEqual(out.error && out.error.code, REQUEST_TIMEOUT, 'not a timeout')
  })
  t.end()
})

test('(b) _request: an already-aborted caller signal rejects at once', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const ctl = new AbortController()
    ctl.abort()
    const t0 = Date.now()
    const out = await guarded(makeService()._request('/stream', { method: 'GET', signal: ctl.signal, timeoutMs: 2500 }))
    t.notEqual(out, HANG, 'settles')
    t.ok(Date.now() - t0 < 1000, 'at once')
    t.notEqual(out.error && out.error.code, REQUEST_TIMEOUT, 'not a timeout')
  })
  t.end()
})

// ── (c) dedupe honours each caller's bound ─────────────────────────────────
test('(c) _request: identical GETs — a short bound is not held by a peer\'s long one', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const svc = makeService()
    const long = guarded(svc._request('/projects', { method: 'GET', timeoutMs: 2500 }))
    const t0 = Date.now()
    const short = await guarded(svc._request('/projects', { method: 'GET', timeoutMs: 100 }))
    t.notEqual(short, HANG, 'the short caller settles')
    t.equal(short.error && short.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
    t.ok(Date.now() - t0 < 1000, 'at its own bound, not the peer\'s')
    await long
  })
  t.end()
})

test('(c) _requestExternal: identical GETs — a short bound is not held by a peer\'s long one', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const svc = makeService()
    const long = guarded(svc._requestExternal('https://kv.test/x', { method: 'GET', timeoutMs: 2500 }))
    const t0 = Date.now()
    const short = await guarded(svc._requestExternal('https://kv.test/x', { method: 'GET', timeoutMs: 100 }))
    t.equal(short.error && short.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
    t.ok(Date.now() - t0 < 1000, 'at its own bound')
    await long
  })
  t.end()
})

test('(c) _request: identical GETs with the same bound still share one round-trip', async (t) => {
  const calls = []
  let answer
  const stub = (url, init) => {
    calls.push({ url, init })
    return new Promise((resolve) => { answer = resolve })
  }
  await withFetch(stub, async () => {
    const svc = makeService()
    const a = svc._request('/projects', { method: 'GET', timeoutMs: 1000 })
    const b = svc._request('/projects', { method: 'GET', timeoutMs: 1000 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    answer({ ok: true, status: 200, json: async () => ({ n: 1 }) })
    const [ra, rb] = await Promise.all([a, b])
    t.equal(calls.length, 1, 'one fetch')
    t.deepEqual([ra, rb], [{ n: 1 }, { n: 1 }], 'both get the payload')
  })
  t.end()
})

// ── (d) one retry on timeout for the four session calls ────────────────────
for (const [methodName, method] of [
  ['getMe', 'GET'],
  ['setActiveOrganization', 'POST'],
  ['setActiveWorkspace', 'POST'],
  ['endPersona', 'POST']
]) {
  test(`(d) ${methodName}: a timeout is retried exactly once`, async (t) => {
    const calls = []
    await withFetch(hangingFetch(calls), async () => {
      const init = { method, methodName, timeoutMs: 100, maxRetries: 3 }
      if (method !== 'GET') init.body = '{}'
      const out = await guarded(makeService()._request('/x', init))
      t.notEqual(out, HANG, 'settles')
      t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT after the retry')
      t.equal(calls.length, 2, 'two attempts: the first + one retry')
    })
    t.end()
  })
}

test('(d) getMe: the retry after a timeout returns the answer', async (t) => {
  const calls = []
  const stub = (url, init) => {
    calls.push({ url, init })
    if (calls.length === 1) return hangingFetch([])(url, init)
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ me: 1 }) })
  }
  await withFetch(stub, async () => {
    const out = await guarded(makeService()._request('/auth/me', { method: 'GET', methodName: 'getMe', timeoutMs: 100 }))
    t.deepEqual(out.value, { me: 1 }, 'the second attempt answers')
    t.equal(calls.length, 2, 'two attempts')
  })
  t.end()
})

test('(d) _requestExternal: getMe-named call also retries once', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const out = await guarded(makeService()._requestExternal('https://kv.test/x', { method: 'GET', methodName: 'getMe', timeoutMs: 100 }))
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
    t.equal(calls.length, 2, 'two attempts')
  })
  t.end()
})

test('(d) a plain GET, a mutation and maxRetries:0 are not retried on timeout', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const svc = makeService()
    await guarded(svc._request('/projects', { method: 'GET', methodName: 'listProjects', timeoutMs: 100 }))
    t.equal(calls.length, 1, 'plain GET: one attempt')
    await guarded(svc._request('/ai/generate', { method: 'POST', body: '{}', methodName: 'generate', timeoutMs: 100 }))
    t.equal(calls.length, 2, 'mutation: one attempt')
    await guarded(svc._request('/auth/me', { method: 'GET', methodName: 'getMe', timeoutMs: 100, maxRetries: 0 }))
    t.equal(calls.length, 3, 'maxRetries 0: one attempt')
  })
  t.end()
})
