// Identity on the analyzing client (fly docs/FUNNEL.md §2 privacy + §4 G2).
//
// 1. The PUBLIC tracker never reads a tenant's own login: it used to scan
//    localStorage for any `sb-*-auth-token` (a published site's Supabase
//    session), pull the user's id AND e-mail out of it and send both as
//    analytics identity — a site's own sign-in leaking into Symbols'
//    analytics. Public visitors are identified by the visitor id only.
// 2. identify() keeps an allowlist: the user id and `plan`. Never the e-mail,
//    the name, the username or the whole user object; an e-mail is never a
//    user id.
// 3. setContext() writes into the same `traits` bag every envelope carries,
//    so it refuses personal-data keys and e-mail-shaped values too.
// Asserts the CONDITION on what reaches the transport.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import * as clientModule from '../src/client.js'
import { createAnalyzing } from '../src/client.js'

const USER_ID = '64f0c0ffee0000000000abcd'

const recordingStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed))
  const reads = []
  return {
    reads,
    get length () {
      return m.size
    },
    key: (i) => {
      reads.push(`key(${i})`)
      return [...m.keys()][i] ?? null
    },
    getItem: (k) => {
      reads.push(k)
      return m.has(k) ? m.get(k) : null
    },
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  }
}

const settle = () => new Promise((r) => setTimeout(r, 40))

const make = (extra = {}) => {
  const sent = []
  const client = createAnalyzing({
    appKey: 'tenant.example',
    kind: 'project',
    transport: (envelope) => {
      sent.push(JSON.parse(JSON.stringify(envelope)))
      return { ok: true }
    },
    batchMs: 5,
    maxBatch: 1,
    ...extra
  })
  client.state.activate(null)
  return { client, sent }
}

const _origs = {}
let listeners
beforeEach(() => {
  for (const k of ['window', 'localStorage', 'sessionStorage']) _origs[k] = globalThis[k]
  listeners = {}
  globalThis.window = {
    addEventListener: (n, fn) => {
      ;(listeners[n] = listeners[n] || []).push(fn)
    },
    removeEventListener () {}
  }
})
afterEach(() => {
  for (const k of Object.keys(_origs)) globalThis[k] = _origs[k]
})

