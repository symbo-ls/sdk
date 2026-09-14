// CORE-ANALYZED-UTM-ATTRIBUTION-1 addendum — visitor identity + session
// continuity.
//
// A first-party random visitor id per origin (localStorage `smbls_vid`)
// with firstSeenAt + the visitor's session counter, and a session record
// (sessionStorage `smbls_sid`) reused inside the 30-min timeout, rotated
// (seq + 1, returning true) past it — mid-page through
// state.startNewSession, which ships the OLD id's terminal envelope first.
// Every envelope carries `page.visitor = { id, firstSeenAt, returning,
// seq }`. Fake storages; asserts the CONDITION, never absence of error.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createAnalyzing,
  createVisitorStore,
  VISITOR_KEY,
  SESSION_KEY,
  DEFAULT_SESSION_TIMEOUT_MS
} from '../src/client.js'

const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries([...m].map(([k, v]) => [k, JSON.parse(v)]))
  }
}
const MIN = 60_000

// ── the store ─────────────────────────────────────────────────────────────

test('first boot: a new visitor id + firstSeenAt land in localStorage, session seq 1, returning false', () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  const t0 = 1_700_000_000_000
  const store = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t0 })
  assert.equal(DEFAULT_SESSION_TIMEOUT_MS, 30 * MIN)
  const v = store.visitor()
  assert.ok(typeof v.id === 'string' && v.id.length >= 8, 'a random id')
  assert.equal(v.firstSeenAt, t0)
  assert.equal(v.returning, false)
  assert.equal(v.seq, 1)
  assert.deepEqual(ls.dump()[VISITOR_KEY], { id: v.id, firstSeenAt: t0, seq: 1 })
  const sid = ss.dump()[SESSION_KEY]
  assert.equal(sid.sessionId, store.sessionId)
  assert.equal(sid.lastActivityAt, t0)
  assert.equal(sid.seq, 1)
  assert.equal(sid.returning, false)
})

test('a boot inside the timeout REUSES the session id (same visitor, same seq, returning as recorded)', () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  const t0 = 1_700_000_000_000
  const a = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t0 })
  const firstSession = a.sessionId
  a.touch(t0 + 10 * MIN)
  // Page load 2, 25 minutes after the last activity.
  const b = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t0 + 35 * MIN })
  assert.equal(b.sessionId, firstSession, 'one visit = one session across page loads')
  assert.equal(b.visitor().id, a.visitor().id)
  assert.equal(b.visitor().seq, 1)
  assert.equal(b.visitor().returning, false)
  assert.equal(ss.dump()[SESSION_KEY].lastActivityAt, t0 + 35 * MIN, 'the boot itself is activity')
})

test('a boot PAST the timeout mints a new session: seq + 1, returning true, same visitor id', () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  const t0 = 1_700_000_000_000
  const a = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t0 })
  const firstSession = a.sessionId
  const b = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t0 + 31 * MIN })
  assert.notEqual(b.sessionId, firstSession)
  assert.equal(b.visitor().id, a.visitor().id, 'the visitor is the same person')
  assert.equal(b.visitor().seq, 2)
  assert.equal(b.visitor().returning, true)
  assert.equal(ls.dump()[VISITOR_KEY].seq, 2, 'the visitor counter advanced')
  assert.equal(b.visitor().firstSeenAt, t0, 'firstSeenAt never moves')
})

test('a new tab (no session record) with a known visitor is a returning session too', () => {
  const ls = fakeStorage()
  const t0 = 1_700_000_000_000
  const a = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), now: () => t0 })
  const b = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), now: () => t0 + MIN })
  assert.notEqual(b.sessionId, a.sessionId)
  assert.equal(b.visitor().returning, true)
  assert.equal(b.visitor().seq, 2)
})

