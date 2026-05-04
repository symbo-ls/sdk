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

const fakeClient = (overrides = {}) => ({
  auth: {
    setSession: overrides.setSession || (async () => ({ data: {}, error: null })),
    signOut: overrides.signOut || (async () => null),
    getSession: overrides.getSession || (async () => ({ data: { session: null } })),
    refreshSession: overrides.refreshSession || (async () => ({ data: {}, error: null }))
  }
})

const installFetchStub = (handler) => {
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => handler(url, init)
  return () => { globalThis.fetch = orig }
}

test('loginAll aborts when required project setSession fails', async (t) => {
  t.plan(3)
  const projects = {
    main: {
      bridgeUrl: 'https://bridge.example/main',
      anonKey: 'anon',
      required: true,
      shouldActivate: () => true,
      _client: fakeClient({
        setSession: async () => { throw new Error('setSession boom') }
      })
    }
  }
  const restoreFetch = installFetchStub(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      supabase: { accessToken: 'ok', refreshToken: 'r' },
      claims: { workspace_id: 'w' }
    })
  }))
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.loginAll({ email: 'a@b', password: 'x' })
  restoreFetch()
  t.equal(result.ok, false, 'login aborts')
  t.ok(result.error, 'error surfaced')
  t.equal(result.results[0].status, 'error', 'required project marked error')
})

test('loginAll succeeds when required setSession resolves cleanly', async (t) => {
  t.plan(2)
  let setCalls = 0
  const projects = {
    main: {
      bridgeUrl: 'https://bridge.example/main',
      anonKey: 'anon',
      required: true,
      shouldActivate: () => true,
      _client: fakeClient({
        setSession: async () => { setCalls += 1; return { data: {}, error: null } }
      })
    }
  }
  const restoreFetch = installFetchStub(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      supabase: { accessToken: 'tok', refreshToken: 'r' },
      claims: { workspace_id: 'w' }
    })
  }))
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.loginAll({ email: 'a@b', password: 'x' })
  restoreFetch()
  t.equal(result.ok, true)
  t.equal(setCalls, 1, 'setSession invoked once for the required project')
})

test('loginAll bails before _setSession when bridge rejects', async (t) => {
  t.plan(2)
  let setCalls = 0
  const projects = {
    main: {
      bridgeUrl: 'https://bridge.example/main',
      anonKey: 'anon',
      required: true,
      shouldActivate: () => true,
      _client: fakeClient({
        setSession: async () => { setCalls += 1 }
      })
    }
  }
  const restoreFetch = installFetchStub(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'bad creds' })
  }))
  const auth = createAuthBridge({
    registry: buildRegistry(projects),
    appConfig: fakeAppConfig({})
  })
  const result = await auth.loginAll({ email: 'a@b', password: 'x' })
  restoreFetch()
  t.equal(result.ok, false, 'login fails')
  t.equal(setCalls, 0, 'setSession never invoked when bridge rejects')
})
