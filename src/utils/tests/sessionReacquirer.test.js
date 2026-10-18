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

  // Review M2 (2026-10-09): a session that holds its OWN refresh token is the
  // owner of the login. When the server refuses that token on purpose
  // (revoked, suspended, sign-out-everywhere) the owner must sign out — it
  // must never borrow a peer's access token through the reacquirer.
  test('an OWNER whose refresh is refused (401 revoked) signs out and never borrows', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    local.setItem('symbols_refresh_token', 'ref-own')
    globalThis.fetch = async (url, opts) => {
      refreshCalls.push(JSON.parse(opts.body).refreshToken)
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_token', code: 'invalid_token', reason: 'revoked', message: 'Refresh token is revoked or expired.' })
      }
    }
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return { access_token: 'acc-peer', expires_at: Date.now() + HOUR }
    })
    await assert.rejects(() => tm.ensureValidToken())
    assert.deepEqual(refreshCalls, ['ref-own'], 'one refresh, refused')
    assert.equal(asked, 0, 'the owner must not borrow the peer token')
    assert.equal(tm.hasTokens(), false, 'signed out')
    assert.equal(local.getItem('symbols_access_token'), null)
  })

  test('an OWNER whose refresh is refused for any other reason (500) still never borrows', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    local.setItem('symbols_refresh_token', 'ref-own')
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) })
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return { access_token: 'acc-peer', expires_at: Date.now() + HOUR }
    })
    await assert.rejects(() => tm.ensureValidToken())
    assert.equal(asked, 0)
  })

  test('the refused refresh error carries the server status and reason', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    local.setItem('symbols_refresh_token', 'ref-own')
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ reason: 'revoked', message: 'Refresh token is revoked or expired.' })
    })
    const tm = manager()
    const err = await tm.ensureValidToken().then(() => null, (e) => e)
    assert.equal(err?.status, 401)
    assert.equal(err?.reason, 'revoked')
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

// ── Review round 3 (2026-10-09): D1, D2, D4 ──────────────────────────────
describe('TokenManager session ownership mark and back-off', () => {
  beforeEach(() => {
    local.clear()
    mockFetch(revoked)
  })
  afterEach(() => {
    delete globalThis.fetch
    while (made.length) made.pop().destroy?.()
  })

  // D1: every SDK sign-in stores its tokens through setTokens. A refresh token
  // there is THIS origin's own login: mark it, so a copy (unmarked) can be told
  // apart on the borrowing origin.
  test("D1: setTokens with a refresh token marks the session 'own'", () => {
    const tm = manager()
    tm.setTokens({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 })
    assert.equal(local.getItem('symbols_session_source'), 'own')
  })

  test("D1: adoptAccessToken marks the session 'bridge'; clearTokens removes the mark", () => {
    const tm = manager()
    tm.adoptAccessToken({ access_token: 'acc', expires_at: Date.now() + HOUR })
    assert.equal(local.getItem('symbols_session_source'), 'bridge')
    tm.clearTokens()
    assert.equal(local.getItem('symbols_session_source'), null)
  })

  // D4: the STORAGE copy of a refresh token goes too, not only memory.
  test('D4: adoptAccessToken removes a refresh token held in STORAGE', () => {
    local.setItem('symbols_refresh_token', 'copied-ref')
    const tm = manager()
    tm.adoptAccessToken({ access_token: 'acc', expires_at: Date.now() + HOUR })
    assert.equal(local.getItem('symbols_refresh_token'), null)
    assert.equal(tm.hasRefreshToken(), false)
  })

  // D2: a handover with less than refreshBuffer (60 s) left reads as expired at
  // once, so every call asked the bridge again (20 calls → 20 iframe loads).
  // One ask per token; then use it until it really expires.
  test('D2: a short-lived handover is asked for ONCE, then used until it really expires', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let asked = 0
    const shortLived = () => ({ access_token: `acc-${asked}`, expires_at: Date.now() + 30_000 })
    tm.setSessionReacquirer(async () => {
      asked++
      return shortLived()
    })
    const tokens = []
    for (let i = 0; i < 20; i++) tokens.push(await tm.ensureValidToken())
    assert.equal(asked, 1, '20 calls, one ask')
    assert.equal(new Set(tokens).size, 1)
    assert.ok(tokens[0], 'the short-lived token is used meanwhile')
    // once it has REALLY expired, one more ask
    tm.tokens.expiresAt = Date.now() - 1
    await tm.ensureValidToken()
    assert.equal(asked, 2)
  })

  test('D2 CONTROL: a long-lived handover is also asked for once', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return { access_token: 'acc-new', expires_at: Date.now() + HOUR }
    })
    for (let i = 0; i < 20; i++) await tm.ensureValidToken()
    assert.equal(asked, 1)
  })
})

