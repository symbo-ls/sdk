// The Symbols sign-up funnel on the public page API (fly docs/FUNNEL.md §2,
// lane G2). window.SymbolsAnalytics accepts the funnel stages a CLIENT emits
// (an explicit allowlist, never "any funnel.* string") under the SAME data
// rules as the commerce events; `funnel.alias { from }` links this origin's
// visitor id to the landing's (an opaque id, once per page); and the handle
// exposes this page's own visitor id, read-only, so Fly can send it as
// `acquisition.visitor` and pass it on links as `svid`. Server-truth stages
// (arrived, activated, paid) and the Worker's lead are refused: a page must
// not be able to forge them. Asserts the CONDITION, never absence of error.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import * as pageEvents from '../src/pageEvents.js'
import { installPageHandle, sanitizePageEventData, PAGE_EVENT_NAMES, PAGE_EVENT_LIMITS } from '../src/pageEvents.js'
import { createAnalyzing } from '../src/client.js'
import { bootAnalyzing, _resetBootForTests } from '../src/boot.js'

// What crypto.randomUUID mints — this page's id and the landing's id.
const VID = '3f0c1d2e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
const LANDING_VID = 'b6a3c1f0-1234-4abc-9def-0123456789ab'

const FUNNEL_CLIENT_STAGES = [
  'funnel.ask',
  'funnel.answer',
  'funnel.blueprint',
  'funnel.make_real',
  'funnel.signup',
  'funnel.signup_error',
  'funnel.workspace_ready',
  'funnel.provision_error'
]

// fakeClient() → this page's id is VID; fakeClient(x) → exactly x (even
// undefined — no default-parameter fallback).
const fakeClient = (...args) => {
  const visitorId = args.length ? args[0] : VID
  const calls = []
  return { calls, visitorId, capture: (...a) => calls.push(a) }
}

const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  }
}

test('the funnel allowlist is exactly the client-emitted stages of FUNNEL.md §2, plus funnel.alias', () => {
  assert.deepEqual(
    [...(pageEvents.FUNNEL_EVENT_NAMES || [])],
    FUNNEL_CLIENT_STAGES,
    'FUNNEL_EVENT_NAMES lists the eight client stages, in funnel order'
  )
  assert.ok(Object.isFrozen(pageEvents.FUNNEL_EVENT_NAMES))
  assert.equal(pageEvents.FUNNEL_ALIAS_EVENT, 'funnel.alias')
  assert.deepEqual(
    [...(pageEvents.FUNNEL_SERVER_EVENT_NAMES || [])],
    ['funnel.arrived', 'funnel.activated', 'funnel.paid', 'funnel.lead'],
    'the stages only the server (or the Fly Worker) may record'
  )
  assert.deepEqual(
    [...(pageEvents.PAGE_ACCEPTED_EVENT_NAMES || [])],
    [...PAGE_EVENT_NAMES, ...FUNNEL_CLIENT_STAGES, 'funnel.alias'],
    'commerce + funnel + alias'
  )
  assert.deepEqual(
    [...PAGE_EVENT_NAMES],
    ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
    'the commerce list itself is unchanged'
  )
  const h = installPageHandle(fakeClient(), { win: {} })
  assert.deepEqual([...h.events], [...pageEvents.PAGE_ACCEPTED_EVENT_NAMES], 'the handle lists every accepted name')
})

test('each client funnel stage is captured with its flat data; the level is always info', () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  const data = { surface: 'fly', page: '/pricing', intent: 'crm', latencyMs: 1830, pieces: 4, ok: true }
  for (const name of FUNNEL_CLIENT_STAGES) {
    assert.equal(h.capture(name, data), true, `${name} accepted`)
  }
  assert.equal(h.capture('error', 'funnel.signup_error', { method: 'password', errorCode: 'EMAIL_TAKEN' }), true)
  assert.deepEqual(
    client.calls.map((c) => c[1]),
    [...FUNNEL_CLIENT_STAGES, 'funnel.signup_error']
  )
  assert.deepEqual(client.calls[0], ['info', 'funnel.ask', data])
  assert.deepEqual(client.calls.at(-1), ['info', 'funnel.signup_error', { method: 'password', errorCode: 'EMAIL_TAKEN' }])
})

test('server-truth stages, the Worker lead and any other funnel.* string are refused', () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  for (const name of [
    'funnel.arrived',
    'funnel.activated',
    'funnel.paid',
    'funnel.lead',
    'funnel.',
    'funnel',
    'funnel.Ask',
    'funnel.ask ',
    ' funnel.ask',
    'funnel.ask.x',
    'funnel.visit'
  ]) {
    assert.equal(h.capture(name, { surface: 'fly' }), false, `${JSON.stringify(name)} refused`)
  }
  assert.equal(client.calls.length, 0)
})

