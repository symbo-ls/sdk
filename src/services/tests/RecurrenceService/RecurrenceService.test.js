import test from 'tape'
import sinon from 'sinon'
import { RecurrenceService } from '../../RecurrenceService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new RecurrenceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── Collection CRUD ─────────────────────────────────────────────────────────

test('recurrences.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'recurrences.list', 'name')
  t.equal(stub.firstCall.args[1], '/recurrences', 'no query string')
  sandbox.restore()
  t.end()
})

test('recurrences.list threads enabled/templateType/templateId', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ enabled: true, templateType: 'ticket', templateId: 't1' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('enabled=true'), 'enabled threaded')
  t.ok(path.includes('templateType=ticket'), 'templateType threaded')
  t.ok(path.includes('templateId=t1'), 'templateId threaded')
  sandbox.restore()
  t.end()
})

test('recurrences.list threads enabled=false (tri-state, not swallowed by a falsy check)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ enabled: false })
  t.ok(stub.firstCall.args[1].includes('enabled=false'), 'boolean false is threaded')
  sandbox.restore()
  t.end()
})

test('recurrences.get GETs /recurrences/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('r/1')
  t.equal(stub.firstCall.args[0], 'recurrences.get', 'name')
  t.equal(stub.firstCall.args[1], '/recurrences/r%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('recurrences.create POSTs the template + rrule payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { template: { type: 'ticket', id: 't1' }, rrule: 'FREQ=WEEKLY', enabled: true }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/recurrences', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('recurrences.update PATCHes /recurrences/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('r1', { enabled: false })
  t.equal(stub.firstCall.args[1], '/recurrences/r1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { enabled: false }, 'body')
  sandbox.restore()
  t.end()
})

test('recurrences.remove DELETEs /recurrences/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('r1')
  t.equal(stub.firstCall.args[1], '/recurrences/r1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE (tombstone)')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('recurrences threads workspaceId across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('r1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ rrule: 'FREQ=DAILY' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('r1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
