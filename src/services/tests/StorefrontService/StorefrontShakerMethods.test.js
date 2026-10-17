import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Shaker program (CONTRACT §7, 2026-10-17) — the storefront shopper surface,
// kits, CMS, events and the owner checkout/payment settings. Each wrapper is
// pinned to its literal route (the server's drift analyzer reads the same
// literals), its HTTP method, its body, and its identity rule: a storefront-
// CUSTOMER token rides as a one-off Authorization header, or nothing does.

const sandbox = sinon.createSandbox()
const WS = '6aadb5e0d03299e6a0719dcc'
const TOKEN = 'customer-token-1'

const makeService = () => {
  const svc = new StorefrontService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  const call = sandbox.stub(svc, '_call').resolves({})
  return { svc, call }
}

const done = (t) => {
  sandbox.restore()
  t.end()
}

test('resolveStorefront: GET /storefront/resolve with an optional ?host=', async (t) => {
  const { svc, call } = makeService()
  await svc.resolveStorefront('shaker.ge')
  t.equal(call.firstCall.args[0], 'resolveStorefront')
  t.equal(call.firstCall.args[1], '/storefront/resolve?host=shaker.ge')
  await svc.resolveStorefront()
  t.equal(call.secondCall.args[1], '/storefront/resolve', 'no host → the server reads the Origin')
  done(t)
})

test('kits + CMS reads: shortcuts over the ONE /collections/:collection literal, declared filters on the query string', async (t) => {
  const { svc, call } = makeService()
  await svc.listStorefrontBundles(WS)
  t.equal(call.getCall(0).args[0], 'listStorefrontCollection', 'same methodName → same identity rule')
  t.equal(call.getCall(0).args[1], `/storefront/${WS}/collections/bundles`)
  await svc.listStorefrontCmsTypes(WS, { limit: 5 })
  t.equal(call.getCall(1).args[1], `/storefront/${WS}/collections/cmsTypes?limit=5`)
  await svc.listStorefrontCmsEntries(WS, { type: 'blog', slug: 'negroni' })
  t.equal(call.getCall(2).args[1], `/storefront/${WS}/collections/cmsEntries?type=blog&slug=negroni`)
  await svc.listStorefrontCollection(WS, 'cmsEntries', { type: 'blog', page: 2 })
  t.equal(
    call.getCall(3).args[1],
    `/storefront/${WS}/collections/cmsEntries?type=blog&page=2`,
    'the generic reader forwards extra keys as filters'
  )
  t.throws(() => svc.listStorefrontBundles(), /workspaceId/)
  done(t)
})

test('listStorefrontCmsEntries passes omit + v (a cache-buster the server ignores) and limit up to the server cap', async (t) => {
  const { svc, call } = makeService()
  await svc.listStorefrontCmsEntries(WS, { type: 'cocktail', limit: 500, omit: 'body', v: 1729 })
  t.equal(call.getCall(0).args[0], 'listStorefrontCollection', 'same identity rule as every collection read')
  t.equal(
    call.getCall(0).args[1],
    `/storefront/${WS}/collections/cmsEntries?type=cocktail&omit=body&v=1729&limit=500`
  )
  await svc.listStorefrontCmsEntries(WS, { slug: 'negroni' })
  t.equal(call.getCall(1).args[1], `/storefront/${WS}/collections/cmsEntries?slug=negroni`, 'absent options stay off the URL')
  done(t)
})

test('listStorefrontProducts / listStorefrontJobs keep their exact paths after the qs rename', async (t) => {
  const { svc, call } = makeService()
  await svc.listStorefrontProducts(WS, { limit: 300 })
  t.equal(call.getCall(0).args[1], `/storefront/${WS}/products?limit=300`)
  await svc.listStorefrontJobs(WS)
  t.equal(call.getCall(1).args[1], `/storefront/${WS}/jobs`)
  done(t)
})

