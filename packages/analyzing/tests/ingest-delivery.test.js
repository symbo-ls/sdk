import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createAnalyzing,
  answeredStatus,
  createShippedSessionStore,
  createUnloadTransport,
  SHIPPED_SESSION_KEY
} from '../src/client.js'

// Perf report 2026-11-12: the signed-in dev home sent `POST
// /core/analyzed/ingest` 1 to 8 times per load, and one answered 403. Two
// client faults behind that, pinned here:
//   1. one delivery attempt sent TWO requests when the server refused it —
//      the typed dispatcher's answered error fell through to the direct POST;
//   2. the unauthenticated unload/visibility beacon went out for a session
//      that had never shipped an authenticated envelope, which the server's
//      session-bound anonymous rule always refuses (403
//      anonymous_session_unknown).

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const httpError = (status, message = `HTTP ${status}`) => {
  const err = new Error(message)
  err.status = status
  return err
}

const withFetchStub = async (impl, run) => {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return impl ? impl(url, init) : { ok: true, status: 200 }
  }
  try {
    await run(calls)
  } finally {
    globalThis.fetch = realFetch
  }
}

const quietWarn = async (run) => {
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    await run(warnings)
  } finally {
    console.warn = realWarn
  }
}

const fakeSdk = (execute) => ({
  _context: {
    apiUrl: 'http://localhost:8080',
    workspaceProjectTokenProvider: () => 'tok_test'
  },
  execute
})

test('answeredStatus: an HTTP status on the error or its cause; null when never answered', () => {
  assert.equal(answeredStatus(httpError(403)), 403)
  assert.equal(answeredStatus({ cause: { status: 409 } }), 409)
  assert.equal(answeredStatus(new Error('Unknown entity')), null)
  assert.equal(answeredStatus({ status: 'x' }), null)
  assert.equal(answeredStatus(null), null)
})

test('a refused envelope (execute answered 403) is ONE request — no second direct POST', async () => {
  await quietWarn(async () => {
    await withFetchStub(null, async (fetchCalls) => {
      let executeCalls = 0
      const a = createAnalyzing({
        appKey: 'app',
        sdk: fakeSdk(async () => {
          executeCalls++
          throw httpError(403, 'anonymous_session_unknown')
        }),
        level: 'trace',
        batchMs: 5,
        maxBatch: 1,
        maxRetries: 1
      })
      a.state.activate(null)
      a.captureMessage('hello', 'info')
      await wait(30)
      assert.equal(executeCalls, 1, 'the dispatcher sent the envelope once')
      assert.equal(fetchCalls.length, 0, 'no duplicate direct POST after an answered refusal')
    })
  })
})

test('a dispatcher that could not send (no status) still falls back to the direct POST', async () => {
  await quietWarn(async () => {
    await withFetchStub(null, async (fetchCalls) => {
      const a = createAnalyzing({
        appKey: 'app',
        sdk: fakeSdk(async () => {
          throw new Error("[sdk.execute] Unknown entity: 'analyzed'")
        }),
        level: 'trace',
        batchMs: 5,
        maxBatch: 1,
        maxRetries: 1
      })
      a.state.activate(null)
      a.captureMessage('hello', 'info')
      await wait(30)
      assert.equal(fetchCalls.length, 1, 'the direct POST is the fallback for a send that never happened')
      assert.ok(String(fetchCalls[0].url).endsWith('/core/analyzed/ingest'))
    })
  })
})

test('an answered 401 from the dispatcher still suspends ingest (no direct POST needed to learn it)', async () => {
  await quietWarn(async (warnings) => {
    await withFetchStub(null, async (fetchCalls) => {
      let executeCalls = 0
      const a = createAnalyzing({
        appKey: 'app',
        sdk: fakeSdk(async () => {
          executeCalls++
          throw httpError(401, 'Invalid token: expired')
        }),
        level: 'trace',
        batchMs: 5,
        maxBatch: 1,
        maxRetries: 1
      })
      a.state.activate(null)
      a.captureMessage('first', 'info')
      await wait(30)
      const afterFirst = executeCalls
      a.captureMessage('second', 'info')
      a.captureMessage('third', 'info')
      await wait(30)
      assert.equal(afterFirst, 1)
      assert.equal(executeCalls, afterFirst, 'suspended: no further sends')
      assert.equal(fetchCalls.length, 0)
      assert.equal(warnings.filter((w) => /ingest suspended after 401/i.test(w)).length, 1)
    })
  })
})

