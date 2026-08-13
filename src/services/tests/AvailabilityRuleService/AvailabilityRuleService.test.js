import test from 'tape'
import sinon from 'sinon'
import { AvailabilityRuleService } from '../../AvailabilityRuleService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AvailabilityRuleService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// The route mounts at the kebab-case /availability-rules even though the
// service + dispatcher entity are the camelCase `availabilityRules`.

// ─── Collection CRUD ─────────────────────────────────────────────────────────

test('availabilityRules.list GETs the kebab-case collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'availabilityRules.list', 'name')
  t.equal(stub.firstCall.args[1], '/availability-rules', 'kebab-case path, no query string')
  sandbox.restore()
  t.end()
})

test('availabilityRules.list threads the user filter', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ user: 'u1' })
  t.ok(stub.firstCall.args[1].includes('user=u1'), 'user threaded')
  sandbox.restore()
  t.end()
})

test('availabilityRules.get GETs /availability-rules/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('a/1')
  t.equal(stub.firstCall.args[0], 'availabilityRules.get', 'name')
  t.equal(stub.firstCall.args[1], '/availability-rules/a%2F1', 'encoded kebab-case path')
  sandbox.restore()
  t.end()
})

test('availabilityRules.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { weekly: [{ dow: 1, from: '09:00', to: '17:00' }], tz: 'UTC' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/availability-rules', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('availabilityRules.update PATCHes /availability-rules/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('a1', { tz: 'Europe/Berlin' })
  t.equal(stub.firstCall.args[1], '/availability-rules/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { tz: 'Europe/Berlin' }, 'body')
  sandbox.restore()
  t.end()
})

test('availabilityRules.remove DELETEs /availability-rules/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('a1')
  t.equal(stub.firstCall.args[1], '/availability-rules/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE (tombstone)')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('availabilityRules threads workspaceId across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ tz: 'UTC' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})

// ─── intersect ──────────────────────────────────────────────────────────────
// Regression coverage for PR #11 review: (1) day-of-week mapping, (2) DST
// resolved against the current date rather than a fixed Jan-2000 reference,
// (3) empty-overlap never throws, (4) concurrent (not sequential) fetch,
// (5) [] — not {} — on every empty-result path, and (6) the whole
// conversion must be independent of the EXECUTING MACHINE's own local
// timezone (a machine-local re-parse silently shifted every computed
// instant by the runner's own offset — invisible on a UTC CI box, wrong
// for a real user's non-UTC browser).

test('availabilityRules.intersect returns [] for an empty userIDs list', async t => {
  t.plan(1)
  const svc = makeService()
  const result = await svc.intersect([], 'ws1')
  t.deepEqual(result, [], 'empty input short-circuits to []')
  t.end()
})

test('availabilityRules.intersect fetches every user concurrently via list()', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, 'list').resolves([
    { tz: 'UTC', weekly: [{ dow: 1, from: '09:00', to: '17:00' }] }
  ])
  await svc.intersect(['u1', 'u2', 'u3'], 'ws1')
  t.equal(stub.callCount, 3, 'one list() call per userID')
  t.deepEqual(stub.getCall(0).args[0], { user: 'u1', workspaceId: 'ws1' }, 'first call filters by u1')
  t.deepEqual(stub.getCall(2).args[0], { user: 'u3', workspaceId: 'ws1' }, 'third call filters by u3')
  sandbox.restore()
  t.end()
})

test('availabilityRules.intersect returns [] (not {}) when a user has no availability', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, 'list')
  stub.onCall(0).resolves([{ tz: 'UTC', weekly: [{ dow: 1, from: '09:00', to: '17:00' }] }])
  stub.onCall(1).resolves([])
  const result = await svc.intersect(['u1', 'u2'], 'ws1')
  t.ok(Array.isArray(result), 'result is an array')
  t.equal(result.length, 0, 'no-availability path serializes to [] not {}')
  sandbox.restore()
  t.end()
})

test('availabilityRules.intersect never throws on fully disjoint schedules', async t => {
  t.plan(2)
  const svc = makeService()
  const clock = sandbox.useFakeTimers(new Date('2026-08-13T12:00:00Z')) // a Thursday
  const stub = sandbox.stub(svc, 'list')
  stub.onCall(0).resolves([{ tz: 'UTC', weekly: [{ dow: 1, from: '09:00', to: '10:00' }] }])
  stub.onCall(1).resolves([{ tz: 'UTC', weekly: [{ dow: 2, from: '09:00', to: '10:00' }] }])
  const result = await svc.intersect(['u1', 'u2'], 'ws1')
  t.ok(Array.isArray(result), 'does not throw indexing an empty timeBlocks[0]')
  t.equal(result.length, 0, 'disjoint days produce no overlap')
  clock.restore()
  sandbox.restore()
  t.end()
})

test('availabilityRules.intersect computes the overlap in the first user\'s timezone', async t => {
  t.plan(3)
  const svc = makeService()
  const clock = sandbox.useFakeTimers(new Date('2026-08-13T12:00:00Z'))
  const stub = sandbox.stub(svc, 'list')
  stub.onCall(0).resolves([{ tz: 'America/New_York', weekly: [{ dow: 3, from: '09:00', to: '17:00' }] }])
  stub.onCall(1).resolves([{ tz: 'America/New_York', weekly: [{ dow: 3, from: '13:00', to: '20:00' }] }])
  const result = await svc.intersect(['u1', 'u2'], 'ws1')
  t.equal(result.length, 1, 'one overlapping block')
  t.equal(result[0].from, '13:00', 'overlap starts at the later start')
  t.equal(result[0].to, '17:00', 'overlap ends at the earlier end')
  clock.restore()
  sandbox.restore()
  t.end()
})

test('availabilityRules.intersect day-of-week mapping does not roll dow=0 back a day', async t => {
  // Regression for the `new Date(2000, 0, dow, ...)` bug: dow is a day of
  // the WEEK, not a day of the MONTH — `new Date(2000, 0, 0)` silently
  // resolved to Dec 31 1999 (a Friday), corrupting every Sunday rule.
  t.plan(1)
  const svc = makeService()
  const clock = sandbox.useFakeTimers(new Date('2026-08-13T12:00:00Z'))
  const stub = sandbox.stub(svc, 'list')
  stub.onCall(0).resolves([{ tz: 'UTC', weekly: [{ dow: 0, from: '09:00', to: '10:00' }] }])
  stub.onCall(1).resolves([{ tz: 'UTC', weekly: [{ dow: 0, from: '09:00', to: '10:00' }] }])
  const result = await svc.intersect(['u1', 'u2'], 'ws1')
  t.equal(result[0]?.dow, 0, 'Sunday (dow=0) survives the round trip as dow=0')
  clock.restore()
  sandbox.restore()
  t.end()
})