test('funnel data obeys the commerce rules: personal keys dropped, nested dropped, strings capped, > 16 keys or > 2 KB refused', () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  assert.equal(
    h.capture('funnel.signup', {
      method: 'google',
      email: 'nino@example.ge',
      name: 'Nino',
      username: 'nino',
      phone: '+995555000000',
      ip: '203.0.113.9',
      ipAddress: '203.0.113.9',
      nested: { plan: 'pro' },
      list: ['a'],
      note: 'x'.repeat(500)
    }),
    true
  )
  const sent = client.calls[0][2]
  assert.deepEqual(Object.keys(sent).sort(), ['method', 'note'])
  assert.equal(sent.note.length, PAGE_EVENT_LIMITS.maxStringLength)

  const many = {}
  for (let i = 0; i < 17; i++) many[`k${i}`] = i
  assert.equal(h.capture('funnel.answer', many), false, '17 keys refuse the event')
  const big = {}
  for (let i = 0; i < 12; i++) big[`k${i}`] = 'x'.repeat(200)
  assert.equal(h.capture('funnel.answer', big), false, '> 2 KB refuses the event')
  assert.equal(h.capture('funnel.ask', 'free text'), false, 'non-object data refuses the event')
  assert.equal(client.calls.length, 1)
})

test('an e-mail-shaped VALUE is dropped under any key — funnel and commerce alike', () => {
  assert.deepEqual(
    sanitizePageEventData({ ref: 'nino@example.ge', note: 'write to a@b.ge please', sku: 'SH-1', surface: 'landing' }),
    { sku: 'SH-1', surface: 'landing' }
  )
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  assert.equal(h.capture('purchase', { orderNumber: 'SH-1', buyer: 'nino@example.ge' }), true)
  assert.deepEqual(client.calls[0][2], { orderNumber: 'SH-1' })
})

test('funnel.alias records the other origin\'s visitor id ONCE, as { from } only', () => {
  const client = fakeClient()
  const h = installPageHandle(client, { win: {} })
  assert.equal(h.capture('funnel.alias', { from: LANDING_VID, surface: 'fly', email: 'a@b.ge' }), true)
  assert.deepEqual(client.calls, [['info', 'funnel.alias', { from: LANDING_VID }]])
  assert.equal(
    h.capture('funnel.alias', { from: 'c0ffee00-1111-4222-8333-444455556666' }),
    false,
    'a second alias on the same page is refused'
  )
  assert.equal(h.capture('funnel.ask', { surface: 'fly' }), true, 'the alias limit does not touch other events')
  assert.equal(client.calls.length, 2)
})

test('funnel.alias refuses a from that is not an opaque id, its own id, and a page without a visitor id', () => {
  for (const from of [
    'nino@example.ge',
    'short',
    'x'.repeat(65),
    'has space 12345',
    'dots.are.not.ids.1234',
    '-leading-dash-123',
    '',
    123456789,
    null,
    undefined,
    {},
    ['b6a3c1f0-1234-4abc-9def-0123456789ab']
  ]) {
    const client = fakeClient()
    const h = installPageHandle(client, { win: {} })
    assert.equal(h.capture('funnel.alias', { from }), false, `from ${JSON.stringify(from)} refused`)
    assert.equal(client.calls.length, 0)
  }
  {
    const client = fakeClient()
    const h = installPageHandle(client, { win: {} })
    assert.equal(h.capture('funnel.alias'), false, 'no data → refused')
    assert.equal(h.capture('funnel.alias', { from: VID }), false, 'its own id → refused')
    assert.equal(client.calls.length, 0)
  }
  for (const own of [null, undefined, 'not an opaque id']) {
    const client = fakeClient(own)
    const h = installPageHandle(client, { win: {} })
    assert.equal(h.capture('funnel.alias', { from: LANDING_VID }), false, `own id ${JSON.stringify(own)} → refused`)
    assert.equal(client.calls.length, 0)
  }
  assert.equal(pageEvents.isOpaqueId?.(LANDING_VID), true)
  assert.equal(pageEvents.isOpaqueId?.('nino@example.ge'), false)
})

