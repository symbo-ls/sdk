import test from 'tape'
import sinon from 'sinon'
import { SharedAssetService } from '../../SharedAssetService.js'

const sandbox = sinon.createSandbox()

function makeStub () {
  const svc = new SharedAssetService()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: 'ok' })
  return { svc, stub }
}

test('createAsset POSTs body to /shared-assets', async t => {
  t.plan(3)
  const { svc, stub } = makeStub()
  const res = await svc.createAsset({ name: 'Icon', kind: 'icon' })
  t.equal(res, 'ok')
  t.equal(stub.firstCall.args[0], '/shared-assets')
  t.equal(stub.firstCall.args[1].method, 'POST')
  sandbox.restore()
  t.end()
})

test('createAsset throws without body', async t => {
  t.plan(1)
  const svc = new SharedAssetService()
  sandbox.stub(svc, '_requireReady').resolves()
  try {
    await svc.createAsset()
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Asset body is required')
  }
  sandbox.restore()
  t.end()
})

test('listAssets builds querystring from options', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.listAssets({ kind: 'icon', limit: 10 })
  t.equal(stub.firstCall.args[0], '/shared-assets?kind=icon&limit=10')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('listAssets (no query) hits bare /shared-assets', async t => {
  t.plan(1)
  const { svc, stub } = makeStub()
  await svc.listAssets()
  t.equal(stub.firstCall.args[0], '/shared-assets')
  sandbox.restore()
  t.end()
})

test('getAsset hits /shared-assets/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.getAsset('a-1')
  t.equal(stub.firstCall.args[0], '/shared-assets/a-1')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('updateAsset PATCHes /shared-assets/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.updateAsset('a-1', { name: 'new' })
  t.equal(stub.firstCall.args[0], '/shared-assets/a-1')
  t.equal(stub.firstCall.args[1].method, 'PATCH')
  sandbox.restore()
  t.end()
})

test('deleteAsset DELETEs /shared-assets/:id', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.deleteAsset('a-1')
  t.equal(stub.firstCall.args[0], '/shared-assets/a-1')
  t.equal(stub.firstCall.args[1].method, 'DELETE')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
