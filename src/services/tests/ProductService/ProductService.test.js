import test from 'tape'
import sinon from 'sinon'
import { ProductService } from '../../ProductService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new ProductService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('products.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'products.list', 'name')
  t.equal(stub.firstCall.args[1], '/products', 'no query string')
  sandbox.restore()
  t.end()
})

test('products.list threads kind/q + active + includeArchived flag', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ kind: 'service', active: true, q: 'seat', includeArchived: true })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('kind=service'), 'kind threaded')
  t.ok(path.includes('active=true'), 'active=true threaded')
  t.ok(path.includes('q=seat'), 'q threaded')
  t.ok(path.includes('includeArchived=true'), 'includeArchived flag as true')
  sandbox.restore()
  t.end()
})

test('products.list threads active=false (tri-state, not dropped)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ active: false })
  t.ok(stub.firstCall.args[1].includes('active=false'), 'active=false threaded')
  sandbox.restore()
  t.end()
})

test('products.get GETs /products/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('pr/1')
  t.equal(stub.firstCall.args[0], 'products.get', 'name')
  t.equal(stub.firstCall.args[1], '/products/pr%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('products.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { kind: 'good', name: 'Widget' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/products', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('products.update PATCHes /products/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('pr1', { name: 'Renamed' })
  t.equal(stub.firstCall.args[1], '/products/pr1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { name: 'Renamed' }, 'body')
  sandbox.restore()
  t.end()
})

test('products.remove DELETEs /products/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('pr1')
  t.equal(stub.firstCall.args[1], '/products/pr1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('products threads workspaceId as a query param across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('pr1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ name: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('pr1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