test('public mode never reads a tenant sb-*-auth-token, and no tenant e-mail reaches an envelope', async () => {
  const tenantSession = JSON.stringify({
    access_token: 'tenant-access',
    refresh_token: 'tenant-refresh',
    user: { id: 'tenant-user-1', email: 'nino@tenant.example' }
  })
  const ls = recordingStorage({ 'sb-abcdefgh-auth-token': tenantSession })
  globalThis.localStorage = ls // the global a published page has
  globalThis.sessionStorage = recordingStorage()
  const { client, sent } = make({
    mode: 'public',
    storage: { localStorage: ls, sessionStorage: globalThis.sessionStorage }
  })
  client.capture('info', 'page_view', { path: '/' })
  await settle()
  assert.ok(sent.length >= 1, 'an envelope shipped')
  assert.deepEqual(
    ls.reads.filter((r) => /^sb-/.test(r) || /^key\(/.test(r)),
    [],
    'the tracker never enumerated or read the tenant session'
  )
  for (const env of sent) {
    assert.equal(env.user ?? null, null, 'no user identity from a tenant login')
    assert.equal(JSON.stringify(env).includes('nino@tenant.example'), false, 'no tenant e-mail')
    assert.equal(JSON.stringify(env).includes('tenant-user-1'), false, 'no tenant user id')
  }
  assert.equal((listeners.storage || []).length, 0, 'no storage watcher for tenant sessions')
})

test('identify keeps the user id and plan only — never e-mail, name, username or other traits', async () => {
  const { client, sent } = make()
  client.identify({
    userId: USER_ID,
    traits: {
      email: 'nino@example.ge',
      name: 'Nino Beridze',
      username: 'ninob',
      plan: 'pro',
      role: 'owner',
      avatar: 'https://cdn.example/a.png'
    }
  })
  client.capture('info', 'after_identify')
  await settle()
  const wire = JSON.stringify(sent)
  for (const leak of ['nino@example.ge', 'Nino Beridze', 'ninob', 'owner', 'cdn.example']) {
    assert.equal(wire.includes(leak), false, `"${leak}" never leaves the page`)
  }
  const last = sent.at(-1)
  assert.deepEqual(last.user, { id: USER_ID })
  assert.deepEqual(last.traits, { plan: 'pro' })
  const identifyEvent = sent.flatMap((e) => e.events || []).find((e) => e.hook === 'sdk.identify')
  assert.ok(identifyEvent, 'the identify event shipped')
  assert.equal(identifyEvent.userId, USER_ID)
  assert.deepEqual(identifyEvent.traits, { plan: 'pro' })
})

test('identify never takes an e-mail as the user id — the session stays anonymous instead', async () => {
  for (const input of [
    { userId: 'nino@example.ge', traits: { plan: 'pro' } },
    { id: 'nino@example.ge' },
    'nino@example.ge',
    { traits: { email: 'nino@example.ge' } }
  ]) {
    const { client, sent } = make()
    client.identify(input)
    client.capture('info', 'after_identify')
    await settle()
    const wire = JSON.stringify(sent)
    assert.equal(wire.includes('nino@example.ge'), false, `${JSON.stringify(input)}: no e-mail on the wire`)
    assert.equal(sent.at(-1).user ?? null, null, `${JSON.stringify(input)}: anonymous`)
    assert.equal(
      sent.flatMap((e) => e.events || []).some((e) => e.hook === 'sdk.identify'),
      false,
      `${JSON.stringify(input)}: no identify event`
    )
  }
  // A valid identity followed by an e-mail-only one does not keep the old user.
  const { client, sent } = make()
  client.identify({ userId: USER_ID })
  client.identify({ userId: 'nino@example.ge' })
  client.capture('info', 'after')
  await settle()
  assert.equal(sent.at(-1).user ?? null, null, 'the e-mail identify reset the session to anonymous')
})

test('setContext refuses personal-data keys and e-mail-shaped values; other context still rides', async () => {
  const { client, sent } = make()
  client.identify({ userId: USER_ID, traits: { plan: 'team' } })
  client.setContext('email', 'nino@example.ge')
  client.setContext('name', 'Nino')
  client.setContext('ref', 'nino@example.ge')
  client.setContext('view', { name: 'Dashboard', section: 'Analytics' })
  client.setContext('feature_flag', 'new-onboarding')
  client.capture('info', 'after_context')
  await settle()
  assert.deepEqual(sent.at(-1).traits, {
    plan: 'team',
    view: { name: 'Dashboard', section: 'Analytics' },
    feature_flag: 'new-onboarding'
  })
})

test('sanitizeIdentity: the allowlist as a pure function', () => {
  const { sanitizeIdentity, IDENTITY_TRAIT_KEYS } = clientModule
  assert.equal(typeof sanitizeIdentity, 'function', 'exported')
  assert.deepEqual([...IDENTITY_TRAIT_KEYS], ['plan'])
  assert.deepEqual(sanitizeIdentity({ userId: USER_ID, traits: { plan: 'pro', email: 'a@b.ge' } }), {
    userId: USER_ID,
    traits: { plan: 'pro' }
  })
  assert.deepEqual(sanitizeIdentity(USER_ID), { userId: USER_ID, traits: {} })
  assert.deepEqual(sanitizeIdentity({ id: 42 }), { userId: '42', traits: {} })
  assert.deepEqual(sanitizeIdentity({ userId: USER_ID, traits: { plan: 'x'.repeat(65) } }), { userId: USER_ID, traits: {} })
  assert.deepEqual(sanitizeIdentity({ userId: USER_ID, traits: { plan: 'a@b.ge' } }), { userId: USER_ID, traits: {} })
  assert.equal(sanitizeIdentity({ userId: 'a@b.ge' }), null)
  assert.equal(sanitizeIdentity({ userId: 'has space' }), null)
  assert.equal(sanitizeIdentity({ userId: 'x'.repeat(129) }), null)
  assert.equal(sanitizeIdentity({}), null)
  assert.equal(sanitizeIdentity(null), null)
})