// ── A SLOW BRIDGE (2026-10-19, live on canvas.dev) ────────────────────────
// The bridge answer is a FULL shell boot in a hidden iframe. Measured on
// canvas.dev under load: no answer inside the workspace helper's 4 s default,
// so the expiry re-ask (60 s before expiry) failed, the SDK cleared a token
// that still had up to 60 s of life, and the next call went out with no
// bearer (401). Rules now:
//   (a) a re-ask with NO answer (timeout, error, unusable reply) KEEPS a token
//       that still lives; the next authenticated call asks again. Sign out
//       only at REAL expiry, or on the owner's definite "no session" answer
//       (the reacquirer calls opts.onNoSession) — once, never a loop;
//   (b) the SDK hands the reacquirer the cold-boot budget, opts.timeoutMs
//       (8 s by default), not the helper's 4 s.
describe('TokenManager session reacquirer — slow bridge', () => {
  beforeEach(() => {
    local.clear()
    mockFetch(revoked)
  })
  afterEach(() => {
    delete globalThis.fetch
    while (made.length) made.pop().destroy?.()
  })

  // The workspace helper's shape (sessionBridgeReacquire.js): it waits
  // `timeoutMs` (4000 when the caller passes none), resolves the answer when
  // the bridge replies inside that budget, else null; an explicit "no session"
  // reply calls onNoSession. Time runs 100x faster here; the verdict is a
  // comparison, not a timer race.
  // Let a BACKGROUND re-ask (a token that still lives) settle.
  const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

  const bridgeAnsweringAfter = (answerMs, answer, { onAsk } = {}) => ({ timeoutMs = 4000, onNoSession } = {}) => {
    onAsk?.({ timeoutMs, onNoSession })
    return new Promise((resolve) => {
      if (answerMs <= timeoutMs) {
        setTimeout(() => {
          const value = typeof answer === 'function' ? answer({ onNoSession }) : answer
          resolve(value)
        }, answerMs / 100)
      } else {
        setTimeout(() => resolve(null), timeoutMs / 100)
      }
    })
  }

  test('(b) a bridge that answers after 6 s keeps the session (the SDK waits 8 s, not 4 s)', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000) // really expired: only an answer saves it
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    const seen = []
    tm.setSessionReacquirer(
      bridgeAnsweringAfter(6000, { access_token: 'acc-new', expires_at: Date.now() + HOUR }, { onAsk: (o) => seen.push(o.timeoutMs) })
    )
    assert.equal(await tm.ensureValidToken(), 'acc-new')
    assert.deepEqual(seen, [8000], 'the reacquirer is handed the 8 s cold-boot budget')
    assert.equal(tm.hasTokens(), true)
    assert.equal(local.getItem('symbols_access_token'), 'acc-new')
    assert.equal(expired, 0)
  })

  test('(b) the budget is configurable (reacquireTimeoutMs)', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    tm.config.reacquireTimeoutMs = 12000
    const seen = []
    tm.setSessionReacquirer(bridgeAnsweringAfter(10000, { access_token: 'acc-new', expires_at: Date.now() + HOUR }, { onAsk: (o) => seen.push(o.timeoutMs) }))
    assert.equal(await tm.ensureValidToken(), 'acc-new')
    assert.deepEqual(seen, [12000])
  })

  test('(a) a failed re-ask with token life left KEEPS the token, and the next call asks again', async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000) // inside the 60 s buffer, still valid
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    let asked = 0
    let answer = null // first ask: no answer (a timeout)
    tm.setSessionReacquirer(async () => {
      asked++
      return answer
    })
    assert.equal(await tm.ensureValidToken(), 'acc-old', 'the still-valid token goes out')
    await settle()
    assert.equal(asked, 1)
    assert.equal(tm.hasTokens(), true)
    assert.equal(tm.getAccessToken(), 'acc-old', 'no answer: the token is kept')
    assert.equal(local.getItem('symbols_access_token'), 'acc-old', 'storage keeps it too')
    assert.equal(expired, 0, 'no sign-out while the token lives')
    // the next authenticated call retries — and adopts the answer this time
    answer = { access_token: 'acc-new', expires_at: Date.now() + HOUR }
    await tm.ensureValidToken()
    await settle()
    assert.equal(asked, 2, 'the next call asked again')
    assert.equal(tm.getAccessToken(), 'acc-new', 'the retry adopted the answer')
    assert.equal(await tm.ensureValidToken(), 'acc-new')
    assert.equal(asked, 2, 'a fresh token asks nothing')
    assert.equal(expired, 0)
  })

  // A request that WAITS on the bridge would hang here: the timeout turns that into a failure.
  test('(a) while the token lives, a request never waits on the re-ask; one ask in flight at a time', { timeout: 2000 }, async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000)
    const tm = manager()
    let asked = 0
    let answer
    tm.setSessionReacquirer(() => {
      asked++
      return new Promise((resolve) => { answer = resolve }) // a bridge that has not answered yet
    })
    const tokens = []
    for (let i = 0; i < 5; i++) tokens.push(await tm.ensureValidToken())
    assert.deepEqual(tokens, ['acc-old', 'acc-old', 'acc-old', 'acc-old', 'acc-old'], 'no call waited')
    assert.equal(asked, 1, 'one ask in flight, shared')
    answer({ access_token: 'acc-new', expires_at: Date.now() + HOUR })
    await settle()
    assert.equal(tm.getAccessToken(), 'acc-new')
  })

  test('(a) a reacquirer that throws with token life left keeps the token too', async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000)
    const tm = manager()
    tm.setSessionReacquirer(async () => {
      throw new Error('bridge timeout')
    })
    assert.equal(await tm.ensureValidToken(), 'acc-old')
    await settle()
    assert.equal(tm.hasTokens(), true)
    assert.equal(tm.getAccessToken(), 'acc-old')
  })

  test('(a) a REAL expiry with no answer signs out ONCE — no loop, no second ask', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return null
    })
    assert.equal(await tm.ensureValidToken(), null)
    for (let i = 0; i < 5; i++) assert.equal(await tm.ensureValidToken(), null)
    assert.equal(asked, 1, 'a signed-out manager never asks again')
    assert.equal(expired, 1, 'one sign-out')
    assert.equal(tm.hasTokens(), false)
    assert.equal(local.getItem('symbols_access_token'), null)
  })

  test('(a) the token kept after a failed re-ask is signed out once it REALLY expires', async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000)
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return null
    })
    assert.equal(await tm.ensureValidToken(), 'acc-old')
    await settle()
    tm.tokens.expiresAt = Date.now() - 1 // the minute ran out, still no answer
    assert.equal(await tm.ensureValidToken(), null)
    assert.equal(asked, 2)
    assert.equal(expired, 1)
    assert.equal(tm.hasTokens(), false)
  })

  test("(a) the owner's definite 'no session' answer signs out even with token life left", async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000)
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    tm.setSessionReacquirer(bridgeAnsweringAfter(500, ({ onNoSession }) => {
      onNoSession?.()
      return null
    }))
    await tm.ensureValidToken()
    await settle(20)
    assert.equal(tm.hasTokens(), false, 'the borrowed session ended')
    assert.equal(local.getItem('symbols_access_token'), null)
    assert.equal(expired, 1, 'once')
    assert.equal(await tm.ensureValidToken(), null, 'and stays signed out')
    assert.equal(expired, 1)
  })

  test("(a) a REALLY expired token with the owner's 'no session' answer signs out once", async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    tm.setSessionReacquirer(async ({ onNoSession } = {}) => {
      onNoSession?.()
      return null
    })
    assert.equal(await tm.ensureValidToken(), null)
    assert.equal(expired, 1)
  })

  test("(a) a 'no session' verdict for an OLD token never signs out a session that changed meanwhile", { timeout: 2000 }, async () => {
    seedAccessOnly('acc-old', Date.now() + 30_000)
    const tm = manager()
    let expired = 0
    tm.config.onTokenExpired = () => { expired++ }
    let verdict
    tm.setSessionReacquirer(({ onNoSession } = {}) => new Promise((resolve) => {
      verdict = () => { onNoSession?.(); resolve(null) }
    }))
    await tm.ensureValidToken() // background ask for acc-old
    tm.setTokens({ access_token: 'acc-own', refresh_token: 'ref-own', expires_in: 3600 }) // an own login meanwhile
    verdict()
    await settle()
    assert.equal(tm.getAccessToken(), 'acc-own', 'the own login stays')
    assert.equal(expired, 0)
  })

  test('D2 refined: a LONG-lived reacquired token that enters its last minute is asked for again', async () => {
    seedAccessOnly('acc-old', Date.now() - 1000)
    const tm = manager()
    let asked = 0
    tm.setSessionReacquirer(async () => {
      asked++
      return { access_token: `acc-${asked}`, expires_at: Date.now() + HOUR }
    })
    assert.equal(await tm.ensureValidToken(), 'acc-1')
    tm.tokens.expiresAt = Date.now() + 30_000 // an hour later: inside the buffer
    assert.equal(await tm.ensureValidToken(), 'acc-1', 'the still-valid token goes out')
    await settle()
    assert.equal(asked, 2, 'asked while the token still lives, not at real expiry')
    assert.equal(tm.getAccessToken(), 'acc-2')
  })
})
