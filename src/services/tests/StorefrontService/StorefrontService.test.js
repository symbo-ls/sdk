import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new StorefrontService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('listStorefrontProducts GETs /storefront/:workspaceId/products with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws1')
  t.equal(stub.firstCall.args[0], 'listStorefrontProducts', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/products', 'no query string')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts threads category/limit/page', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws1', { category: 'cat-1', limit: 10, page: 2 })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('category=cat-1'), 'category threaded')
  t.ok(path.includes('limit=10'), 'limit threaded')
  t.ok(path.includes('page=2'), 'page threaded')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts encodes the workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontProducts('ws/1')
  t.equal(stub.firstCall.args[1], '/storefront/ws%2F1/products', 'encoded workspaceId')
  sandbox.restore()
  t.end()
})

test('listStorefrontProducts throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves([])
  try {
    await svc.listStorefrontProducts()
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/workspaceId/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

test('getStorefrontProduct GETs /storefront/:workspaceId/products/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getStorefrontProduct('ws1', 'p/1')
  t.equal(stub.firstCall.args[0], 'getStorefrontProduct', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/products/p%2F1', 'encoded id')
  sandbox.restore()
  t.end()
})

test('getStorefrontProduct throws without id', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.getStorefrontProduct('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/id/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection GETs /storefront/:workspaceId/collections/:collection', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontCollection('ws1', 'nat_categories')
  t.equal(stub.firstCall.args[0], 'listStorefrontCollection', 'methodName')
  t.equal(stub.firstCall.args[1], '/storefront/ws1/collections/nat_categories', 'path')
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection threads limit/page and encodes the collection name', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listStorefrontCollection('ws1', 'weird name', { limit: 5, page: 2 })
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/storefront/ws1/collections/weird%20name'), 'collection encoded')
  t.ok(path.includes('limit=5') && path.includes('page=2'), 'pagination threaded')
  sandbox.restore()
  t.end()
})

test('listStorefrontCollection throws without collection', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves([])
  try {
    await svc.listStorefrontCollection('ws1')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/collection/.test(err.message), 'validation guard')
  }
  sandbox.restore()
  t.end()
})

// BaseService._requiresInit is the no-auth-header carve-out — every
// storefront method must be registered there (mirrors the meet-guest /
// demo-flow entries) since these are anonymous, unauthenticated reads.
test('BaseService._requiresInit treats all three storefront methods as anonymous (no bearer token attached)', t => {
  t.plan(3)
  const svc = new BaseService()
  t.equal(svc._requiresInit('listStorefrontProducts'), false)
  t.equal(svc._requiresInit('getStorefrontProduct'), false)
  t.equal(svc._requiresInit('listStorefrontCollection'), false)
  t.end()
})
