import test from 'tape'
import sinon from 'sinon'
import { TrackingService } from '../../TrackingService.js'

// fly docs/FUNNEL.md §4 G2: TrackingService.setUser sends an ALLOWLIST — the
// user id and `plan` — never the e-mail, the name, the username or the whole
// user object, and the user id never falls back to the e-mail (it used to:
// `userId: user.id || user.email`, `traits: user`). Asserts what the service
// hands to the analyzing client's identify() — the `createClient` test seam —
// for every path that reaches it: setUser, a setUser queued before init, the
// options.tracking.user seed, and the Faro-shaped shim.

const USER_ID = '64f0c0ffee0000000000abcd'

const WHOLE_USER = {
  id: USER_ID,
  _id: USER_ID,
  email: 'nino@example.ge',
  name: 'Nino Beridze',
  username: 'ninob',
  plan: 'pro',
  avatar: 'https://cdn.example/a.png',
  organizations: [{ id: 'org1', name: 'Acme' }],
  preferences: { lang: 'ka' }
}

const fakeClient = () => ({
  state: { activate: sinon.stub() },
  setContext: sinon.stub(),
  capture: sinon.stub(),
  captureError: sinon.stub(),
  captureMessage: sinon.stub(),
  addMeasurement: sinon.stub(),
  identify: sinon.stub(),
  setTag: sinon.stub(),
  flush: sinon.stub(),
  shutdown: sinon.stub(),
  sessionId: 'sess-fake'
})

const setup = async (svc = new TrackingService({})) => {
  const client = fakeClient()
  const runtimeConfig = { ...svc._buildRuntimeConfig(), transport: async () => ({ ok: true }) }
  await svc._setupAnalyzingClient(runtimeConfig, { createClient: () => client })
  return { svc, client }
}

const identifyArgs = (client) => client.identify.getCalls().map((c) => c.args[0])

test('setUser hands identify() the user id and plan only', async (t) => {
  const { svc, client } = await setup()
  svc.setUser(WHOLE_USER)
  t.deepEqual(identifyArgs(client), [{ userId: USER_ID, traits: { plan: 'pro' } }], 'id + plan, nothing else')
  t.notOk(JSON.stringify(identifyArgs(client)).includes('nino@example.ge'), 'no e-mail')
  t.notOk(JSON.stringify(identifyArgs(client)).includes('Nino Beridze'), 'no name')
  t.end()
})

test('a user without an id is anonymous — the user id never falls back to the e-mail', async (t) => {
  const { svc, client } = await setup()
  svc.setUser({ email: 'nino@example.ge', name: 'Nino Beridze', plan: 'pro' })
  t.deepEqual(identifyArgs(client), [null], 'identify(null), never userId = e-mail')
  t.end()
})

test('_id serves when id is absent; an e-mail-shaped id is refused', async (t) => {
  const { svc, client } = await setup()
  svc.setUser({ _id: USER_ID, email: 'nino@example.ge' })
  svc.setUser({ id: 'nino@example.ge', plan: 'pro' })
  svc.setUser({ id: 42 })
  t.deepEqual(identifyArgs(client), [
    { userId: USER_ID, traits: {} },
    null,
    { userId: '42', traits: {} }
  ])
  t.end()
})

test('a setUser queued before init carries only the allowlist when it flushes', async (t) => {
  const svc = new TrackingService({})
  svc.setUser({ ...WHOLE_USER, plan: 'team' })
  const { client } = await setup(svc)
  t.deepEqual(identifyArgs(client), [{ userId: USER_ID, traits: { plan: 'team' } }])
  t.end()
})

test('the options.tracking.user seed is allowlisted too', async (t) => {
  const svc = new TrackingService({ options: { tracking: { user: { id: USER_ID, email: 'nino@example.ge' } } } })
  const { client } = await setup(svc)
  t.deepEqual(identifyArgs(client), [{ userId: USER_ID, traits: {} }])
  t.end()
})

test('the Faro-shaped shim (getClient().api.setUser) picks the same allowlist', async (t) => {
  const { svc, client } = await setup()
  svc.getClient().api.setUser({ id: 'u_2', email: 'x@y.ge', name: 'X', plan: 'pro' })
  svc.getClient().api.setUser({ email: 'x@y.ge' })
  svc.clearUser()
  t.deepEqual(identifyArgs(client), [{ userId: 'u_2', traits: { plan: 'pro' } }, null, null])
  t.end()
})
