import test from 'tape'
import sinon from 'sinon'
import { BookingService } from '../../BookingService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new BookingService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── Collection CRUD ─────────────────────────────────────────────────────────

test('bookings.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'bookings.list', 'name')
  t.equal(stub.firstCall.args[1], '/bookings', 'no query string')
  sandbox.restore()
  t.end()
})

test('bookings.list threads status/party/host/kind/since', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ status: 'requested', party: 'p1', host: 'u1', kind: 'call', since: '2026-07-01' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('status=requested'), 'status threaded')
  t.ok(path.includes('party=p1'), 'party threaded')
  t.ok(path.includes('host=u1'), 'host threaded')
  t.ok(path.includes('kind=call'), 'kind threaded')
  t.ok(path.includes('since=2026-07-01'), 'since threaded')
  sandbox.restore()
  t.end()
})

test('bookings.get GETs /bookings/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('b/1')
  t.equal(stub.firstCall.args[0], 'bookings.get', 'name')
  t.equal(stub.firstCall.args[1], '/bookings/b%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('bookings.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { kind: 'call', party: 'p1', startAt: '2026-07-20T10:00:00Z' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/bookings', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('bookings.update PATCHes /bookings/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('b1', { location: 'Room 2' })
  t.equal(stub.firstCall.args[1], '/bookings/b1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { location: 'Room 2' }, 'body')
  sandbox.restore()
  t.end()
})

test('bookings.confirm POSTs /bookings/:id/confirm with no body', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.confirm('b1')
  t.equal(stub.firstCall.args[0], 'bookings.confirm', 'name')
  t.equal(stub.firstCall.args[1], '/bookings/b1/confirm', 'confirm path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.equal(stub.firstCall.args[2].body, undefined, 'no body on confirm')
  sandbox.restore()
  t.end()
})

test('bookings.remove DELETEs /bookings/:id (cancel)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('b1')
  t.equal(stub.firstCall.args[1], '/bookings/b1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE (cancel-not-hard-delete)')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('bookings threads workspaceId as a query param across reads, writes + confirm', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('b1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ kind: 'call' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.confirm('b1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'confirm threads ws')
  await svc.remove('b1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