test('expired() / rotate(): mid-page rotation past the timeout', () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  let t = 1_700_000_000_000
  const store = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t })
  const first = store.sessionId
  t += 29 * MIN
  assert.equal(store.expired(), false)
  store.touch()
  t += 29 * MIN
  assert.equal(store.expired(), false, 'activity extended the session')
  t += 31 * MIN
  assert.equal(store.expired(), true)
  const next = store.rotate()
  assert.notEqual(next, first)
  assert.equal(store.sessionId, next)
  assert.equal(store.visitor().seq, 2)
  assert.equal(store.visitor().returning, true)
  assert.equal(ss.dump()[SESSION_KEY].sessionId, next)
  assert.equal(store.expired(), false)
})

test('visitor: false → no visitor, no stamp, a per-boot session id', () => {
  const ls = fakeStorage()
  const store = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), visitor: false })
  assert.equal(store.visitor(), null)
  assert.equal(store.enabled, false)
  assert.equal(VISITOR_KEY in ls.dump(), false, 'nothing written')
  assert.ok(store.sessionId)
})

test('an injected visitor { id, firstSeenAt } is used verbatim and never written to storage', () => {
  const ls = fakeStorage()
  const store = createVisitorStore({
    localStorage: ls,
    sessionStorage: fakeStorage(),
    visitor: { id: 'vid-ssr', firstSeenAt: 123 },
    now: () => 1_000
  })
  assert.deepEqual(store.visitor(), { id: 'vid-ssr', firstSeenAt: 123, returning: false, seq: 1 })
  assert.equal(VISITOR_KEY in ls.dump(), false)
  const ret = createVisitorStore({
    localStorage: fakeStorage(),
    sessionStorage: fakeStorage(),
    visitor: { id: 'vid-ssr', firstSeenAt: 123, returning: true, seq: 4 }
  })
  assert.deepEqual(ret.visitor(), { id: 'vid-ssr', firstSeenAt: 123, returning: true, seq: 5 })
})

test('no storage at all (SSR) → no visitor, a minted session id, never a throw', () => {
  const store = createVisitorStore({ localStorage: undefined, sessionStorage: undefined })
  assert.equal(store.visitor(), null)
  assert.ok(store.sessionId)
  assert.equal(store.expired(), false)
  store.touch()
})

test('a throwing storage is survived (private mode): no stamp, a session id', () => {
  const broken = {
    getItem () {
      throw new Error('SecurityError')
    },
    setItem () {
      throw new Error('SecurityError')
    }
  }
  const store = createVisitorStore({ localStorage: broken, sessionStorage: broken })
  assert.equal(store.visitor(), null)
  assert.ok(store.sessionId)
})

test('a corrupt record is replaced, not trusted', () => {
  const ls = fakeStorage({ [VISITOR_KEY]: 'not json' })
  const ss = fakeStorage({ [SESSION_KEY]: JSON.stringify({ sessionId: '', lastActivityAt: 'x' }) })
  const store = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => 5 })
  assert.ok(store.visitor().id)
  assert.equal(store.visitor().seq, 1)
  assert.ok(ss.dump()[SESSION_KEY].sessionId)
})

test('an explicit sessionId wins: no continuity, but still a session of the visitor', () => {
  const ls = fakeStorage()
  const a = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), now: () => 1 })
  const b = createVisitorStore({
    localStorage: ls,
    sessionStorage: fakeStorage(),
    sessionId: 'caller-owned',
    now: () => 2
  })
  assert.equal(b.sessionId, 'caller-owned')
  assert.equal(b.visitor().id, a.visitor().id)
  assert.equal(b.visitor().seq, 2)
  assert.equal(b.visitor().returning, true)
  assert.equal(b.expired(), false, 'never rotates a caller-owned id')
})

// ── the client: stamp + continuity through the real sink ─────────────────

const ship = async ({ storage, opts = {}, act }) => {
  const captured = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => {
      captured.push(envelope)
      return { ok: true }
    },
    level: 'trace',
    batchMs: 5,
    maxBatch: 1,
    storage,
    ...opts
  })
  a.state.activate(null)
  await act(a)
  await new Promise((r) => setTimeout(r, 40))
  a.shutdown()
  return { captured, a }
}

