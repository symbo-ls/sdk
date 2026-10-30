import test from 'tape'
import sinon from 'sinon'
import { PublicBookingService } from '../../PublicBookingService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// PublicBookingService (service name `publicBookings`) — the ANONYMOUS public
// booking intake of a workspace that opted in (server
// settings.publicBookings): GET /core/bookings/public/services and
// POST /core/bookings/public/request. A published site reaches both
// declaratively through the `publicBookings` dispatcher route (SITES-4).

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new PublicBookingService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}
const WS_KEY = 'ws_abc'
const WS_ID = '6abf753bb2ad7ff22fd6954b'
const SERVICE_ID = '6a9ccc7099101e69014dfe0a'
const METHODS = ['listPublicBookingServices', 'requestPublicBooking']

// A ready service whose session is SIGNED IN: the token manager would hand out
// a bearer token to any call that asked for one.
const signedInService = () => {
  const svc = new PublicBookingService()
  svc._apiUrl = 'https://api.test'
  svc._setReady()
  svc._tokenManager = {
    ensureValidToken: sinon.stub().resolves('tok'),
    getAuthHeader: sinon.stub().returns('Bearer tok')
  }
  return svc
}
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const headersOf = (call) => call.args[1]?.headers || {}

test('listPublicBookingServices GETs the services of a ws_ key', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ services: [] })
  const out = await svc.listPublicBookingServices(WS_KEY)
  t.deepEqual(stub.firstCall.args, [
    'listPublicBookingServices',
    '/bookings/public/services?workspace=ws_abc'
  ])
  t.deepEqual(out, { services: [] }, 'the unwrapped data as the server sent it')
  sandbox.restore()
  t.end()
})

test('listPublicBookingServices: an _id passes as is; reserved characters are encoded', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ services: [] })
  await svc.listPublicBookingServices(WS_ID)
  t.equal(stub.firstCall.args[1], `/bookings/public/services?workspace=${WS_ID}`)
  await svc.listPublicBookingServices('ws a/b&c=d#e')
  t.equal(
    stub.secondCall.args[1],
    '/bookings/public/services?workspace=ws%20a%2Fb%26c%3Dd%23e',
    'a handle can never add a second query key or a path segment'
  )
  sandbox.restore()
  t.end()
})

test('requestPublicBooking POSTs the body exactly as the caller built it', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ number: 'BKG-0001' })
  const body = {
    workspace: WS_KEY,
    name: 'Nino',
    email: 'nino@example.com',
    service: SERVICE_ID,
    mode: 'office',
    window: 'morning',
    message: 'Two people',
    context: { page: '/book', lang: 'ka' },
    website: ''
  }
  const before = JSON.parse(JSON.stringify(body))
  const out = await svc.requestPublicBooking(body)
  t.deepEqual(stub.firstCall.args, [
    'requestPublicBooking',
    '/bookings/public/request',
    { method: 'POST', body: before }
  ])
  t.deepEqual(body, before, 'the caller object is not changed')
  t.deepEqual(out, { number: 'BKG-0001' })
  sandbox.restore()
  t.end()
})

test('both methods refuse a missing workspace before any request', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const cases = [
    () => svc.listPublicBookingServices(),
    () => svc.listPublicBookingServices(''),
    () => svc.listPublicBookingServices('   '),
    () => svc.requestPublicBooking(),
    () => svc.requestPublicBooking({ name: 'Nino', email: 'nino@example.com' }),
    () => svc.requestPublicBooking({ workspace: '', name: 'Nino' })
  ]
  for (const fn of cases) t.throws(fn, /workspace is required/)
  t.throws(
    () => svc.listPublicBookingServices({ workspace: WS_KEY }),
    /workspace must be a string/,
    'an object is refused, never sent as "[object Object]"'
  )
  t.throws(
    () => svc.requestPublicBooking({ workspace: 42, name: 'Nino' }),
    /workspace must be a string/
  )
  t.equal(stub.callCount, 0, 'no request left the SDK')
  sandbox.restore()
  t.end()
})

