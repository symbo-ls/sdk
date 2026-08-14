// Per-tab persona isolation (Nika's decision, 2026-08-14).
//
// THE DEFECT THIS PINS: `startPersona` used to adopt the persona token via
// `TokenManager.setTokens`, which writes `symbols_access_token` in
// localStorage — the admin's OWN session key, shared by every tab on the
// origin. Starting a persona in one tab therefore narrowed the admin's other
// tabs too, silently, with no error anywhere. The fix layers the persona token
// as a sessionStorage OVERLAY (per-tab by construction) and leaves the base
// token untouched.
//
// Every test below drives the REAL TokenManager against a fake `window` whose
// localStorage is shared between "tabs" and whose sessionStorage is not —
// which is exactly the browser's own model, and the only shape in which the
// cross-tab claim can be tested at all.
import test from 'tape'
import sinon from 'sinon'
import { PersonaService } from '../../PersonaService.js'
import { createTokenManager } from '../../../utils/TokenManager.js'

const sandbox = sinon.createSandbox()

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const makeJwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

const PERSONA_CLAIM = { role: 'viewer', sid: 'ps_1', startedAt: 1755000000 }
const personaJwt = makeJwt({ sub: 'admin1', persona: PERSONA_CLAIM })
const adminJwt = makeJwt({ sub: 'admin1' })

const ACCESS_KEY = 'symbols_access_token'
const OVERLAY_KEY = 'symbols_persona_access_token'

// A storage that behaves like the DOM one for the three calls we use.
const makeStorage = () => {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    _data: data
  }
}

// Install a fake browser. `localStorage` is shared across every tab created
// from the same call; each `openTab()` gets its OWN sessionStorage.
const makeBrowser = () => {
  const localStorage = makeStorage()
  const prior = Object.prototype.hasOwnProperty.call(globalThis, 'window')
    ? globalThis.window
    : undefined
  const openTab = () => {
    const sessionStorage = makeStorage()
    globalThis.window = { localStorage, sessionStorage }
    return { sessionStorage, tm: createTokenManager({ apiUrl: 'http://api.test' }) }
  }
  const restore = () => {
    if (prior === undefined) delete globalThis.window
    else globalThis.window = prior
  }
  return { localStorage, openTab, restore }
}

const personaSvc = (tm) => {
  const svc = new PersonaService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._tokenManager = tm
  return svc
}