test('every envelope carries page.visitor = { id, firstSeenAt, returning, seq } and session.id = the store id', async () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  const { captured, a } = await ship({
    storage: { localStorage: ls, sessionStorage: ss },
    act: (c) => c.captureMessage('hello', 'info')
  })
  assert.ok(captured.length >= 1)
  const env = captured[0]
  const vid = ls.dump()[VISITOR_KEY]
  assert.deepEqual(env.page.visitor, { id: vid.id, firstSeenAt: vid.firstSeenAt, returning: false, seq: 1 })
  assert.equal(env.session.id, ss.dump()[SESSION_KEY].sessionId)
  assert.equal(a.sessionId, env.session.id)
  assert.equal(typeof env.page.utcOffset, 'number', 'the other stamps still ride along')
  assert.ok(env.page.landing && typeof env.page.landing === 'object')
})

test('visitor: false → no page.visitor key; an injected visitor is stamped verbatim', async () => {
  const off = await ship({ opts: { visitor: false }, act: (c) => c.captureMessage('x', 'info') })
  assert.equal('visitor' in off.captured[0].page, false)
  const inj = await ship({
    storage: { localStorage: fakeStorage(), sessionStorage: fakeStorage() },
    opts: { visitor: { id: 'vid-ssr', firstSeenAt: 7 } },
    act: (c) => c.captureMessage('x', 'info')
  })
  assert.deepEqual(inj.captured[0].page.visitor, { id: 'vid-ssr', firstSeenAt: 7, returning: false, seq: 1 })
})

test('an event refreshes lastActivityAt; an event past the timeout rotates the session: the OLD id ships a terminal envelope (endedAt), the event rides the NEW id with seq 2', async () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  let now = 1_700_000_000_000
  const realNow = Date.now
  Date.now = () => now
  try {
    const { captured, a } = await ship({
      storage: { localStorage: ls, sessionStorage: ss, now: () => now },
      opts: { sessionTimeoutMs: 30 * MIN },
      act: async (c) => {
        c.captureMessage('first', 'info')
        await new Promise((r) => setTimeout(r, 20))
        now += 10 * MIN
        c.captureMessage('second', 'info')
        await new Promise((r) => setTimeout(r, 20))
        assert.equal(ss.dump()[SESSION_KEY].lastActivityAt, now, 'activity refreshed by the event')
        now += 31 * MIN
        c.captureMessage('third', 'info')
        await new Promise((r) => setTimeout(r, 20))
      }
    })
    const first = captured[0].session.id
    const terminal = captured.find((e) => e.session.endedAt != null)
    assert.ok(terminal, 'a terminal envelope shipped')
    assert.equal(terminal.session.id, first, 'for the OLD session id')
    const third = captured.find((e) => e.events.some((ev) => ev.message === 'third'))
    assert.ok(third, 'the third event shipped')
    assert.notEqual(third.session.id, first, 'on the NEW session id')
    assert.equal(third.page.visitor.seq, 2)
    assert.equal(third.page.visitor.returning, true)
    assert.equal(third.page.visitor.id, captured[0].page.visitor.id, 'same visitor')
    assert.equal(a.sessionId, third.session.id, 'the client reports the id in force')
    assert.equal(ss.dump()[SESSION_KEY].sessionId, third.session.id)
    assert.equal(ls.dump()[VISITOR_KEY].seq, 2)
  } finally {
    Date.now = realNow
  }
})