test('a successful authenticated delivery records the session as shipped (per tab)', async () => {
  const store = new Map()
  const sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
  const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const a = createAnalyzing({
    appKey: 'app',
    sdk: fakeSdk(async () => ({ data: { ok: true } })),
    storage: { sessionStorage, localStorage },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1
  })
  a.state.activate(null)
  a.captureMessage('hello', 'info')
  await wait(30)
  assert.equal(store.get(SHIPPED_SESSION_KEY), String(a.sessionId))
  assert.equal(createShippedSessionStore({ sessionStorage }).has(a.sessionId), true, 'a reload sees it')
})

test('createShippedSessionStore: mark/has, survives a new store on the same storage, memory when storage throws', () => {
  const kv = new Map()
  const storage = { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, v) }
  const s1 = createShippedSessionStore({ sessionStorage: storage })
  assert.equal(s1.has('sid-1'), false)
  s1.mark('sid-1')
  assert.equal(s1.has('sid-1'), true)
  assert.equal(createShippedSessionStore({ sessionStorage: storage }).has('sid-1'), true)
  assert.equal(s1.has('sid-2'), false)
  assert.equal(s1.has(null), false)

  const broken = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('denied') }
  }
  const s2 = createShippedSessionStore({ sessionStorage: broken })
  s2.mark('sid-3')
  assert.equal(s2.has('sid-3'), true, 'in-memory copy')
})

test('createUnloadTransport: a session that never shipped is handed back (false) — no beacon', () => {
  const beacons = []
  const send = createUnloadTransport({
    getUrl: () => 'http://localhost:8080/core/analyzed/ingest',
    hasShipped: () => false,
    nav: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true } },
    fetchImpl: () => { throw new Error('must not fetch') }
  })
  assert.equal(send({ session: { id: 'never-shipped' }, events: [] }), false)
  assert.equal(beacons.length, 0)
})

test('createUnloadTransport: a shipped session goes out as a text/plain beacon', async () => {
  const beacons = []
  const send = createUnloadTransport({
    getUrl: () => 'http://localhost:8080/core/analyzed/ingest',
    hasShipped: (id) => id === 'sid-ok',
    nav: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true } }
  })
  assert.equal(send({ session: { id: 'sid-ok', endedAt: 1 }, events: [] }), true)
  assert.equal(beacons.length, 1)
  assert.equal(beacons[0].url, 'http://localhost:8080/core/analyzed/ingest')
  assert.equal(beacons[0].blob.type, 'text/plain', 'CORS-simple, no preflight')
  assert.deepEqual(JSON.parse(await beacons[0].blob.text()).session, { id: 'sid-ok', endedAt: 1 })
})

test('createUnloadTransport: no ingest URL yet → false; no sendBeacon → keepalive text/plain fetch', () => {
  assert.equal(
    createUnloadTransport({ getUrl: () => null, hasShipped: () => true })({ session: { id: 'x' } }),
    false
  )
  const fetches = []
  const send = createUnloadTransport({
    getUrl: () => 'http://localhost:8080/core/analyzed/ingest',
    hasShipped: () => true,
    nav: {},
    fetchImpl: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true }) }
  })
  assert.equal(send({ session: { id: 'x' } }), true)
  assert.equal(fetches.length, 1)
  assert.equal(fetches[0].init.keepalive, true)
  assert.equal(fetches[0].init.headers['Content-Type'], 'text/plain')
  assert.equal(fetches[0].init.credentials, 'omit')
})