test('placeStorefrontOrder: guest → NO Authorization header; signed-in → the customer token only', async (t) => {
  const { svc, call } = makeService()
  const order = {
    items: [{ productId: 'p1', quantity: 2, group: 'k:negroni-night' }],
    contact: { name: 'Nino', phone: '+995555000000' },
    fulfilment: { mode: 'pickup', day: '2026-10-18', slot: '12-15' },
    paymentMethod: 'online',
    lang: 'ka'
  }
  await svc.placeStorefrontOrder(WS, order)
  const [name, path, init] = call.firstCall.args
  t.equal(name, 'placeStorefrontOrder')
  t.equal(path, `/storefront/${WS}/orders`)
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, order, 'the order body is sent as given — the server prices it')
  t.equal(init.headers, undefined, 'a guest order carries no Authorization at all')

  await svc.placeStorefrontOrder(WS, order, { customerToken: TOKEN })
  t.deepEqual(call.secondCall.args[2].headers, { Authorization: `Bearer ${TOKEN}` })
  t.throws(() => svc.placeStorefrontOrder(WS, null), /order is required/)
  done(t)
})

test('guest status + Keepz test pay: the order key rides X-Storefront-Order-Key, never the URL', async (t) => {
  const { svc, call } = makeService()
  await svc.getStorefrontOrderStatus(WS, 'o 1', 'key/1')
  t.equal(call.firstCall.args[1], `/storefront/${WS}/orders/o%201/status`, 'no ?key= in the URL')
  t.deepEqual(call.firstCall.args[2].headers, { 'X-Storefront-Order-Key': 'key/1' })
  t.throws(() => svc.getStorefrontOrderStatus(WS, 'o1'), /key or customerToken/)

  await svc.getStorefrontOrderStatus(WS, 'o1', null, { customerToken: TOKEN })
  t.deepEqual(
    call.secondCall.args[2].headers,
    { Authorization: `Bearer ${TOKEN}` },
    'a customer reads its own order with its token only'
  )

  await svc.payStorefrontOrderTest(WS, 'o1', { key: 'k', result: 'success', method: 'apple' })
  const [name, path, init] = call.thirdCall.args
  t.equal(name, 'payStorefrontOrderTest')
  t.equal(path, `/storefront/${WS}/orders/o1/pay/test`)
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, { result: 'success', method: 'apple' }, 'the key is not in the body')
  t.deepEqual(init.headers, { 'X-Storefront-Order-Key': 'k' })

  await svc.payStorefrontOrderTest(WS, 'o1', { result: 'fail' }, { customerToken: TOKEN })
  t.deepEqual(call.getCall(3).args[2].headers, { Authorization: `Bearer ${TOKEN}` })
  t.throws(() => svc.payStorefrontOrderTest(WS, 'o1', { result: 'maybe' }), /success' or 'fail/)
  done(t)
})

