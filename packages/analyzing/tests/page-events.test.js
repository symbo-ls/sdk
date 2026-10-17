// window.SymbolsAnalytics — page-side custom events on the public tracker
// (Shaker program CONTRACT §8). Page code is untrusted input: names are an
// allowlist, data is a capped flat object without personal keys, volume is
// capped per page, and the event rides the tracker's own client (same session,
// same same-origin ingest).

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  PAGE_EVENT_NAMES,
  PAGE_EVENT_LIMITS,
  sanitizePageEventData,
  installPageHandle
} from '../src/pageEvents.js'
import { createAnalyzing } from '../src/client.js'
import { bootAnalyzing, _resetBootForTests } from '../src/boot.js'

const fakeClient = () => {
  const calls = []
  return { calls, capture: (...args) => calls.push(args) }
}

test('the allowlist is exactly the four e-commerce events', () => {
  assert.deepEqual([...PAGE_EVENT_NAMES], ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'])
  assert.ok(Object.isFrozen(PAGE_EVENT_NAMES))
})

test('sanitize: flat scalars kept, long strings cut, everything else dropped', () => {
  const out = sanitizePageEventData({
    orderNumber: 'SH-2026-0001',
    total: 123.5,
    paid: true,
    coupon: null,
    note: 'x'.repeat(500),
    nested: { a: 1 },
    list: [1, 2],
    fn: () => 1,
    nan: Number.NaN,
    inf: Number.POSITIVE_INFINITY,
    '1bad': 1,
    'a-b': 1,
    $where: 1,
    ['k'.repeat(41)]: 1
  })
  assert.deepEqual(Object.keys(out).sort(), ['coupon', 'note', 'orderNumber', 'paid', 'total'])
  assert.equal(out.note.length, PAGE_EVENT_LIMITS.maxStringLength)
  assert.deepEqual(sanitizePageEventData(undefined), {})
  assert.deepEqual(sanitizePageEventData(null), {})
  assert.equal(sanitizePageEventData('purchase'), null)
  assert.equal(sanitizePageEventData([1]), null)
})

test('sanitize: personal-data keys are dropped, never sent', () => {
  const out = sanitizePageEventData({
    email: 'a@b.ge',
    customerEmail: 'a@b.ge',
    phone: '+995555',
    contactPhone: '+995555',
    contactName: 'Nino',
    name: 'Nino',
    fullName: 'Nino B',
    firstName: 'Nino',
    lastName: 'B',
    customerName: 'Nino',
    address: 'Vake',
    street: 'Chavchavadze 34',
    password: 'x',
    token: 'x',
    cardNumber: '4111',
    birthDate: '2000-01-01',
    productName: 'Negroni kit',
    sku: 'SH-1',
    currency: 'GEL'
  })
  assert.deepEqual(out, { productName: 'Negroni kit', sku: 'SH-1', currency: 'GEL' })
})

test('sanitize: more than 16 keys or more than 2 KB refuses the event', () => {
  const many = {}
  for (let i = 0; i < 17; i++) many[`k${i}`] = i
  assert.equal(sanitizePageEventData(many), null)
  const big = {}
  for (let i = 0; i < 12; i++) big[`k${i}`] = 'x'.repeat(200)
  assert.equal(sanitizePageEventData(big), null, `${JSON.stringify(big).length} bytes > 2048`)
})

test('capture: (name, data) and the client shape (level, name, data); level always info', () => {
  const client = fakeClient()
  const win = {}
  const h = installPageHandle(client, { win })
  assert.equal(win.SymbolsAnalytics, h)
  assert.ok(Object.isFrozen(h))
  assert.equal(h.version, 1)
  assert.equal(h.capture('view_item', { productId: 'p1', price: 70, currency: 'GEL' }), true)
  assert.equal(h.capture('info', 'add_to_cart', { productId: 'p1', quantity: 2 }), true)
  assert.equal(h.capture('error', 'purchase', { orderNumber: 'SH-1', total: 140 }), true)
  assert.equal(h.capture('begin_checkout'), true, 'no data is fine')
  assert.deepEqual(client.calls, [
    ['info', 'view_item', { productId: 'p1', price: 70, currency: 'GEL' }],
    ['info', 'add_to_cart', { productId: 'p1', quantity: 2 }],
    ['info', 'purchase', { orderNumber: 'SH-1', total: 140 }],
    ['info', 'begin_checkout', {}]
  ])
})

test('capture: unknown names, the tracker’s own page_view and bad data are refused', () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  assert.equal(h.capture('page_view', {}), false, 'page_view belongs to the tracker')
  assert.equal(h.capture('click', {}), false)
  assert.equal(h.capture('info', 'refund', {}), false)
  assert.equal(h.capture('purchase', 'not an object'), false)
  assert.equal(h.capture(42), false)
  assert.equal(client.calls.length, 0)
})

