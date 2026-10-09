// Review D3 (2026-10-09) — the cross-app helpers never move a refresh token.
//
// - DEFAULT_TOKEN_KEYS (what the cookie mirror and the iframe fallback walk)
//   no longer lists `symbols_refresh_token`.
// - hydrateAuthFromIframeBridge (the fallback a consumer without the
//   workspace's reacquireBridgeSession still calls) accepts a reply ONLY from
//   its own bridge iframe (origin AND source), and writes only the
//   access-token keys of the reply — never a refresh token, never any other
//   key the reply carries.
//
// Run: node --test src/utils/tests/crossAppAuthAccessOnly.test.js
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const saved = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
}
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k]) Object.defineProperty(globalThis, k, saved[k])
    else delete globalThis[k]
  }
})
const setGlobal = (name, value) =>
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })

const { createCrossAppAuth, DEFAULT_TOKEN_KEYS } = await import(
  process.env.CROSS_APP_PATH || '../../crossAppAuth.js'
)

const PEER = 'https://my.symbols.app'

// A canvas page whose bridge iframe answers with `reply` from `from()`.
const page = (reply, from) => {
  const m = new Map()
  const store = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()]
  }
  const listeners = new Set()
  let frame = null
  setGlobal('localStorage', store)
  setGlobal('window', {
    location: { origin: 'https://edit.symbols.app', hostname: 'edit.symbols.app' },
    localStorage: store,
    addEventListener: (t, fn) => t === 'message' && listeners.add(fn),
    removeEventListener: (t, fn) => listeners.delete(fn)
  })
  setGlobal('document', {
    cookie: '',
    createElement: () => {
      const onLoad = []
      frame = {
        style: {},
        src: '',
        addEventListener: (t, fn) => t === 'load' && onLoad.push(fn),
        remove: () => {},
        contentWindow: {
          postMessage: () => {
            queueMicrotask(() => {
              for (const fn of [...listeners]) fn({ origin: PEER, source: from(frame), data: reply })
            })
          }
        }
      }
      frame._load = () => onLoad.forEach((fn) => fn())
      return frame
    },
    body: { appendChild: (f) => queueMicrotask(() => f._load()) }
  })
  return store
}

const fullReply = {
  type: 'symbols-session-response',
  ok: true,
  sdkTokens: {
    symbols_access_token: 'acc',
    symbols_expires_at: String(Date.now() + 3600e3),
    symbols_refresh_token: 'ref-from-an-old-bridge',
    symbols_anything_else: 'x'
  }
}

test('D3: DEFAULT_TOKEN_KEYS does not list the refresh token', () => {
  assert.equal(DEFAULT_TOKEN_KEYS.includes('symbols_refresh_token'), false)
  assert.equal(DEFAULT_TOKEN_KEYS.includes('symbols_access_token'), true, 'CONTROL')
})

test('D3: hydrateAuthFromIframeBridge writes ONLY the access-token keys of a reply', async () => {
  const store = page(fullReply, (f) => f.contentWindow)
  const auth = createCrossAppAuth({ resolvePeerOrigin: () => PEER })
  const wrote = await auth.hydrateAuthFromIframeBridge()
  assert.equal(wrote, true, 'CONTROL — the reply is adopted')
  assert.equal(store.getItem('symbols_access_token'), 'acc')
  assert.equal(store.getItem('symbols_refresh_token'), null)
  assert.equal(store.getItem('symbols_anything_else'), null)
})

test('D3: hydrateAuthFromIframeBridge ignores a reply from another window of the peer origin', async () => {
  const store = page(fullReply, () => ({ postMessage: () => {} }))
  const auth = createCrossAppAuth({ resolvePeerOrigin: () => PEER })
  // The forged reply is ignored; the 4 s timeout then settles to false.
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0)
  try {
    const wrote = await auth.hydrateAuthFromIframeBridge()
    assert.equal(wrote, false)
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
  assert.equal(store.getItem('symbols_access_token'), null)
})