test('customer orders, cart, addresses, profile: token required, literal routes, right verbs', async (t) => {
  const { svc, call } = makeService()
  const auth = { Authorization: `Bearer ${TOKEN}` }
  const cases = [
    [() => svc.listStorefrontOrders(WS, TOKEN, { limit: 10 }), 'listStorefrontOrders', `/storefront/${WS}/orders?limit=10`, undefined],
    [() => svc.getStorefrontOrder(WS, 'o1', TOKEN), 'getStorefrontOrder', `/storefront/${WS}/orders/o1`, undefined],
    [() => svc.getStorefrontCart(WS, TOKEN), 'getStorefrontCart', `/storefront/${WS}/cart`, undefined],
    [() => svc.replaceStorefrontCart(WS, [{ productId: 'p1', quantity: 1 }], TOKEN), 'replaceStorefrontCart', `/storefront/${WS}/cart`, 'PUT'],
    [() => svc.clearStorefrontCart(WS, TOKEN), 'clearStorefrontCart', `/storefront/${WS}/cart`, 'DELETE'],
    [() => svc.listStorefrontAddresses(WS, TOKEN), 'listStorefrontAddresses', `/storefront/${WS}/account/addresses`, undefined],
    [() => svc.createStorefrontAddress(WS, { deliveryCityId: 'c1', street: 'x' }, TOKEN), 'createStorefrontAddress', `/storefront/${WS}/account/addresses`, 'POST'],
    [() => svc.updateStorefrontAddress(WS, 'a1', { flat: '3' }, TOKEN), 'updateStorefrontAddress', `/storefront/${WS}/account/addresses/a1`, 'PATCH'],
    [() => svc.deleteStorefrontAddress(WS, 'a1', TOKEN), 'deleteStorefrontAddress', `/storefront/${WS}/account/addresses/a1`, 'DELETE'],
    [() => svc.updateStorefrontCustomerMe(WS, { fullName: 'N' }, TOKEN), 'updateStorefrontCustomerMe', `/storefront/${WS}/auth/me`, 'PATCH'],
    [() => svc.changeStorefrontCustomerPassword(WS, { currentPassword: 'a', newPassword: 'b' }, TOKEN), 'changeStorefrontCustomerPassword', `/storefront/${WS}/auth/change-password`, 'POST'],
    [() => svc.deleteStorefrontCustomerAccount(WS, { currentPassword: 'a' }, TOKEN), 'deleteStorefrontCustomerAccount', `/storefront/${WS}/auth/me`, 'DELETE'],
    [() => svc.listStorefrontAppointments(WS, TOKEN), 'listStorefrontAppointments', `/storefront/${WS}/account/appointments`, undefined],
    [() => svc.getStorefrontBalances(WS, TOKEN), 'getStorefrontBalances', `/storefront/${WS}/account/balances`, undefined],
    [() => svc.listStorefrontLoyalty(WS, TOKEN, { skip: 20 }), 'listStorefrontLoyalty', `/storefront/${WS}/account/loyalty?skip=20`, undefined]
  ]
  for (let i = 0; i < cases.length; i++) {
    const [run, name, path, method] = cases[i]
    await run()
    const args = call.getCall(i).args
    t.equal(args[0], name, `${name}: methodName`)
    t.equal(args[1], path, `${name}: path`)
    t.equal(args[2].method, method, `${name}: verb`)
    t.deepEqual(args[2].headers, auth, `${name}: the customer token, nothing else`)
  }
  t.deepEqual(call.getCall(3).args[2].body, { items: [{ productId: 'p1', quantity: 1 }] })
  t.deepEqual(call.getCall(10).args[2].body, { currentPassword: 'a', newPassword: 'b' })
  t.throws(() => svc.getStorefrontCart(WS), /customerToken/)
  t.throws(() => svc.replaceStorefrontCart(WS, 'x', TOKEN), /items must be an array/)
  t.throws(() => svc.deleteStorefrontAddress(WS, '', TOKEN), /id is required/)
  done(t)
})

test('owner settings: checkout + payments ride the platform session (no customer header)', async (t) => {
  const { svc, call } = makeService()
  await svc.getStorefrontCheckoutSettings(WS)
  await svc.setStorefrontCheckoutSettings(WS, { guest: true })
  await svc.getStorefrontPaymentSettings(WS)
  await svc.setStorefrontPaymentSettings(WS, { keepz: { mode: 'test' } })
  t.deepEqual(
    call.getCalls().map((c) => [c.args[0], c.args[1], c.args[2].method]),
    [
      ['getStorefrontCheckoutSettings', `/storefront/${WS}/settings/checkout`, 'GET'],
      ['setStorefrontCheckoutSettings', `/storefront/${WS}/settings/checkout`, 'PUT'],
      ['getStorefrontPaymentSettings', `/storefront/${WS}/settings/payments`, 'GET'],
      ['setStorefrontPaymentSettings', `/storefront/${WS}/settings/payments`, 'PUT']
    ]
  )
  t.deepEqual(call.getCall(3).args[2].body, { keepz: { mode: 'test' } })
  t.equal(call.getCall(1).args[2].headers, undefined)
  t.throws(() => svc.setStorefrontCheckoutSettings(WS), /settings is required/)
  done(t)
})

test('public checkout read + staff cash confirm (CORE-A routes)', async (t) => {
  const { svc, call } = makeService()
  await svc.getStorefrontCheckout(WS)
  t.equal(call.firstCall.args[0], 'getStorefrontCheckout')
  t.equal(call.firstCall.args[1], `/storefront/${WS}/checkout`)
  await svc.confirmStorefrontCashPayment(WS, 'o1', { reference: 'CASH-1' })
  const [name, path, init] = call.secondCall.args
  t.equal(name, 'confirmStorefrontCashPayment')
  t.equal(path, `/storefront/${WS}/orders/o1/payments/confirm`)
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, { reference: 'CASH-1', note: undefined })
  t.equal(init.headers, undefined, 'staff action rides the platform session, no customer header')
  t.throws(() => svc.confirmStorefrontCashPayment(WS), /id is required/)
  done(t)
})

