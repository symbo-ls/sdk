import test from 'tape'
import sinon from 'sinon'
import { BaseService, __inflightGetsForTests } from '../../BaseService.js'

// In-flight GET dedupe (workspace boot F6) — identical concurrent GETs share
// ONE network round-trip; the entry drops on settle so this is never a cache;
// mutations, differing auth scopes, bodies, signals and dedupe:false all
// bypass the table.

const makeService = () => {
  const svc = new BaseService()
  svc._apiUrl = 'https://api.test'
  // No _tokenManager — the auth block is skipped, headers stay caller-driven.
  return svc
}

const jsonRes = (payload, status = 200) => ({
  ok: true,
  status,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
})

const withFetchStub = (stub, fn) => {
  const original = globalThis.fetch
  globalThis.fetch = stub
  const restore = () => {
    globalThis.fetch = original
    __inflightGetsForTests.clear()
  }
  return fn().then(
    (v) => {
      restore()
      return v
    },
    (e) => {
      restore()
      throw e
    }
  )
}

test('concurrent identical GETs share one fetch; followers get a clone', async t => {
  t.plan(5)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ items: [{ id: 'w1' }] }))
  await withFetchStub(fetchStub, async () => {
    const [a, b, c] = await Promise.all([
      svc._request('/workspaces', { method: 'GET', methodName: 'listWorkspaces' }),
      svc._request('/workspaces', { method: 'GET', methodName: 'listWorkspaces' }),
      svc._request('/workspaces', { method: 'GET', methodName: 'listWorkspaces' })
    ])
    t.equal(fetchStub.callCount, 1, 'three concurrent identical GETs = one network call')
    t.deepEqual(a, { items: [{ id: 'w1' }] }, 'leader payload intact')
    t.deepEqual(b, a, 'followers see the same data')
    t.notEqual(b, a, 'followers get their own clone, never a shared object graph')
    t.equal(__inflightGetsForTests.size(), 0, 'entry dropped once settled')
  })
  t.end()
})

test('settled entries are NOT a cache — a later identical GET refetches', async t => {
  t.plan(1)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ n: 1 }))
  await withFetchStub(fetchStub, async () => {
    await svc._request('/notifications', { method: 'GET' })
    await svc._request('/notifications', { method: 'GET' })
    t.equal(fetchStub.callCount, 2, 'sequential identical GETs each hit the network')
  })
  t.end()
})

test('mutations are NEVER deduped', async t => {
  t.plan(1)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ ok: true }))
  await withFetchStub(fetchStub, async () => {
    await Promise.all([
      svc._request('/tickets', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
      svc._request('/tickets', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    ])
    t.equal(fetchStub.callCount, 2, 'two identical concurrent POSTs stay two POSTs')
  })
  t.end()
})

test('different auth scopes never share a flight', async t => {
  t.plan(1)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ me: true }))
  await withFetchStub(fetchStub, async () => {
    await Promise.all([
      svc._request('/auth/me', { method: 'GET', headers: { Authorization: 'Bearer user-a' } }),
      svc._request('/auth/me', { method: 'GET', headers: { Authorization: 'Bearer user-b' } })
    ])
    t.equal(fetchStub.callCount, 2, 'same URL under two tokens = two requests')
  })
  t.end()
})

test('dedupe:false and an AbortSignal both force a private round-trip', async t => {
  t.plan(1)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ ok: true }))
  await withFetchStub(fetchStub, async () => {
    await Promise.all([
      svc._request('/workspaces', { method: 'GET' }),
      svc._request('/workspaces', { method: 'GET', dedupe: false }),
      svc._request('/workspaces', { method: 'GET', signal: new AbortController().signal })
    ])
    t.equal(fetchStub.callCount, 3, 'opt-outs never enter the shared table')
  })
  t.end()
})

test('a shared failure rejects every sharer and clears the entry', async t => {
  t.plan(4)
  const svc = makeService()
  // Non-network failure (plain Error, not TypeError) → no retry loop delay.
  const fetchStub = sinon.stub().callsFake(async () => {
    throw new Error('boom')
  })
  await withFetchStub(fetchStub, async () => {
    const results = await Promise.allSettled([
      svc._request('/workspaces', { method: 'GET' }),
      svc._request('/workspaces', { method: 'GET' })
    ])
    t.equal(fetchStub.callCount, 1, 'one network attempt for both')
    t.equal(results[0].status, 'rejected', 'leader rejects')
    t.equal(results[1].status, 'rejected', 'follower rejects')
    t.equal(__inflightGetsForTests.size(), 0, 'failed entry dropped — next call is fresh')
  })
  t.end()
})

test('_requestExternal dedupes identical concurrent GETs too', async t => {
  t.plan(2)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ rows: [1, 2] }))
  await withFetchStub(fetchStub, async () => {
    const url = 'https://worker.test/records'
    const [a, b] = await Promise.all([
      svc._requestExternal(url, { method: 'GET', authHeader: 'Bearer tok' }),
      svc._requestExternal(url, { method: 'GET', authHeader: 'Bearer tok' })
    ])
    t.equal(fetchStub.callCount, 1, 'off-core identical GETs share the flight')
    t.deepEqual(b, a, 'both resolve the payload')
  })
  t.end()
})

test('core and external flights never collide across key spaces', async t => {
  t.plan(1)
  const svc = makeService()
  const fetchStub = sinon.stub().callsFake(async () => jsonRes({ ok: true }))
  await withFetchStub(fetchStub, async () => {
    await Promise.all([
      // Same PATH shape but different absolute URLs (core prefixes /core).
      svc._request('/records', { method: 'GET' }),
      svc._requestExternal('https://api.test/records', { method: 'GET', authHeader: null })
    ])
    t.equal(fetchStub.callCount, 2, 'distinct absolute URLs = distinct flights')
  })
  t.end()
})
