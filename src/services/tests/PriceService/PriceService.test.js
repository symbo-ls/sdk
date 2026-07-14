import test from 'tape'
import sinon from 'sinon'
import { PriceService } from '../../PriceService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new PriceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('prices.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'prices.list', 'name')
  t.equal(stub.firstCall.args[1], '/prices', 'no query string')
  sandbox.restore()
  t.end()
})

test('prices.list threads productId + active + includeArchived flag', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ productId: 'pr1', active: true, includeArchived: true })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('productId=pr1'), 'productId threaded')
  t.ok(path.includes('active=true'), 'active=true threaded')
  t.ok(path.includes('includeArchived=true'), 'includeArchived flag as true')
  sandbox.restore()
  t.end()
})

test('prices.list threads active=false (tri-state, not dropped)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ active: false })
  t.ok(stub.firstCall.args[1].includes('active=false'), 'active=false threaded')
  sandbox.restore()
  t.end()
})

test('prices.get GETs /prices/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('px/1')
  t.equal(stub.firstCall.args[0], 'prices.get', 'name')
  t.equal(stub.firstCall.args[1], '/prices/px%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('prices.create POSTs the {product, currency, amount} body', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { product: 'pr1', currency: 'usd', amount: 1900 }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/prices', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('prices.update PATCHes /prices/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('px1', { active: false })
  t.equal(stub.firstCall.args[1], '/prices/px1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { active: false }, 'body')
  sandbox.restore()
  t.end()
})

test('prices.remove DELETEs /prices/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('px1')
  t.equal(stub.firstCall.args[1], '/prices/px1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('prices threads workspaceId as a query param across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('px1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ product: 'pr1' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('px1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