test('identity rule: every shopper method skips the platform session; owner settings do not', (t) => {
  const svc = new BaseService({})
  const shopper = [
    'resolveStorefront', 'listStorefrontCollection', 'getStorefrontCheckout',
    'placeStorefrontOrder', 'getStorefrontOrderStatus', 'payStorefrontOrderTest', 'listStorefrontOrders',
    'getStorefrontOrder', 'getStorefrontCart', 'replaceStorefrontCart', 'clearStorefrontCart',
    'listStorefrontAddresses', 'createStorefrontAddress', 'updateStorefrontAddress', 'deleteStorefrontAddress',
    'updateStorefrontCustomerMe', 'changeStorefrontCustomerPassword', 'deleteStorefrontCustomerAccount',
    'listStorefrontAppointments', 'getStorefrontBalances', 'listStorefrontLoyalty'
  ]
  for (const m of shopper) t.equal(svc._requiresInit(m), false, `${m} never attaches the platform token`)
  for (const m of ['getStorefrontCheckoutSettings', 'setStorefrontCheckoutSettings', 'getStorefrontPaymentSettings', 'setStorefrontPaymentSettings', 'confirmStorefrontCashPayment']) {
    t.equal(svc._requiresInit(m), true, `${m} is an owner write on the platform session`)
  }
  for (const m of [...shopper, 'listStorefrontBundles', 'listStorefrontCmsTypes', 'listStorefrontCmsEntries', 'subscribeStorefrontEvents', 'getStorefrontCheckoutSettings', 'setStorefrontPaymentSettings', 'confirmStorefrontCashPayment']) {
    t.equal(SERVICE_METHODS[m], 'storefront', `${m} is flat-exposed`)
  }
  t.end()
})

// ── the anonymous events stream, through the REAL _sseSubscribe ──────────────

class FakeEventSource {
  constructor (url) {
    this.url = url
    this._listeners = {}
    FakeEventSource.instances.push(this)
  }

  addEventListener (name, fn) {
    (this._listeners[name] = this._listeners[name] || []).push(fn)
  }

  emit (name, evt = {}) {
    for (const fn of this._listeners[name] || []) fn(evt)
  }

  close () {
    this.closed = true
  }
}
FakeEventSource.instances = []
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('subscribeStorefrontEvents: anonymous (no ticket even when signed in), records + deployment frames', async (t) => {
  const realEventSource = global.EventSource
  FakeEventSource.instances = []
  global.EventSource = FakeEventSource
  const svc = new StorefrontService({})
  svc._apiUrl = 'https://api.test'
  svc._initialized = true
  svc._tokenManager = { getAccessToken: () => 'platform-jwt' }
  const mint = sandbox.stub(svc, '_call').resolves({ ticket: 'tkt' })

  const frames = []
  const unsubscribe = svc.subscribeStorefrontEvents(WS, (f) => frames.push(f))
  await tick()

  t.equal(FakeEventSource.instances.length, 1)
  const es = FakeEventSource.instances[0]
  t.equal(es.url, `https://api.test/core/storefront/${WS}/events`, 'no ticket, no token, no filter')
  t.equal(mint.called, false, 'no stream ticket minted for a public stream')

  es.emit('records', { data: JSON.stringify({ collection: 'bundles', at: '2026-10-17T10:00:00.000Z' }) })
  es.emit('deployment', { data: JSON.stringify({ version: '1.2.3', at: '2026-10-17T10:01:00.000Z' }) })
  es.emit('records', { data: 'not json' })
  t.deepEqual(frames, [
    { type: 'records', collection: 'bundles', at: '2026-10-17T10:00:00.000Z' },
    { type: 'deployment', version: '1.2.3', at: '2026-10-17T10:01:00.000Z' }
  ])

  unsubscribe()
  t.equal(es.closed, true, 'unsubscribe closes the stream')
  t.throws(() => svc.subscribeStorefrontEvents(WS), /onEvent/)
  sandbox.restore()
  global.EventSource = realEventSource
  t.end()
})
