import test from 'tape'
import sinon from 'sinon'
import { ActivityEntryService } from '../../ActivityEntryService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new ActivityEntryService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// ─── list — entity timeline (entityType + entityId) ───────────────────────────

test('activityEntries.list entity-scoped GETs /activity-entries?entityType=&entityId=', async t => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', entityId: 't1' })
  t.equal(stub.firstCall.args[0], 'activityEntries.list', 'name')
  const path = stub.firstCall.args[1]
  t.ok(path.startsWith('/activity-entries?'), 'kebab-case URL /activity-entries')
  t.ok(path.includes('entityType=ticket'), 'entityType threaded')
  t.ok(path.includes('entityId=t1'), 'entityId threaded')
  sandbox.restore()
  t.end()
})

// ─── list — workspace feed (since + limit) ────────────────────────────────────

test('activityEntries.list feed GETs /activity-entries?since=&limit=', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ since: '2026-07-01', limit: 50 })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('since=2026-07-01'), 'since threaded')
  t.ok(path.includes('limit=50'), 'limit threaded')
  sandbox.restore()
  t.end()
})

test('activityEntries.list reads since/limit from the options bag too', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({}, { since: '2026-07-01', limit: 25 })
  const path = stub.firstCall.args[1]
  t.ok(path.includes('since=2026-07-01'), 'since from options')
  t.ok(path.includes('limit=25'), 'limit from options')
  sandbox.restore()
  t.end()
})

// ─── read-only — no create/update/remove surface ─────────────────────────────

test('activityEntries is read-only — no create/update/remove methods', async t => {
  t.plan(3)
  const svc = makeService()
  t.equal(typeof svc.create, 'undefined', 'no create (emission is server-internal)')
  t.equal(typeof svc.update, 'undefined', 'no update')
  t.equal(typeof svc.remove, 'undefined', 'no remove')
  sandbox.restore()
  t.end()
})

// ─── workspaceId threading ────────────────────────────────────────────────────

test('activityEntries.list threads workspaceId as a query param', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves([])
  await svc.list({ entityType: 'ticket', entityId: 't1', workspaceId: 'ws1' })
  t.ok(stub.getCall(0).args[1].includes('workspaceId=ws1'), 'workspaceId from filter')
  await svc.list({ since: '2026-07-01' }, { workspaceId: 'ws2' })
  t.ok(stub.getCall(1).args[1].includes('workspaceId=ws2'), 'workspaceId from options')
  sandbox.restore()
  t.end()
})