test('THE TRAP: starting a persona must NOT touch the admin session key', async (t) => {
  const browser = makeBrowser()
  const tab = browser.openTab()
  tab.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })

  const svc = personaSvc(tab.tm)
  sandbox.stub(svc, '_call').resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })
  await svc.startPersona({ role: 'viewer' })

  t.equal(
    browser.localStorage.getItem(ACCESS_KEY),
    adminJwt,
    'localStorage symbols_access_token is STILL the admin token — the whole defect in one assertion'
  )
  t.equal(
    tab.sessionStorage.getItem(OVERLAY_KEY),
    personaJwt,
    'the persona token lives in this tab sessionStorage only'
  )
  t.equal(tab.tm.getAccessToken(), personaJwt, 'this tab resolves the persona token')
  t.equal(tab.tm.getRefreshToken(), 'rt_admin', 'admin refresh credential preserved')

  tab.tm.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('a persona in tab A leaves tab B fully admin', async (t) => {
  const browser = makeBrowser()
  const tabA = browser.openTab()
  tabA.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })

  const svc = personaSvc(tabA.tm)
  sandbox.stub(svc, '_call').resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })
  await svc.startPersona({ role: 'viewer' })

  // Tab B opens AFTER the persona started, reading the same localStorage.
  const tabB = browser.openTab()

  t.equal(tabA.tm.getAccessToken(), personaJwt, 'tab A is the persona')
  t.equal(tabB.tm.getAccessToken(), adminJwt, 'tab B is still the admin')
  t.equal(tabA.tm.hasPersonaToken(), true, 'tab A reports a persona')
  t.equal(tabB.tm.hasPersonaToken(), false, 'tab B reports none')
  t.equal(tabB.sessionStorage.getItem(OVERLAY_KEY), null, 'no overlay leaked into tab B storage')

  tabA.tm.destroy()
  tabB.tm.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('the overlay survives a reload of its OWN tab', async (t) => {
  const browser = makeBrowser()
  const tab = browser.openTab()
  tab.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })

  const svc = personaSvc(tab.tm)
  sandbox.stub(svc, '_call').resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })
  await svc.startPersona({ role: 'viewer' })
  tab.tm.destroy()

  // A reload = a fresh TokenManager over the SAME sessionStorage.
  globalThis.window = { localStorage: browser.localStorage, sessionStorage: tab.sessionStorage }
  const reloaded = createTokenManager({ apiUrl: 'http://api.test' })

  t.equal(reloaded.getAccessToken(), personaJwt, 'still viewing as the persona after reload')
  t.equal(reloaded.tokens.accessToken, adminJwt, 'the base session underneath is unchanged')

  reloaded.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('ending a persona is a DELETE — no refresh, admin token restored exactly', async (t) => {
  const browser = makeBrowser()
  const tab = browser.openTab()
  tab.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })
  const refreshSpy = sandbox.spy(tab.tm, 'refreshTokens')

  const svc = personaSvc(tab.tm)
  const call = sandbox.stub(svc, '_call')
  call.onFirstCall().resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })
  call.onSecondCall().resolves({ ended: 1 })

  await svc.startPersona({ role: 'viewer' })
  const result = await svc.endPersona()

  t.equal(result.ok, true, 'end reports ok')
  t.equal(result.restored, true, 'end reports the admin view restored')
  t.equal(refreshSpy.callCount, 0, 'no token refresh was needed — the base token never moved')
  t.equal(tab.tm.getAccessToken(), adminJwt, 'admin token is current again')
  t.equal(tab.sessionStorage.getItem(OVERLAY_KEY), null, 'overlay deleted')

  tab.tm.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('an EXPIRED persona does not silently fall back to admin power', async (t) => {
  // The overlay is sticky by design: dropping it on expiry would restore full
  // admin permissions underneath a UI still showing the persona. The request
  // must 401 honestly instead.
  const browser = makeBrowser()
  const tab = browser.openTab()
  tab.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })
  const expired = makeJwt({ sub: 'admin1', persona: PERSONA_CLAIM, exp: 1 })
  tab.tm.setPersonaToken(expired)

  t.equal(tab.tm.getAccessToken(), expired, 'still presenting the expired persona token')
  t.notEqual(tab.tm.getAccessToken(), adminJwt, 'never silently the admin token')

  tab.tm.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('signing out drops the overlay with the session', async (t) => {
  const browser = makeBrowser()
  const tab = browser.openTab()
  tab.tm.setTokens({ access_token: adminJwt, refresh_token: 'rt_admin' })
  tab.tm.setPersonaToken(personaJwt)

  tab.tm.clearTokens()

  t.equal(tab.tm.getAccessToken(), null, 'no credential at all after sign-out')
  t.equal(tab.sessionStorage.getItem(OVERLAY_KEY), null, 'overlay cleared from storage too')

  tab.tm.destroy()
  browser.restore()
  sandbox.restore()
  t.end()
})

test('a TokenManager without overlay support still gets a working persona', async (t) => {
  // Published-version skew: an older TokenManager in a deployed bundle has no
  // setPersonaToken. The persona must still work (cross-tab, as before) rather
  // than fail — the UI is identical either way.
  const legacyTm = {
    access: adminJwt,
    setTokensCalls: [],
    getAccessToken () {
      return this.access
    },
    setTokens (payload) {
      this.setTokensCalls.push(payload)
      this.access = payload.access_token
      return this.access
    },
    hasRefreshToken: () => true
  }
  const svc = personaSvc(legacyTm)
  sandbox.stub(svc, '_call').resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })

  await svc.startPersona({ role: 'viewer' })

  t.equal(legacyTm.setTokensCalls.length, 1, 'fell back to the legacy adopt path')
  t.equal(legacyTm.getAccessToken(), personaJwt, 'persona is in force')

  sandbox.restore()
  t.end()
})
