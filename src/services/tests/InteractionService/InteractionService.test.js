import test from 'tape'
import sinon from 'sinon'
import { InteractionService } from '../../InteractionService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new InteractionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('interactions.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'interactions.list', 'name')
  t.equal(stub.firstCall.args[1], '/interactions', 'no query string')
  sandbox.restore()
  t.end()
})

test('interactions.list threads partyId/kind/regardingType/regardingId/since', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({
    partyId: 'p1',
    kind: 'call',
    regardingType: 'ticket',
    regardingId: 't1',
    since: '2026-01-01'
  })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  t.ok(path.includes('kind=call'), 'kind threaded')
  t.ok(path.includes('regardingType=ticket'), 'regardingType threaded')
  t.ok(path.includes('regardingId=t1'), 'regardingId threaded')
  t.ok(path.includes('since=2026-01-01'), 'since threaded')
  sandbox.restore()
  t.end()
})

test('interactions.get GETs /interactions/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('i/1')
  t.equal(stub.firstCall.args[0], 'interactions.get', 'name')
  t.equal(stub.firstCall.args[1], '/interactions/i%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('interactions.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { partyId: 'p1', kind: 'note', body: 'Followed up' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/interactions', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('interactions.update PATCHes /interactions/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('i1', { summary: 'Edited' })
  t.equal(stub.firstCall.args[1], '/interactions/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { summary: 'Edited' }, 'body')
  sandbox.restore()
  t.end()
})

test('interactions.remove DELETEs /interactions/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('i1')
  t.equal(stub.firstCall.args[1], '/interactions/i1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('interactions reads + writes thread workspaceId as a query param', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ partyId: 'p1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws alongside filter')
  await svc.create({ partyId: 'p1', kind: 'note' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('i1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
