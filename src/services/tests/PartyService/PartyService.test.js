import test from 'tape'
import sinon from 'sinon'
import { PartyService } from '../../PartyService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new PartyService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── Collection CRUD ─────────────────────────────────────────────────────────

test('parties.list GETs the bare collection with no filter', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list()
  t.equal(stub.firstCall.args[0], 'parties.list', 'name')
  t.equal(stub.firstCall.args[1], '/parties', 'no query string')
  sandbox.restore()
  t.end()
})

test('parties.list threads kind/role/owner/q + includeArchived flag', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ kind: 'person', role: 'customer', owner: 'u1', q: 'ann', includeArchived: true })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('kind=person'), 'kind threaded')
  t.ok(path.includes('role=customer'), 'role threaded')
  t.ok(path.includes('owner=u1'), 'owner threaded')
  t.ok(path.includes('q=ann'), 'q threaded')
  t.ok(path.includes('includeArchived=true'), 'includeArchived flag as true')
  sandbox.restore()
  t.end()
})

test('parties.get GETs /parties/:id encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.get('p/1')
  t.equal(stub.firstCall.args[0], 'parties.get', 'name')
  t.equal(stub.firstCall.args[1], '/parties/p%2F1', 'encoded path')
  sandbox.restore()
  t.end()
})

test('parties.create POSTs the payload', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const payload = { kind: 'company', name: 'Acme' }
  await svc.create(payload)
  t.equal(stub.firstCall.args[1], '/parties', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, payload, 'body')
  sandbox.restore()
  t.end()
})

test('parties.update PATCHes /parties/:id', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.update('p1', { name: 'Renamed' })
  t.equal(stub.firstCall.args[1], '/parties/p1', 'path')
  t.equal(stub.firstCall.args[2].method, 'PATCH', 'PATCH')
  t.deepEqual(stub.firstCall.args[2].body, { name: 'Renamed' }, 'body')
  sandbox.restore()
  t.end()
})

test('parties.remove DELETEs /parties/:id', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.remove('p1')
  t.equal(stub.firstCall.args[1], '/parties/p1', 'path')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── Roles sub-resource ──────────────────────────────────────────────────────

test('parties.listRoles GETs /parties/:id/roles', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listRoles('p1')
  t.equal(stub.firstCall.args[0], 'parties.listRoles', 'name')
  t.equal(stub.firstCall.args[1], '/parties/p1/roles', 'path')
  sandbox.restore()
  t.end()
})

test('parties.addRole POSTs the role body to /parties/:id/roles', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.addRole('p1', { role: 'customer', tier: 'gold' })
  t.equal(stub.firstCall.args[1], '/parties/p1/roles', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, { role: 'customer', tier: 'gold' }, 'body')
  sandbox.restore()
  t.end()
})

test('parties.removeRole DELETEs /parties/:id/roles/:role encoded', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.removeRole('p1', 'vendor/eu')
  t.equal(stub.firstCall.args[1], '/parties/p1/roles/vendor%2Feu', 'both segments encoded')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── Relationships sub-resource ──────────────────────────────────────────────

test('parties.listRelationships GETs /parties/:id/relationships', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listRelationships('p1')
  t.equal(stub.firstCall.args[0], 'parties.listRelationships', 'name')
  t.equal(stub.firstCall.args[1], '/parties/p1/relationships', 'path')
  sandbox.restore()
  t.end()
})

test('parties.addRelationship POSTs {bId, kind}', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.addRelationship('p1', { bId: 'p2', kind: 'employed_by' })
  t.equal(stub.firstCall.args[1], '/parties/p1/relationships', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, { bId: 'p2', kind: 'employed_by' }, 'body')
  sandbox.restore()
  t.end()
})

test('parties.removeRelationship DELETEs the collection-level /parties/relationships/:relId', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.removeRelationship('rel1')
  t.equal(stub.firstCall.args[0], 'parties.removeRelationship', 'name')
  t.equal(stub.firstCall.args[1], '/parties/relationships/rel1', 'collection-level path (relId, not partyId)')
  t.equal(stub.firstCall.args[2].method, 'DELETE', 'DELETE')
  sandbox.restore()
  t.end()
})

// ─── Bulk (org chart) ──────────────────────────────────────────────────────

test('parties.listAllRelationships GETs the collection-level /parties/relationships, ?kind= optional', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.listAllRelationships()
  t.equal(stub.firstCall.args[0], 'parties.listAllRelationships', 'name')
  t.equal(stub.firstCall.args[1], '/parties/relationships', 'no filter — bare path')
  await svc.listAllRelationships({ kind: 'reports_to' })
  t.ok(stub.secondCall.args[1].includes('kind=reports_to'), 'kind threaded')
  t.ok(!stub.firstCall.args[1].includes('kind='), 'first call carried no kind')
  sandbox.restore()
  t.end()
})

test('parties.setManagers POSTs {assignments} to /parties/relationships/reports-to', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const assignments = [{ partyId: 'p1', managerId: 'p2' }, { partyId: 'p3', managerId: null }]
  await svc.setManagers(assignments)
  t.equal(stub.firstCall.args[1], '/parties/relationships/reports-to', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(stub.firstCall.args[2].body, { assignments }, 'body wraps the array under assignments')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ───────────────────────────────────────────────────

test('parties threads workspaceId as a query param across reads, writes + sub-resources', async t => {
  t.plan(8)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'list threads ws')
  await svc.get('p1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws1'), 'get threads ws')
  await svc.create({ name: 'x' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(2).args[1].includes('workspaceId=ws1'), 'create threads ws')
  await svc.addRole('p1', { role: 'r' }, { workspaceId: 'ws1' })
  t.ok(stub.getCall(3).args[1].includes('workspaceId=ws1'), 'addRole threads ws')
  await svc.removeRole('p1', 'r', { workspaceId: 'ws1' })
  t.ok(stub.getCall(4).args[1].includes('workspaceId=ws1'), 'removeRole threads ws')
  await svc.removeRelationship('rel1', { workspaceId: 'ws1' })
  t.ok(stub.getCall(5).args[1].includes('workspaceId=ws1'), 'removeRelationship threads ws')
  await svc.listAllRelationships({}, { workspaceId: 'ws1' })
  t.ok(stub.getCall(6).args[1].includes('workspaceId=ws1'), 'listAllRelationships threads ws')
  await svc.setManagers([], { workspaceId: 'ws1' })
  t.ok(stub.getCall(7).args[1].includes('workspaceId=ws1'), 'setManagers threads ws')
  sandbox.restore()
  t.end()
})