test('the terminal envelope of the OLD id carries the OLD stamp (seq n); the first envelope of the new id carries n + 1', async () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  let now = 1_700_000_000_000
  const { captured } = await ship({
    storage: { localStorage: ls, sessionStorage: ss, now: () => now },
    act: async (c) => {
      c.captureMessage('one', 'info')
      await new Promise((r) => setTimeout(r, 20))
      now += 31 * MIN
      c.captureMessage('click', 'info')
      await new Promise((r) => setTimeout(r, 20))
    }
  })
  const first = captured[0].session.id
  const terminal = captured.find((e) => e.session.endedAt != null)
  assert.ok(terminal, 'terminal envelope shipped')
  assert.equal(terminal.session.id, first)
  assert.deepEqual(
    { seq: terminal.page.visitor.seq, returning: terminal.page.visitor.returning },
    { seq: 1, returning: false },
    'the closing envelope is stamped with the session it closes'
  )
  const click = captured.find((e) => e.events.some((ev) => ev.message === 'click'))
  assert.notEqual(click.session.id, first)
  assert.deepEqual({ seq: click.page.visitor.seq, returning: click.page.visitor.returning }, { seq: 2, returning: true })
  assert.equal(ss.dump()[SESSION_KEY].sessionId, click.session.id, 'the store holds the new id')
})

test('a flush is NOT activity: an idle tab whose timer flushes still expires; only events refresh the clock', () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  let t = 1_700_000_000_000
  const store = createVisitorStore({ localStorage: ls, sessionStorage: ss, now: () => t })
  const captured = []
  const a = createAnalyzing({
    appKey: 'app',
    transport: (envelope) => {
      captured.push(envelope)
      return { ok: true }
    },
    storage: { localStorage: ls, sessionStorage: ss, now: () => t },
    batchMs: 5
  })
  a.state.activate(null)
  const before = ss.dump()[SESSION_KEY].lastActivityAt
  t += 10 * MIN
  a.flush()
  assert.equal(ss.dump()[SESSION_KEY].lastActivityAt, before, 'flush did not touch the clock')
  a.captureMessage('evt', 'info')
  assert.equal(ss.dump()[SESSION_KEY].lastActivityAt, t, 'an event did')
  a.shutdown()
  assert.ok(store.sessionId)
})

test('two tabs share the visitor counter: the second tab rotation continues the count (read-modify-write)', () => {
  const ls = fakeStorage()
  let t = 1_700_000_000_000
  const tabA = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), now: () => t })
  const tabB = createVisitorStore({ localStorage: ls, sessionStorage: fakeStorage(), now: () => t })
  assert.equal(tabA.visitor().seq, 1)
  assert.equal(tabB.visitor().seq, 2)
  t += 31 * MIN
  tabA.rotate()
  assert.equal(tabA.visitor().seq, 3, 'A re-read B increment before its own')
  tabB.rotate()
  assert.equal(tabB.visitor().seq, 4, 'B re-read A increment before its own')
  assert.equal(ls.dump()[VISITOR_KEY].seq, 4)
})

test('flush() past the timeout rotates too; a caller startNewSession() advances seq', async () => {
  const ls = fakeStorage()
  const ss = fakeStorage()
  let now = 1_700_000_000_000
  const { captured, a } = await ship({
    storage: { localStorage: ls, sessionStorage: ss, now: () => now },
    act: async (c) => {
      c.captureMessage('one', 'info')
      await new Promise((r) => setTimeout(r, 20))
      now += 31 * MIN
      c.flush()
      await new Promise((r) => setTimeout(r, 20))
      c.captureMessage('two', 'info')
      await new Promise((r) => setTimeout(r, 20))
      c.startNewSession()
      c.captureMessage('three', 'info')
      await new Promise((r) => setTimeout(r, 20))
    }
  })
  const one = captured.find((e) => e.events.some((ev) => ev.message === 'one'))
  const two = captured.find((e) => e.events.some((ev) => ev.message === 'two'))
  const three = captured.find((e) => e.events.some((ev) => ev.message === 'three'))
  assert.notEqual(two.session.id, one.session.id, 'flush rotated')
  assert.equal(two.page.visitor.seq, 2)
  assert.notEqual(three.session.id, two.session.id, 'caller rotation')
  assert.equal(three.page.visitor.seq, 3)
  assert.equal(a.sessionId, three.session.id)
  assert.equal(ls.dump()[VISITOR_KEY].seq, 3)
})
