// Regression tests for the OAuth + activateExtension 400 bug.
//
// Before the fix, activateExtension only accepted { email, password }.
// OAuth callers (Google/GitHub) signed in via loginAll({ symbolsAccessToken })
// — which persists the SDK token to `window.localStorage.symbols_access_token`
// — then triggered an extension activation that arrived with no creds at
// all. JSON.stringify({ email: undefined, password: undefined }) → "{}",
// which the bridge edge function rejects with 400
// "email+password or symbols_access_token required".
//
// The fix: mirror loginAll's mode selection. Prefer explicit
// `symbolsAccessToken` arg → localStorage fallback → email+password.

import test from 'tape'
import { createAuthBridge } from '../src/bridge.js'

const fakeAppConfig = (cfg = {}) => ({ get: () => cfg })

const buildRegistry = (projects) => {
  const _clients = new Map()
  return {
    listConfiguredProjects: () => Object.keys(projects),
    getProjectConfig: (k) => projects[k] || null,
    getClient: (k) => {
      if (!projects[k]) return null
      if (!_clients.has(k)) _clients.set(k, projects[k]._client)
      return _clients.get(k)
    },
    forEachClient: (fn) => {
      for (const [k, p] of Object.entries(projects)) fn(p._client, k)
    }
  }
}

const fakeClient = () => ({
  auth: {
    setSession: async () => ({ data: {}, error: null }),
    signOut: async () => null,
    getSession: async () => ({ data: { session: null } }),
    refreshSession: async () => ({ data: {}, error: null })
  }
})

// Capture-style fetch stub — records every (url, body) for assertion.
const installCapturingFetch = (response) => {
  const orig = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    return response
  }
  return { calls, restore: () => { globalThis.fetch = orig } }
}

const installLocalStorage = (entries = {}) => {
  const store = { ...entries }
  const orig = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] }
    }
  }
  return () => { globalThis.window = orig }
}

const OK_RESPONSE = {
  ok: true,
  status: 200,
  json: async () => ({
    supabase: { accessToken: 'sb-ok', refreshToken: 'sb-r' },
    claims: { workspace_id: 'w' }
  })
}

test('activateExtension: OAuth path uses localStorage symbols_access_token (NO email/password)', async (t) => {
  t.plan(3)
  const projects = {
    governance: {
      bridgeUrl: 'https://bridge.example/governance',
      anonKey: 'anon',
      required: false,
      shouldActivate: () => true,
      _client: fakeClient()
    }
  }
  const restoreLs = installLocalStorage({ symbols_access_token: 'sdk-tok-xyz' })
  const { calls, restore } = installCapturingFetch(OK_RESPONSE)
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  // Caller has NO email/password — the exact shape that produced the 400
  // before the fix.
  const result = await auth.activateExtension('governance', {})
  restore()
  restoreLs()
  t.equal(result.ok, true, 'activateExtension succeeds')
  t.equal(calls.length, 1, 'bridge called once')
  t.deepEqual(
    calls[0].body,
    { symbols_access_token: 'sdk-tok-xyz' },
    'body uses symbols_access_token from localStorage — not the empty email/password shape'
  )
})

test('activateExtension: explicit symbolsAccessToken arg wins over localStorage', async (t) => {
  t.plan(2)
  const projects = {
    governance: {
      bridgeUrl: 'https://bridge.example/governance',
      anonKey: 'anon',
      required: false,
      shouldActivate: () => true,
      _client: fakeClient()
    }
  }
  const restoreLs = installLocalStorage({ symbols_access_token: 'ls-tok' })
  const { calls, restore } = installCapturingFetch(OK_RESPONSE)
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.activateExtension('governance', { symbolsAccessToken: 'arg-tok' })
  restore()
  restoreLs()
  t.equal(result.ok, true, 'activateExtension succeeds')
  t.deepEqual(
    calls[0].body,
    { symbols_access_token: 'arg-tok' },
    'explicit arg token preferred over localStorage'
  )
})

test('activateExtension: email+password path still works (back-compat)', async (t) => {
  t.plan(2)
  const projects = {
    governance: {
      bridgeUrl: 'https://bridge.example/governance',
      anonKey: 'anon',
      required: false,
      shouldActivate: () => true,
      _client: fakeClient()
    }
  }
  // No localStorage token — should fall back to email/password.
  const restoreLs = installLocalStorage({})
  const { calls, restore } = installCapturingFetch(OK_RESPONSE)
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.activateExtension('governance', { email: 'a@b', password: 'pw' })
  restore()
  restoreLs()
  t.equal(result.ok, true, 'activateExtension succeeds')
  t.deepEqual(
    calls[0].body,
    { email: 'a@b', password: 'pw' },
    'falls back to email+password when no token available'
  )
})

test('activateExtension: no args at all + no localStorage token → falls through to email+password (bridge will 400, SDK does not pre-validate)', async (t) => {
  // The SDK trusts the bridge to be the authority on what's a valid
  // payload. With nothing to send, the SDK still issues the call with
  // `{ email: undefined, password: undefined }` — the bridge then 400s.
  // This matches today's contract (the SDK does not pre-empt server
  // validation) and keeps the diagnostics flowing through err.payload.
  t.plan(2)
  const projects = {
    governance: {
      bridgeUrl: 'https://bridge.example/governance',
      anonKey: 'anon',
      required: false,
      shouldActivate: () => true,
      _client: fakeClient()
    }
  }
  const restoreLs = installLocalStorage({})
  const { calls, restore } = installCapturingFetch({
    ok: false,
    status: 400,
    json: async () => ({ error: 'email+password or symbols_access_token required' })
  })
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.activateExtension('governance', {})
  restore()
  restoreLs()
  t.equal(result.ok, false, 'reports the 400 from the bridge')
  // JSON.stringify drops `undefined` values, so the body that lands on
  // the wire is literally `{}` — exactly what the bridge edge function
  // sees and rejects with 400. Kept as a contract anchor so a future
  // refactor that starts pre-validating the payload SDK-side will
  // surface here and force an intentional decision.
  t.deepEqual(calls[0].body, {}, 'wire body is empty (the original bug condition)')
})
