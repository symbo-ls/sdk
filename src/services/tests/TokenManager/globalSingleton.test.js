// The DEFAULT TokenManager must survive a duplicate sdk module instance.
//
// THE DEFECT THIS PINS: `getTokenManager()` held its singleton in a
// MODULE-SCOPED `let`. One realm that evaluates `@symbo.ls/sdk` twice — a
// bundled copy inside smbls plus the host app's own import, which is exactly
// what canvas, preview and the workspace shell do — therefore built TWO
// TokenManagers over ONE localStorage session. Both loaded the same refresh
// token at construction and each kept its own IN-MEMORY copy of it. The first
// one to rotate spent that token; the second then presented the spent token,
// the server rejected it, and the user was signed out with nothing thrown and
// nothing logged.
//
// `src/state/rootEventBus.js` already parks its singleton on a `globalThis`
// key for this reason. These tests hold `getTokenManager()` to the same rule.
//
// Every test drives the REAL TokenManager against a fake `window` whose
// localStorage is shared — the browser's own model, and the only shape in
// which the duplicate-copy claim can be tested at all.
import test from 'tape'

const MODULE_URL = new URL('../../../utils/TokenManager.js', import.meta.url).href
const GLOBAL_KEY = '__SMBLS_TOKEN_MANAGER__'
const OPTIONS = { apiUrl: 'http://api.test', storageType: 'localStorage' }

// A second module URL for the same file. Node keys its ESM cache by the FULL
// url, so a query string forces a genuinely separate evaluation with its own
// module scope — the same thing two bundle copies do in one browser realm.
const loadCopy = (tag) => import(`${MODULE_URL}?sdkCopy=${tag}`)

// A storage that behaves like the DOM one for the calls TokenManager uses.
const makeStorage = () => {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear()
  }
}

// A refresh endpoint that ROTATES: every accepted refresh token is spent, and
// presenting a spent one is a 401 — the real server's contract, and the only
// contract under which the duplicate-manager defect is visible at all.
const installAuthServer = () => {
  const state = { accepted: 0, rejected: 0, current: 'refresh-0' }
  globalThis.fetch = async (url, opts) => {
    const { refreshToken } = JSON.parse(opts.body)
    if (refreshToken !== state.current) {
      state.rejected++
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid refresh token' })
      }
    }
    state.accepted++
    state.current = `refresh-${state.accepted}`
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          tokens: {
            accessToken: `access-${state.accepted}`,
            refreshToken: state.current,
            accessTokenExp: { expiresIn: 3600 }
          }
        }
      })
    }
  }
  return state
}

// One test's world: a fake browser holding an already-signed-in session (the
// state a page is in when the sdk copies boot), a rotating refresh endpoint,
// and a tracked list of managers so `end()` clears every refresh timer even
// when an assertion fails — an uncleared timer holds the runner open forever.
const openSession = () => {
  const localStorage = makeStorage()
  localStorage.setItem('symbols_access_token', 'access-0')
  localStorage.setItem('symbols_refresh_token', 'refresh-0')
  localStorage.setItem('symbols_expires_at', String(Date.now() + 3600 * 1000))
  localStorage.setItem('symbols_expires_in', '3600')

  const priorWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window')
    ? globalThis.window
    : undefined
  const priorFetch = globalThis.fetch
  const priorSingleton = globalThis[GLOBAL_KEY]

  globalThis.window = { localStorage, sessionStorage: makeStorage() }
  delete globalThis[GLOBAL_KEY]
  const server = installAuthServer()

  const made = []
  const track = (tm) => {
    if (!made.includes(tm)) made.push(tm)
    return tm
  }
  const end = () => {
    made.forEach(tm => tm.destroy())
    const leftover = globalThis[GLOBAL_KEY]
    if (leftover && !made.includes(leftover)) leftover.destroy()
    if (priorWindow === undefined) delete globalThis.window
    else globalThis.window = priorWindow
    globalThis.fetch = priorFetch
    if (priorSingleton === undefined) delete globalThis[GLOBAL_KEY]
    else globalThis[GLOBAL_KEY] = priorSingleton
  }
  return { localStorage, server, track, end }
}

test('getTokenManager() returns ONE instance across two evaluated sdk copies', async t => {
  const s = openSession()
  try {
    const copyA = await loadCopy('identity-a')
    const copyB = await loadCopy('identity-b')

    // Guard the guard: if the two imports resolved to one module instance,
    // the rest of this file proves nothing.
    t.notEqual(copyA, copyB, 'the two imports are separate module namespaces')
    t.notEqual(
      copyA.TokenManager,
      copyB.TokenManager,
      'each copy evaluated its own TokenManager class'
    )

    const tmA = s.track(copyA.getTokenManager(OPTIONS))
    const tmB = s.track(copyB.getTokenManager(OPTIONS))

    t.equal(tmA === tmB, true, 'both copies hand back the SAME default TokenManager')
    t.equal(
      globalThis[GLOBAL_KEY] === tmA,
      true,
      `the singleton is parked on globalThis.${GLOBAL_KEY}`
    )
  } finally {
    s.end()
  }
})

test('two sdk copies refreshing at once spend ONE refresh token, not two', async t => {
  const s = openSession()
  try {
    const copyA = await loadCopy('concurrent-a')
    const copyB = await loadCopy('concurrent-b')

    const tmA = s.track(copyA.getTokenManager(OPTIONS))
    const tmB = s.track(copyB.getTokenManager(OPTIONS))

    const results = await Promise.allSettled([tmA.refreshTokens(), tmB.refreshTokens()])

    t.deepEqual(
      results.filter(r => r.status === 'rejected').map(r => String(r.reason)),
      [],
      'neither refresh failed'
    )
    t.equal(s.server.accepted, 1, 'exactly ONE rotation reached the server')
    t.equal(s.server.rejected, 0, 'no copy presented an already-spent refresh token')
    t.equal(
      s.localStorage.getItem('symbols_refresh_token'),
      'refresh-1',
      'storage holds the one rotated refresh token'
    )
  } finally {
    s.end()
  }
})

test('a second sdk copy refreshing AFTER the first is not signed out', async t => {
  const s = openSession()
  try {
    const copyA = await loadCopy('sequential-a')
    const copyB = await loadCopy('sequential-b')

    const tmA = s.track(copyA.getTokenManager(OPTIONS))
    const tmB = s.track(copyB.getTokenManager(OPTIONS))

    await tmA.refreshTokens()
    // The silent sign-out: a second manager still holds the refresh token it
    // read at construction, which the first copy has now spent.
    const failure = await tmB.refreshTokens().then(() => null, err => String(err))

    t.equal(failure, null, 'the later refresh was not rejected')
    t.equal(s.server.rejected, 0, 'no spent refresh token reached the server')
    t.equal(s.server.accepted, 2, 'both rotations were accepted')
  } finally {
    s.end()
  }
})

test('createTokenManager() keeps its per-call semantics', async t => {
  const s = openSession()
  try {
    const copyA = await loadCopy('percall-a')
    const copyB = await loadCopy('percall-b')

    const shared = s.track(copyA.getTokenManager(OPTIONS))
    const ownA = s.track(copyA.createTokenManager(OPTIONS))
    const ownB = s.track(copyB.createTokenManager(OPTIONS))

    t.equal(ownA === shared, false, 'createTokenManager() never returns the default')
    t.equal(ownA === ownB, false, 'each createTokenManager() call builds its own manager')
    t.equal(
      globalThis[GLOBAL_KEY] === shared,
      true,
      'createTokenManager() does not overwrite the shared default'
    )
  } finally {
    s.end()
  }
})
