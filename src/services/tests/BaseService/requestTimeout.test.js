import test from 'tape'
import { BaseService, __inflightGetsForTests } from '../../BaseService.js'

const REQUEST_TIMEOUT = 'REQUEST_TIMEOUT'

// A REST request that never answers must not leave its caller waiting for
// ever (work.astio.ai 2026-10-08: the shell's boot gate awaited SDK calls with
// no bound and sat on the loader). `_request` and `_requestExternal` now abort
// at `options.timeoutMs` (default DEFAULT_REQUEST_TIMEOUT_MS) and reject with
// code REQUEST_TIMEOUT. A caller-owned `signal` keeps its own cancellation;
// `timeoutMs: 0` opts out. A timeout is never retried (it already waited).
// Every case races a 3 s guard, so the base (no timeout) turns red instead of
// hanging the runner.

const GUARD_MS = 3000
const HANG = Symbol('hang')

const makeService = () => {
  const svc = new BaseService()
  svc._apiUrl = 'https://api.test'
  return svc
}

// A fetch that never answers unless aborted (like a real fetch honours signal).
const hangingFetch = (calls) => (url, init = {}) => {
  calls.push(url)
  return new Promise((resolve, reject) => {
    const sig = init.signal
    if (sig) {
      sig.addEventListener('abort', () => {
        const e = new Error('The operation was aborted.')
        e.name = 'AbortError'
        reject(e)
      })
    }
  })
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

test('_request: a request that never answers rejects with REQUEST_TIMEOUT at timeoutMs, without a retry', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const t0 = Date.now()
    const out = await guarded(makeService()._request('/auth/me', { method: 'GET', methodName: 'getMe', timeoutMs: 100 }))
    t.notEqual(out, HANG, 'the request settles instead of hanging')
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'rejects with code REQUEST_TIMEOUT')
    t.ok(Date.now() - t0 < 1500, 'within the timeout (plus margin)')
    t.equal(calls.length, 1, 'a timeout is not retried')
  })
  t.end()
})

test('_requestExternal: the same bound', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const out = await guarded(makeService()._requestExternal('https://kv.test/x', { method: 'GET', timeoutMs: 100 }))
    t.notEqual(out, HANG, 'settles')
    t.equal(out.error && out.error.code, REQUEST_TIMEOUT, 'REQUEST_TIMEOUT')
  })
  t.end()
})

test('_request: a caller-owned signal keeps its own cancellation (no default timeout added)', async (t) => {
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    const ctl = new AbortController()
    const p = guarded(makeService()._request('/stream', { method: 'GET', signal: ctl.signal }))
    setTimeout(() => ctl.abort(), 300)
    const t0 = Date.now()
    const out = await p
    t.notEqual(out, HANG, 'settles when the caller aborts')
    t.ok(Date.now() - t0 >= 250, 'not cut by the default bound before the caller aborts')
    t.notEqual(out.error && out.error.code, REQUEST_TIMEOUT, 'the caller abort is not reported as a timeout')
  })
  t.end()
})

test('_request: an answering request is unaffected and leaves no timer behind', async (t) => {
  await withFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }) }), async () => {
    const out = await guarded(makeService()._request('/auth/me', { method: 'GET', methodName: 'getMe', timeoutMs: 100 }))
    t.deepEqual(out.value, { ok: 1 }, 'payload intact')
  })
  t.end()
})

test('defaults: reads and retry-safe session writes are bounded; other mutations only when asked', async (t) => {
  const { DEFAULT_REQUEST_TIMEOUT_MS } = await import('../../BaseService.js')
  t.equal(DEFAULT_REQUEST_TIMEOUT_MS, 30000, 'the default read bound')
  const calls = []
  await withFetch(hangingFetch(calls), async () => {
    // a POST with no timeoutMs is not cut by any default (a long AI call, an upload)
    const out = await Promise.race([
      makeService()._request('/ai/generate', { method: 'POST', body: '{}', methodName: 'generate' }).then(() => 'settled', () => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('still-waiting'), 300))
    ])
    t.equal(out, 'still-waiting', 'an unbounded mutation stays the caller\'s choice')
    // the same POST with a named bound is cut
    const out2 = await guarded(makeService()._request('/ai/generate', { method: 'POST', body: '{}', timeoutMs: 100 }))
    t.equal(out2.error && out2.error.code, REQUEST_TIMEOUT, 'a named bound applies to a mutation')
  })
  t.end()
})
