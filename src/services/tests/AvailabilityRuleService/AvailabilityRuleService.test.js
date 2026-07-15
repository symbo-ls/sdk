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
