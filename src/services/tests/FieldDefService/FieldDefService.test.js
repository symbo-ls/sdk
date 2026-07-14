import test from 'tape'
import sinon from 'sinon'
import { FieldDefService } from '../../FieldDefService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new FieldDefService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('fieldDefs.list GETs /field-defs with entityType + includeArchived', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', includeArchived: true })
  t.equal(stub.firstCall.args[0], 'fieldDefs.list', 'name')
  t.ok(stub.firstCall.args[1].includes('entityType=ticket'), 'entityType threaded')
  t.ok(stub.firstCall.args[1].includes('includeArchived=true'), 'includeArchived threaded')
  sandbox.restore()
  t.end()
})

test('fieldDefs.list with no filter GETs the bare collection', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[1], '/field-defs', 'no query string')
  sandbox.restore()
  t.end()
})

test('fieldDefs.get GETs /field-defs/:id', async t => {
  t.plan(1)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('f1')
  t.equal(stub.firstCall.args[1], '/field-defs/f1', 'path')
  sandbox.restore()
  t.end()
})

test('fieldDefs.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { entityType: 'party', key: 'roofType', type: 'select', options: [] }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/field-defs', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('fieldDefs.update PATCHes /field-defs/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('f1', { label: 'Roof type' })
  t.equal(stub.firstCall.args[1], '/field-defs/f1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  sandbox.restore()
  t.end()
})

test('fieldDefs.remove DELETEs /field-defs/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('f1')
  t.equal(stub.firstCall.args[1], '/field-defs/f1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})
