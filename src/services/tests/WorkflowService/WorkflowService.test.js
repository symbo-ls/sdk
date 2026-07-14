import test from 'tape'
import sinon from 'sinon'
import { WorkflowService } from '../../WorkflowService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new WorkflowService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('workflows.list GETs /workflows with appliesTo filter', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ appliesTo: 'record:sites' })
  t.equal(stub.firstCall.args[0], 'workflows.list', 'name')
  t.ok(stub.firstCall.args[1].startsWith('/workflows?'), 'query path')
  t.ok(
    stub.firstCall.args[1].includes('appliesTo=record%3Asites'),
    'appliesTo encoded + threaded'
  )
  sandbox.restore()
  t.end()
})

test('workflows.list with no filter GETs the bare collection', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[1], '/workflows', 'no query string')
  sandbox.restore()
  t.end()
})

test('workflows.get GETs /workflows/:id encoded', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('w/1')
  t.equal(stub.firstCall.args[1], '/workflows/w%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('workflows.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { name: 'Pipeline', kind: 'pipeline', appliesTo: 'deal', stages: [] }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/workflows', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('workflows.update PATCHes /workflows/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('w1', { name: 'Renamed' })
  t.equal(stub.firstCall.args[1], '/workflows/w1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { name: 'Renamed' }, 'body')
  sandbox.restore()
  t.end()
})

test('workflows.remove DELETEs /workflows/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('w1')
  t.equal(stub.firstCall.args[1], '/workflows/w1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('workflows writes thread workspaceId as a query param', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.create({ name: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.firstCall.args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('w1', { workspaceId: 'ws1' })
  t.ok(stub.secondCall.args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