test('both methods are anonymous (no-init set) and proxied at the top level', t => {
  const base = new BaseService()
  for (const m of METHODS) {
    t.equal(base._requiresInit(m), false, `${m} needs no session`)
    t.equal(SERVICE_METHODS[m], 'publicBookings', `${m} → publicBookings`)
  }
  t.equal(base._requiresInit('createBooking'), true, 'control: a member method still needs the session')
  t.end()
})

test('a signed-in browser sends no Authorization: the session is never read for these calls', async t => {
  const svc = signedInService()
  const fetchStub = sinon.stub(globalThis, 'fetch')
  try {
    fetchStub.onFirstCall().resolves(json(200, { success: true, data: { services: [] } }))
    fetchStub.onSecondCall().resolves(json(200, { success: true, data: { number: 'BKG-0002' } }))

    const listed = await svc.listPublicBookingServices(WS_KEY)
    t.deepEqual(listed, { services: [] })
    const [listUrl, listInit] = fetchStub.firstCall.args
    t.equal(listUrl, 'https://api.test/core/bookings/public/services?workspace=ws_abc')
    t.equal(listInit.method, 'GET')
    t.notOk('Authorization' in headersOf(fetchStub.firstCall), 'no bearer token on the read')
    t.notOk(
      'Content-Type' in headersOf(fetchStub.firstCall),
      'a bodiless read sends no Content-Type (a CORS simple request, no preflight)'
    )

    const filed = await svc.requestPublicBooking({ workspace: WS_KEY, name: 'Nino', phone: '+995555000000' })
    t.deepEqual(filed, { number: 'BKG-0002' })
    const [postUrl, postInit] = fetchStub.secondCall.args
    t.equal(postUrl, 'https://api.test/core/bookings/public/request')
    t.equal(postInit.method, 'POST')
    t.deepEqual(JSON.parse(postInit.body), { workspace: WS_KEY, name: 'Nino', phone: '+995555000000' })
    t.equal(headersOf(fetchStub.secondCall)['Content-Type'], 'application/json')
    t.notOk('Authorization' in headersOf(fetchStub.secondCall), 'no bearer token on the request')

    t.equal(svc._tokenManager.ensureValidToken.callCount, 0, 'the session was not refreshed')
    t.equal(svc._tokenManager.getAuthHeader.callCount, 0, 'the session token was not read')
  } finally {
    fetchStub.restore()
  }
  t.end()
})

test('a server refusal reaches the caller as Error(<code>) with its status', async t => {
  const svc = signedInService()
  const fetchStub = sinon.stub(globalThis, 'fetch')
  try {
    fetchStub.onFirstCall().resolves(json(403, { error: 'origin_forbidden' }))
    fetchStub.onSecondCall().resolves(json(404, { error: 'not_found' }))
    fetchStub.onThirdCall().resolves(json(400, { error: 'contact_required' }))

    const forbidden = await svc
      .requestPublicBooking({ workspace: WS_KEY, name: 'Nino', email: 'nino@example.com' })
      .then(() => null, (err) => err)
    t.ok(forbidden instanceof Error, 'rejects')
    t.equal(forbidden.message, 'origin_forbidden', 'the server code is the message')
    t.equal(forbidden.status, 403)
    t.deepEqual(forbidden.cause, { error: 'origin_forbidden' }, 'the body rides along as cause')

    const missing = await svc.listPublicBookingServices('ws_gone').then(() => null, (err) => err)
    t.equal(missing.message, 'not_found')
    t.equal(missing.status, 404)

    const invalid = await svc
      .requestPublicBooking({ workspace: WS_KEY, name: 'Nino' })
      .then(() => null, (err) => err)
    t.equal(invalid.message, 'contact_required')
    t.equal(invalid.status, 400)
  } finally {
    fetchStub.restore()
  }
  t.end()
})

test('the request POST is never retried: a resend could file a second booking', async t => {
  const svc = signedInService()
  const fetchStub = sinon.stub(globalThis, 'fetch').rejects(new TypeError('Failed to fetch'))
  try {
    const err = await svc
      .requestPublicBooking({ workspace: WS_KEY, name: 'Nino', email: 'nino@example.com' })
      .then(() => null, (e) => e)
    t.equal(err?.code, 'NETWORK_UNREACHABLE', 'the network failure is reported')
    t.equal(fetchStub.callCount, 1, 'exactly one attempt')
  } finally {
    fetchStub.restore()
  }
  t.end()
})