test('the handle exposes this page\'s own visitor id, read-only; the handle version is 2', () => {
  const h = installPageHandle(fakeClient(), { win: {} })
  assert.equal(h.version, 2)
  assert.equal(h.visitorId, VID)
  assert.throws(() => {
    h.visitorId = LANDING_VID
  }, TypeError)
  assert.equal(h.visitorId, VID, 'unchanged after a write attempt')
  const desc = Object.getOwnPropertyDescriptor(h, 'visitorId')
  assert.ok(desc && desc.writable !== true && !desc.set, 'no writable slot, no setter')
  assert.equal(installPageHandle(fakeClient(undefined), { win: {} }).visitorId, null, 'no id → null')
  assert.equal(installPageHandle(fakeClient('has space 12345'), { win: {} }).visitorId, null, 'a non-opaque stored id → null')
})

test('the REAL client: visitorId is the stamped visitor id; funnel.ask and funnel.alias ride the session to the transport', async () => {
  const sent = []
  const client = createAnalyzing({
    appKey: 'fly.symbols.app',
    mode: 'public',
    kind: 'project',
    visitor: { id: VID, firstSeenAt: 1_700_000_000_000 },
    storage: { localStorage: fakeStorage(), sessionStorage: fakeStorage() },
    transport: (envelope) => {
      sent.push(envelope)
      return { ok: true }
    },
    batchMs: 5,
    maxBatch: 1
  })
  assert.equal(client.visitorId, VID)
  client.state.activate(null)
  const h = installPageHandle(client, { win: {} })
  assert.equal(h.visitorId, VID)
  assert.equal(h.capture('funnel.ask', { surface: 'landing', page: '/', intent: 'crm' }), true)
  assert.equal(h.capture('funnel.alias', { from: LANDING_VID }), true)
  await new Promise((r) => setTimeout(r, 40))
  const events = sent.flatMap((e) => e.events || [])
  const ask = events.find((e) => e.message === 'funnel.ask')
  const alias = events.find((e) => e.message === 'funnel.alias')
  assert.ok(ask, 'funnel.ask reached the transport')
  assert.equal(ask.type, 'manual')
  assert.deepEqual(ask.data, { surface: 'landing', page: '/', intent: 'crm' })
  assert.ok(alias, 'funnel.alias reached the transport')
  assert.deepEqual(alias.data, { from: LANDING_VID })
  const env = sent.find((e) => (e.events || []).includes(alias))
  assert.equal(env.page.visitor.id, VID, 'the alias row carries this page\'s id; data.from the landing\'s')
  assert.equal(env.session.id, client.sessionId)

  const anonymous = createAnalyzing({ appKey: 'x', mode: 'public', visitor: false, transport: () => ({ ok: true }) })
  assert.equal(anonymous.visitorId, null, 'identity off → null')
})

// ── bootAnalyzing: the published page gets the id from smbls_vid ───────────

const _origs = {}
beforeEach(() => {
  _resetBootForTests()
  for (const k of ['window', 'document', 'location', 'history', 'localStorage', 'sessionStorage']) _origs[k] = globalThis[k]
  globalThis.window = { addEventListener () {} }
  globalThis.document = { title: 'Fly', referrer: 'https://symbols.app/' }
  globalThis.location = { pathname: '/', search: '?svid=' + LANDING_VID, host: 'fly.symbols.app', href: 'https://fly.symbols.app/?svid=' + LANDING_VID }
  globalThis.history = { pushState () {}, replaceState () {} }
})
afterEach(() => {
  for (const k of Object.keys(_origs)) globalThis[k] = _origs[k]
})

test('bootAnalyzing: window.SymbolsAnalytics.visitorId is this origin\'s smbls_vid; a queued alias drains into the session', () => {
  globalThis.localStorage = fakeStorage({ smbls_vid: JSON.stringify({ id: VID, firstSeenAt: 1_700_000_000_000, seq: 2 }) })
  globalThis.sessionStorage = fakeStorage()
  globalThis.window.SymbolsAnalytics = {
    q: [['funnel.alias', { from: LANDING_VID }], ['funnel.ask', { surface: 'landing' }]],
    capture () {}
  }
  const client = bootAnalyzing({ projectId: 'fly/symbols', projectEnv: 'production' })
  const h = globalThis.window.SymbolsAnalytics
  assert.equal(h.version, 2)
  assert.equal(h.visitorId, VID)
  assert.equal(client.visitorId, VID)
  const names = client.state.snapshot().map((e) => e.message)
  assert.ok(names.includes('funnel.alias'), 'the queued alias landed')
  assert.ok(names.includes('funnel.ask'), 'the queued ask landed')
  const alias = client.state.snapshot().find((e) => e.message === 'funnel.alias')
  assert.deepEqual(alias.data, { from: LANDING_VID })
})
