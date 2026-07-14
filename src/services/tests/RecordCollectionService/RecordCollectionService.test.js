import test from 'tape'
import sinon from 'sinon'
import { RecordCollectionService } from '../../RecordCollectionService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new RecordCollectionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('recordCollections.list GETs /record-collections with includeDeleted', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ includeDeleted: true })
  t.equal(stub.firstCall.args[0], 'recordCollections.list', 'name')
  t.ok(stub.firstCall.args[1].includes('includeDeleted=true'), 'includeDeleted threaded')
  sandbox.restore()
  t.end()
})

test('recordCollections.list with no filter GETs the bare collection', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[1], '/record-collections', 'no query string')
  sandbox.restore()
  t.end()
})

test('recordCollections.get GETs /record-collections/:id (id or key)', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('sites')
  t.equal(stub.firstCall.args[1], '/record-collections/sites', 'path')
  sandbox.restore()
  t.end()
})

test('recordCollections.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { key: 'sites', label: 'Sites', labelSingular: 'Site', titleField: 'name' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/record-collections', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('recordCollections.update PATCHes /record-collections/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('rc1', { label: 'Renamed' })
  t.equal(stub.firstCall.args[1], '/record-collections/rc1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  sandbox.restore()
  t.end()
})

test('recordCollections.remove DELETEs /record-collections/:id (archive-only)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('rc1')
  t.equal(stub.firstCall.args[1], '/record-collections/rc1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})