test(`capture: at most ${PAGE_EVENT_LIMITS.maxEventsPerPage} accepted events per page`, () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  let ok = 0
  for (let i = 0; i < PAGE_EVENT_LIMITS.maxEventsPerPage + 20; i++) {
    if (h.capture('view_item', { i })) ok += 1
  }
  assert.equal(ok, PAGE_EVENT_LIMITS.maxEventsPerPage)
  assert.equal(client.calls.length, PAGE_EVENT_LIMITS.maxEventsPerPage)
})

test('a throwing client never throws into the page', () => {
  const h = installPageHandle({ capture: () => { throw new Error('boom') } }, { win: {} })
  assert.equal(h.capture('purchase', { orderNumber: 'SH-1' }), false)
})

test('install drains the track.js stub queue once, in order, at most 50 calls', () => {
  const client = fakeClient()
  const q = [
    ['view_item', { productId: 'p1' }],
    ['bogus', {}],
    ['info', 'purchase', { orderNumber: 'SH-9', total: 10 }],
    'not-an-args-array'
  ]
  for (let i = 0; i < 60; i++) q.push(['add_to_cart', { i }])
  const win = { SymbolsAnalytics: { q, capture: () => true } }
  const h = installPageHandle(client, { win })
  assert.equal(win.SymbolsAnalytics, h, 'the stub is replaced by the real handle')
  assert.deepEqual(client.calls[0], ['info', 'view_item', { productId: 'p1' }])
  assert.deepEqual(client.calls[1], ['info', 'purchase', { orderNumber: 'SH-9', total: 10 }])
  // 50 queued calls read: 2 valid above + 46 add_to_cart (bogus + non-array dropped).
  assert.equal(client.calls.length, 48)
})

test('install needs a window and a client', () => {
  globalThis.window = undefined // a non-browser host (SSR, a worker)
  assert.equal(installPageHandle(fakeClient()), null)
  assert.equal(installPageHandle(null, { win: {} }), null)
  assert.equal(installPageHandle({}, { win: {} }), null, 'a client without capture')
})

test('end to end on the REAL client: the event rides the session to the transport', async () => {
  const sent = []
  const client = createAnalyzing({
    appKey: 'shaker.ge',
    mode: 'public',
    kind: 'project',
    visitor: false,
    transport: (envelope) => {
      sent.push(envelope)
      return { ok: true }
    },
    batchMs: 5,
    maxBatch: 1
  })
  client.state.activate(null)
  const h = installPageHandle(client, { win: {} })
  assert.equal(
    h.capture('purchase', {
      orderNumber: 'SH-2026-0001',
      total: 140,
      currency: 'GEL',
      paymentMode: 'test',
      contactPhone: '+995555000000'
    }),
    true
  )
  await new Promise((r) => setTimeout(r, 30))
  const events = sent.flatMap((e) => e.events || [])
  const purchase = events.find((e) => e.message === 'purchase')
  assert.ok(purchase, 'the purchase event reached the transport')
  assert.equal(purchase.type, 'manual')
  assert.equal(purchase.level, 'info')
  assert.deepEqual(purchase.data, {
    orderNumber: 'SH-2026-0001',
    total: 140,
    currency: 'GEL',
    paymentMode: 'test'
  })
  const env = sent.find((e) => (e.events || []).includes(purchase))
  assert.equal(env.session.id, client.sessionId, 'same session as every other tracker event')
})

// ── bootAnalyzing installs the handle on a published page ───────────────────

const _origs = {}
beforeEach(() => {
  _resetBootForTests()
  for (const k of ['window', 'document', 'location', 'history']) _origs[k] = globalThis[k]
  globalThis.window = { addEventListener () {} }
  globalThis.document = { title: 'Shaker', referrer: '' }
  globalThis.location = { pathname: '/', search: '', host: 'shaker.ge', href: 'https://shaker.ge/' }
  globalThis.history = { pushState () {}, replaceState () {} }
})
afterEach(() => {
  for (const k of Object.keys(_origs)) globalThis[k] = _origs[k]
})

test('bootAnalyzing installs window.SymbolsAnalytics and drains the stub queue into the client', () => {
  globalThis.window.SymbolsAnalytics = { q: [['view_item', { productId: 'p1' }]], capture () {} }
  const client = bootAnalyzing({ projectId: 'shaker.ge', projectEnv: 'production' })
  const h = globalThis.window.SymbolsAnalytics
  assert.equal(typeof h.capture, 'function')
  assert.equal(h.version, 1)
  assert.equal(Array.isArray(h.q), false, 'the stub queue object is gone')
  const seen = []
  const original = client.capture
  client.capture = (...args) => {
    seen.push(args)
    return original(...args)
  }
  assert.equal(h.capture('add_to_cart', { productId: 'p1', quantity: 1 }), true)
  assert.deepEqual(seen, [['info', 'add_to_cart', { productId: 'p1', quantity: 1 }]])
})
