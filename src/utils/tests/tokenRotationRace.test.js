// CROSS-TAB REFRESH-ROTATION RACE (2026-09-02) — the /login?next renderer-OOM
// loop's engine. Refresh tokens are single-use; two tabs of one origin each
// hold a copy in shared localStorage. The loser of the rotation race used to
// send its stale copy, read the refusal as "session dead", clear the SHARED
// storage and bounce — the ping-pong workspace 3ade58b39 breaks at the guard.
// These tests pin the TokenManager side: the loser adopts the winner's tokens
// instead of destroying a healthy session.
//
// Run: node --test src/utils/tests/tokenRotationRace.test.js
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const makeStore = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear()
  }
}

// A browser-shaped window BEFORE the import-time environment checks run in
// the constructor (storage getter checks `typeof window`). NODE_ENV would
// force memory mode through the config default, so storageType is passed
// explicitly per instance instead.
const sharedLocal = makeStore()
globalThis.window = { localStorage: sharedLocal, sessionStorage: makeStore() }

const { TokenManager } = await import('../TokenManager.js')

const PREFIX = 'symbols_'
const seed = (access, refresh, expiresAt) => {
  sharedLocal.setItem(`${PREFIX}access_token`, access)
  sharedLocal.setItem(`${PREFIX}refresh_token`, refresh)
  sharedLocal.setItem(`${PREFIX}expires_at`, String(expiresAt))
}

// Timer behavior is not under test: seeded-expired tokens arm a delay-0
// refresh timer at construction that both keeps node --test alive and can
// launch stray refreshes mid-test. Stub the scheduler and drop the boot timer.
const made = []
const tab = () => {
  const t = new TokenManager({ apiUrl: 'https://api.test', storageType: 'localStorage' })
  if (t.refreshTimeout) clearTimeout(t.refreshTimeout)
  t.refreshTimeout = null
  t.scheduleRefresh = () => {}
  made.push(t)
  return t
}

let fetchCalls
const mockFetch = (impl) => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body)
    fetchCalls.push(body.refreshToken)
    return impl(body.refreshToken)
  }
}
const ok = (access, refresh) => ({
  ok: true,
  json: async () => ({
    success: true,
    data: { tokens: { accessToken: access, refreshToken: refresh, accessTokenExp: { expiresIn: 3600 } } }
  })
})
const refuse = () => ({ ok: false, json: async () => ({ message: 'invalid refresh token' }) })

describe('cross-tab refresh rotation race', () => {
  beforeEach(() => {
    sharedLocal.clear()
    delete globalThis.navigator
  })
  afterEach(() => {
    delete globalThis.fetch
    while (made.length) {
      const t = made.pop()
      try { t.destroy?.() } catch (_) {}
      if (t.refreshTimeout) clearTimeout(t.refreshTimeout)
    }
  })

  test('layer 2: a rotation finished by another tab ends the refresh with zero network', async () => {
    seed('A1-expired', 'R1', Date.now() - 1000)
    const b = tab() // loads A1/R1
    // The other tab rotates: storage now holds a FRESH access token.
    seed('A2', 'R2', Date.now() + 3600e3)
    mockFetch(() => refuse())
    const result = await b._performRefresh()
    assert.equal(result.accessToken, 'A2')
    assert.equal(b.getRefreshToken(), 'R2')
    assert.equal(fetchCalls.length, 0, 'no network when the winner already rotated')
  })

  test('layer 3: a mid-flight loss adopts the winner instead of dying', async () => {
    seed('A1-expired', 'R1', Date.now() - 1000)
    const b = tab()
    mockFetch((sentToken) => {
      if (sentToken === 'R1') {
        // The winner lands its rotation exactly while our request is in
        // flight: storage flips to the new pair and OUR token is refused.
        seed('A2', 'R2', Date.now() + 3600e3)
        return refuse()
      }
      throw new Error('unexpected token ' + sentToken)
    })
    const result = await b._performRefresh()
    assert.equal(result.accessToken, 'A2')
    assert.deepEqual(fetchCalls, ['R1'])
  })

  test('layer 3 retries once with the adopted token when the winner\'s access is also stale', async () => {
    seed('A1-expired', 'R1', Date.now() - 1000)
    const b = tab()
    mockFetch((sentToken) => {
      if (sentToken === 'R1') {
        seed('A2-expired', 'R2', Date.now() - 500)
        return refuse()
      }
      if (sentToken === 'R2') return ok('A3', 'R3')
      throw new Error('unexpected token ' + sentToken)
    })
    const result = await b._performRefresh()
    assert.equal(result.accessToken, 'A3')
    assert.deepEqual(fetchCalls, ['R1', 'R2'])
  })

  test('a genuine refusal with unchanged storage still throws', async () => {
    seed('A1-expired', 'R1', Date.now() - 1000)
    const b = tab()
    mockFetch(() => refuse())
    await assert.rejects(() => b._performRefresh(), /invalid refresh token/)
    assert.deepEqual(fetchCalls, ['R1'])
  })

  test('layer 1: rotation goes through navigator.locks when present', async () => {
    seed('A1-expired', 'R1', Date.now() - 1000)
    const b = tab()
    let lockName = null
    globalThis.navigator = {
      locks: {
        request: async (name, cb) => {
          lockName = name
          return cb()
        }
      }
    }
    mockFetch((t) => (t === 'R1' ? ok('A2', 'R2') : refuse()))
    const result = await b._performRefresh()
    assert.equal(lockName, 'symbols_token_rotation')
    assert.equal(result.accessToken, 'A2')
  })
})