test('EntityDispatcher: publicBookings list from the declarative select pack and the imperative forms', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ services: [] })
  const asked = []
  const execute = createEntityDispatcher({
    getService: (name) => {
      asked.push(name)
      return svc
    }
  })
  // fetch: { from: 'publicBookings', params: { workspace } } → the sdk
  // adapter's select pack: { filter, params, single, limit, …, ...params }
  await execute('publicBookings', 'list', {
    filter: { workspace: WS_KEY },
    params: { workspace: WS_KEY },
    single: undefined,
    limit: undefined,
    workspace: WS_KEY
  })
  t.deepEqual(stub.lastCall.args, ['listPublicBookingServices', '/bookings/public/services?workspace=ws_abc'])
  await execute('publicBookings', 'list', { workspaceId: WS_ID })
  t.equal(stub.lastCall.args[1], `/bookings/public/services?workspace=${WS_ID}`, 'workspaceId alias')
  await execute('publicBookings', 'list', 'ws_str')
  t.equal(stub.lastCall.args[1], '/bookings/public/services?workspace=ws_str', 'a bare handle')
  t.ok(asked.every((n) => n === 'publicBookings'), 'routed to the publicBookings service')
  sandbox.restore()
  t.end()
})

test('EntityDispatcher: publicBookings create / submit build ONE request body', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ number: 'BKG-0003' })
  const execute = createEntityDispatcher({ getService: () => svc })
  const bodyOf = () => stub.lastCall.args[2].body
  const form = { name: 'Nino', email: 'nino@example.com', service: SERVICE_ID, window: 'morning', website: '' }

  // fetch: { method: 'insert', from: 'publicBookings', on: 'submit',
  //          params: { workspace, context } } → the sdk adapter's insert
  // pack: { payload: form, data: form, ...params }
  const out = await execute('publicBookings', 'create', {
    payload: form,
    data: form,
    workspace: WS_KEY,
    context: { page: '/book', lang: 'ka' }
  })
  t.deepEqual(out, { number: 'BKG-0003' })
  t.equal(stub.lastCall.args[0], 'requestPublicBooking')
  t.equal(stub.lastCall.args[1], '/bookings/public/request')
  t.equal(stub.lastCall.args[2].method, 'POST')
  t.deepEqual(
    bodyOf(),
    { ...form, context: { page: '/book', lang: 'ka' }, workspace: WS_KEY },
    'the page params and the form fields, flat; no pack keys'
  )

  // A form field overrides a page param of the same name (the visitor's pick
  // wins over the page default); the page's workspace wins over a form field.
  await execute('publicBookings', 'create', {
    data: { ...form, kind: 'tour', workspace: 'ws_from_form' },
    kind: 'tasting',
    workspace: WS_KEY
  })
  t.equal(bodyOf().kind, 'tour')
  t.equal(bodyOf().workspace, WS_KEY)

  // The workspace only inside the form data.
  await execute('publicBookings', 'submit', { data: { ...form, workspace: WS_KEY } })
  t.equal(stub.lastCall.args[0], 'requestPublicBooking', 'submit is the same method')
  t.equal(bodyOf().workspace, WS_KEY)

  // The imperative flat bag; workspaceId as an alias.
  await execute('publicBookings', 'create', { workspaceId: WS_ID, name: 'Nino', phone: '+995555000000' })
  t.deepEqual(bodyOf(), { name: 'Nino', phone: '+995555000000', workspace: WS_ID })
  for (const k of ['payload', 'data', 'workspaceId']) t.notOk(k in bodyOf(), `no "${k}" key in the body`)

  // No workspace anywhere → the method refuses before a request.
  const before = stub.callCount
  t.throws(() => execute('publicBookings', 'create', { data: form }), /workspace is required/)
  t.equal(stub.callCount, before, 'nothing sent')
  sandbox.restore()
  t.end()
})
