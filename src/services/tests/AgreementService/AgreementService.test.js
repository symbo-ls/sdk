import test from 'tape'
import sinon from 'sinon'
import { AgreementService } from '../../AgreementService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AgreementService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('agreements.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'agreements.list', 'name')
  t.equal(stub.firstCall.args[1], '/agreements', 'no query string')
  sandbox.restore()
  t.end()
})

test('agreements.list threads kind/status/partyId', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ kind: 'contract', status: 'active', partyId: 'p1' })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('kind=contract'), 'kind threaded')
  t.ok(path.includes('status=active'), 'status threaded')
  t.ok(path.includes('partyId=p1'), 'partyId threaded')
  sandbox.restore()
  t.end()
})

// G-L (APP-FAMILY-CONTRACT §4): the server list takes free text over number
// + title and an inclusive created range. A Date bound is sent as ISO-8601.
test('agreements.list threads q / createdFrom / createdTo (G-L)', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({
    q: 'ORD-2026 & co',
    createdFrom: '2026-10-01T00:00:00+04:00',
    createdTo: new Date('2026-10-31T19:59:59.999Z')
  })
  const qs = new URLSearchParams(stub.firstCall.args[1].split('?')[1])
  t.equal(qs.get('q'), 'ORD-2026 & co', 'q threaded (encoded)')
  t.equal(qs.get('createdFrom'), '2026-10-01T00:00:00+04:00', 'createdFrom threaded as given')
  t.equal(qs.get('createdTo'), '2026-10-31T19:59:59.999Z', 'a Date bound goes as ISO-8601')
  await svc.list({ q: '', createdFrom: null })
  t.equal(stub.secondCall.args[1], '/agreements', 'empty values add nothing')
  sandbox.restore()
  t.end()
})

// The list's custom-field equality (custom.<key>=<value>, a field the
// workspace declared for agreements) and the updatedAt range (BESSI's
// to-bill read: the ended orders changed since a moment). A boolean or a
// number goes as text (the server reads it as the field's type); a Date
// bound goes as ISO-8601.
test('agreements.list threads custom.<key> equalities and updatedFrom / updatedTo', async t => {
  t.plan(8)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({
    kind: 'order',
    status: 'ended',
    custom: { channel: 'Facebook & co', rush: false, qty: 5 },
    updatedFrom: new Date('2026-10-01T00:00:00.000Z'),
    updatedTo: '2026-10-31T23:59:59+04:00'
  })
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/agreements?'), 'the same literal route')
  const qs = new URLSearchParams(path.split('?')[1])
  t.equal(qs.get('custom.channel'), 'Facebook & co', 'a text value threaded (encoded)')
  t.equal(qs.get('custom.rush'), 'false', 'false goes as text')
  t.equal(qs.get('custom.qty'), '5', 'a number goes as text')
  t.equal(qs.get('updatedFrom'), '2026-10-01T00:00:00.000Z', 'a Date bound goes as ISO-8601')
  t.equal(qs.get('updatedTo'), '2026-10-31T23:59:59+04:00', 'a text bound goes as given')
  t.equal(qs.get('kind'), 'order', 'the other filters stay')
  await svc.list({ custom: { channel: '', rush: null, qty: undefined }, updatedFrom: null, updatedTo: '' })
  t.equal(stub.secondCall.args[1], '/agreements', 'empty values add nothing')
  sandbox.restore()
  t.end()
})

test('agreements.get GETs /agreements/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('a/1')
  t.equal(stub.firstCall.args[0], 'agreements.get', 'name')
  t.equal(stub.firstCall.args[1], '/agreements/a%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('agreements.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { kind: 'quote', partyId: 'p1', lines: [] }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/agreements', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('agreements.update PATCHes /agreements/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('a1', { status: 'signed' })
  t.equal(stub.firstCall.args[1], '/agreements/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { status: 'signed' }, 'body')
  sandbox.restore()
  t.end()
})

test('agreements.remove DELETEs /agreements/:id (tombstone)', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('a1')
  t.equal(stub.firstCall.args[1], '/agreements/a1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

test('agreements threads workspaceId as a query param across reads + writes', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ kind: 'quote' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.remove('a1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'remove threads ws')
  sandbox.restore()
  t.end()
})
