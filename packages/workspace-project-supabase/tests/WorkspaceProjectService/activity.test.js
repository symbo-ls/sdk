import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// standups (`standup_activity`) + auditLog (`activity_events`) — the last two
// tables the workspace-project worker's /sb PostgREST proxy served for the SDK.
// Both now route to /core/workspaces/:id/... (ActivityService → the activity
// store's Mongo arm). The `_sb` stub below is the real assertion: a namespace
// silently holding the passthrough open is invisible until someone greps.

const sandbox = sinon.createSandbox()

const makeService = (ctx = { activeWorkspaceId: 'ws_1' }) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_sb').callsFake(() => {
    throw new Error('_sb() must not be reached — activity is on /core routes')
  })
  svc._context = { ...(svc._context || {}), ...ctx }
  return svc
}

test('standups.list GETs the workspace-scoped route and unwraps { data }', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [{ id: 1, author: 'a@x.com' }] })
  const out = await svc.standups.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_1/standups', 'workspace-scoped path')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(opts.methodName, 'standups.list', 'labelled for the request log')
  t.deepEqual(out, [{ id: 1, author: 'a@x.com' }], '{ data } unwrapped')
  sandbox.restore()
  t.end()
})

test('standups.list maps author / date / limit onto the query', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.standups.list({ author: 'a@x.com', date: '2026-07-27' }, { limit: 5 })
  t.equal(
    reqStub.firstCall.args[0],
    '/workspaces/ws_1/standups?author=a%40x.com&date=2026-07-27&limit=5',
    'all three threaded'
  )
  sandbox.restore()
  t.end()
})

// The passthrough era spelled the column `author_email`; accept it so an
// older caller keeps working against the new route.
test('standups.list accepts the legacy author_email filter key', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.standups.list({ author_email: 'a@x.com' })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_1/standups?author=a%40x.com', 'aliased')
  sandbox.restore()
  t.end()
})

test('standups.get GETs the id sub-path', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: { id: 9 } })
  const out = await svc.standups.get(9)
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_1/standups/9', 'id sub-path')
  t.deepEqual(out, { id: 9 }, 'row unwrapped')
  sandbox.restore()
  t.end()
})

// create and upsert are the SAME server call: POST upserts on (author, date).
// This is what retires the old wrong-conflict-column bug — there is no longer
// a conflict target for a caller to misspell.
test('standups.create and standups.upsert both POST the same route', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: { id: 3 } })
  await svc.standups.create({ text: 'a' })
  await svc.standups.upsert({ text: 'a' })
  const [ep1, o1] = reqStub.firstCall.args
  const [ep2, o2] = reqStub.secondCall.args
  t.equal(ep1, '/workspaces/ws_1/standups', 'create POSTs the collection')
  t.equal(ep2, '/workspaces/ws_1/standups', 'upsert POSTs the same collection')
  t.equal(o1.method, 'POST', 'POST')
  // Bare body, not { payload } — the controller reads req.body AS the payload
  // (WorkspaceActivityController.upsertStandup). And no conflict token: the
  // upsert key is server-side, so it can't be misspelled by a caller again.
  t.deepEqual(JSON.parse(o2.body), { text: 'a' }, 'payload sent as the bare body')
  sandbox.restore()
  t.end()
})

test('standups.update PATCHes the id sub-path', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: { id: 9, text: 'b' } })
  const out = await svc.standups.update(9, { text: 'b' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_1/standups/9', 'id sub-path')
  t.equal(opts.method, 'PATCH', 'PATCH')
  t.deepEqual(out, { id: 9, text: 'b' }, 'row unwrapped')
  sandbox.restore()
  t.end()
})

test('auditLog.list GETs the activity-log route and unwraps { data }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [{ id: 'e1' }] })
  const out = await svc.auditLog.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_1/activity-log', 'workspace-scoped activity-log path')
  t.equal(opts.method, 'GET', 'GET')
  t.deepEqual(out, [{ id: 'e1' }], '{ data } unwrapped')
  sandbox.restore()
  t.end()
})

test('auditLog.list threads limit from either options or filter', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.auditLog.list(null, { limit: 50 })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_1/activity-log?limit=50', 'from options')
  await svc.auditLog.list({ limit: 10 })
  t.equal(reqStub.secondCall.args[0], '/workspaces/ws_1/activity-log?limit=10', 'from filter')
  sandbox.restore()
  t.end()
})

// These routes are path-scoped, so an absent workspace is a caller error and
// must fail loudly rather than hitting /workspaces/undefined/...
test('activity namespaces throw without a workspace in context', async (t) => {
  t.plan(2)
  const svc = makeService({})
  sandbox.stub(svc, '_request').resolves({ data: [] })
  try {
    await svc.standups.list()
    t.fail('standups.list should have thrown')
  } catch (err) {
    t.match(err.message, /no workspace scope/, 'standups explains the missing scope')
  }
  try {
    await svc.auditLog.list()
    t.fail('auditLog.list should have thrown')
  } catch (err) {
    t.match(err.message, /no workspace scope/, 'auditLog explains the missing scope')
  }
  sandbox.restore()
  t.end()
})

test('an explicit workspaceId beats the tab context', async (t) => {
  t.plan(1)
  const svc = makeService({ activeWorkspaceId: 'ws_1' })
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.standups.list(null, { workspaceId: 'ws_other' })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_other/standups', 'explicit id wins')
  sandbox.restore()
  t.end()
})
