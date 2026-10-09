// ACCESS-ONLY SESSIONS (2026-10-09) — the shell <-> canvas refresh-rotation
// sign-out. The workspace `/_session-bridge` handed a sibling origin the
// access token AND the single-use refresh token. Both origins then held one
// refresh token; whichever refreshed second got 401 REVOKED and was signed
// out. The bridge now hands over the access token only, and the peer origin
// registers a SESSION REACQUIRER (ask the owner again). These tests pin the
// TokenManager side:
//   - an expired access-only session reacquires instead of clearing, and
//     never calls /core/auth/refresh;
//   - a refused refresh (a copied token an older build left behind)
//     reacquires before clearing, and drops the dead refresh token;
//   - a transport failure keeps the old keep-and-rethrow path.
//
// Run: node --test src/utils/tests/sessionReacquirer.test.js
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const makeStore = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()]
  }
}

const local = makeStore()
globalThis.window = { localStorage: local, sessionStorage: makeStore() }

const { TokenManager } = await import(process.env.TM_PATH || '../TokenManager.js')

const made = []
const manager = () => {
  const t = new TokenManager({ apiUrl: 'https://api.test', storageType: 'localStorage' })
  if (t.refreshTimeout) clearTimeout(t.refreshTimeout)
  t.refreshTimeout = null
  t.scheduleRefresh = () => {}
  made.push(t)
  return t
}

// A canvas-like origin: access token only, already expired.
const seedAccessOnly = (access, expiresAt) => {
  local.setItem('symbols_access_token', access)
  local.setItem('symbols_expires_at', String(expiresAt))
}

let refreshCalls
const mockFetch = (impl) => {
  refreshCalls = []
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/core/auth/refresh')) refreshCalls.push(JSON.parse(opts.body).refreshToken)
    return impl(url, opts)
  }
}
const revoked = () => ({ ok: false, status: 401, json: async () => ({ message: 'REVOKED' }) })
const HOUR = 3600e3

describe('TokenManager session reacquirer', () => {
  beforeEach(() => {
    local.clear()
    mockFetch(revoked)
  })
  afterEach(() => {
    delete globalThis.fetch
    while (made.length) made.pop().destroy?.()
  })

  test('expired access-only session reacquires, never refreshes, keeps the session', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return { access_token: 'acc-new', expires_at: Date.now() + HOUR }
    })
    const token = await tm.ensureValidToken()
    assert.equal(token, 'acc-new')
    assert.equal(asked, 1)
    assert.deepEqual(refreshCalls, [], 'no /core/auth/refresh call without a refresh token')
    assert.equal(tm.hasRefreshToken(), false)
    assert.equal(local.getItem('symbols_access_token'), 'acc-new')
    assert.equal(local.getItem('symbols_refresh_token'), null)
  })

  test('CONTROL — without a reacquirer the expired access-only session clears', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    assert.equal(await tm.ensureValidToken(), null)
    assert.deepEqual(refreshCalls, [])
    assert.equal(local.getItem('symbols_access_token'), null)
  })

  test('a reacquirer that finds no session clears as before', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    tm.setSessionReacquirer(async () => null)
    assert.equal(await tm.ensureValidToken(), null)
    assert.equal(tm.hasTokens(), false)
  })

  test('a refused refresh (copied, already-spent token) reacquires and drops the dead refresh token', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    local.setItem('symbols_refresh_token', 'ref-copied')
    const tm = manager()
    tm.setSessionReacquirer(async () => ({ access_token: 'acc-new', expires_at: Date.now() + HOUR }))
    const token = await tm.ensureValidToken()
    assert.equal(token, 'acc-new')
    assert.deepEqual(refreshCalls, ['ref-copied'], 'one refresh, refused')
    assert.equal(tm.hasRefreshToken(), false)
    assert.equal(local.getItem('symbols_refresh_token'), null)

    // Next expiry: no second refresh with the dead token.
    tm.tokens.expiresAt = Date.now() - 1000
    await tm.ensureValidToken()
    assert.deepEqual(refreshCalls, ['ref-copied'])
  })

  test('a transport failure on refresh keeps the session and does not reacquire', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    local.setItem('symbols_refresh_token', 'ref-own')
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return null
    })
    await assert.rejects(() => tm.ensureValidToken())
    assert.equal(asked, 0)
    assert.equal(local.getItem('symbols_refresh_token'), 'ref-own')
  })

  test('concurrent expired calls share one reacquire', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      await new Promise((r) => setTimeout(r, 10))
      return { access_token: 'acc-new', expires_at: Date.now() + HOUR }
    })
    const all = await Promise.all([tm.ensureValidToken(), tm.ensureValidToken(), tm.ensureValidToken()])
    assert.deepEqual(all, ['acc-new', 'acc-new', 'acc-new'])
    assert.equal(asked, 1)
  })

  test('an already-expired handover is not adopted', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    tm.setSessionReacquirer(async () => ({ access_token: 'acc-stale', expires_at: Date.now() - 1 }))
    assert.equal(await tm.ensureValidToken(), null)
  })

  test('a reacquirer that throws counts as no session', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    tm.setSessionReacquirer(async () => {
      throw new Error('bridge timeout')
    })
    assert.equal(await tm.ensureValidToken(), null)
  })

  test('the persona overlay survives a reacquire', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    tm.setPersonaToken('persona-jwt')
    tm.setSessionReacquirer(async () => ({ access_token: 'acc-new', expires_at: Date.now() + HOUR }))
    await tm.ensureValidToken()
    assert.equal(tm.getPersonaToken(), 'persona-jwt')
    assert.equal(tm.tokens.accessToken, 'acc-new')
  })

  test('getTokenStatus reports an expired access-only session with a reacquirer as recoverable', () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    assert.equal(tm.getTokenStatus().status, 'expired')
    tm.setSessionReacquirer(async () => null)
    assert.equal(tm.getTokenStatus().status, 'valid')
  })
})
