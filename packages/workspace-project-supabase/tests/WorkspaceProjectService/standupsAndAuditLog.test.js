import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// standup_activity + activity_events — the last two activity-domain tables to
// leave the `/sb` PostgREST passthrough (tickets/server.md :120). ActivityService
// and WorkspaceActivityController shipped with the store cutover but were never
// mounted, so the SDK had nowhere to move to and kept the proxy alive by itself.
// Now:
//   standups → /core/workspaces/:id/standups (POST is an UPSERT on author,date)
//   auditLog → /core/workspaces/:id/activity-log
// `_sb()` must never be reached again on these paths — that is the regression
// these tests lock, since a namespace quietly holding /sb open is invisible
// until someone greps for it.

const sandbox = sinon.createSandbox()

const makeService = (ctx = { activeWorkspaceId: 'ws_7' }) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_sb').callsFake(() => {
    throw new Error('_sb() must not be reached — activity is a /core route')
  })
  if (ctx) svc._context = { ...(svc._context || {}), ...ctx }
  return svc
}

// The rows mongoStore.serializeStandup / serializeEvent emit — the same
// snake_case columns PostgREST returned.
const STANDUP_ROW = {
  id: 'su-1',
  workspace_id: 'ws_7',
  author: 'a@x.com',
  date: '2026-07-01',
  update_text: 'shipped',
  summary: 'ok',
  actions: [],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z'
}

const AUDIT_ROW = {
  id: 'ev-1',
  workspace_id: 'ws_7',
  user_email: 'a@x.com',
  activity_type: 'standup',
  score: 3,
  occurred_on: '2026-07-01',
  source_table: 'standup_activity',
  source_id: 'su-1',
  metadata: {},
  created_at: '2026-07-01T00:00:00.000Z'
}

// ── standups: read ───────────────────────────────────────────────────────────

test('standups.list GETs the workspace-scoped path and unwraps { data }', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [STANDUP_ROW] })
  const out = await svc.standups.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_7/standups', 'path-scoped to the active workspace')
  t.equal(opts.method, 'GET')
  t.equal(opts.methodName, 'standups.list')
  t.deepEqual(out, [STANDUP_ROW], 'the envelope is unwrapped to the row array')
  sandbox.restore()
  t.end()
})

test('standups.list maps author/date/limit onto query params', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.standups.list({ author: 'b@x.com', date: '2026-07-01' }, { limit: 30 })
  t.equal(
    reqStub.firstCall.args[0],
    '/workspaces/ws_7/standups?author=b%40x.com&date=2026-07-01&limit=30',
    "DailyUpdate's today-standup probe filters on exactly these"
  )
  sandbox.restore()
  t.end()
})

test('standups.list returns [] rather than undefined on an empty envelope', async (t) => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true })
  t.deepEqual(await svc.standups.list(), [], 'callers map over the result unguarded')
  sandbox.restore()
  t.end()
})

test('standups.get GETs the id sub-path', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: STANDUP_ROW })
  const out = await svc.standups.get('su-1')
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_7/standups/su-1')
  t.deepEqual(out, STANDUP_ROW)
  sandbox.restore()
  t.end()
})

// ── standups: write ──────────────────────────────────────────────────────────

// REGRESSION. WorkspaceActivityController does `payload: req.body || {}` — the
// body IS the payload. Wrapping it as { payload } made the store's
// standupPayloadToFields find none of its whitelisted columns
// (date/update_text/summary/actions) and persist an EMPTY standup, while still
// answering 201 Created. A silent data-loss bug behind a success status.
test('standups.upsert POSTs the payload as the BARE body, never { payload }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: STANDUP_ROW })
  const payload = {
    author: 'a@x.com',
    date: '2026-07-01',
    update_text: 'shipped',
    summary: 'ok',
    actions: []
  }
  await svc.standups.upsert(payload)
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_7/standups')
  t.equal(opts.method, 'POST', 'POST is the server-side upsert on (author, date)')
  t.deepEqual(JSON.parse(opts.body), payload, 'body is the payload itself, unwrapped')
  sandbox.restore()
  t.end()
})

test('standups.create hits the same upsert endpoint with a bare body', async (t) => {
  t.plan(2)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: STANDUP_ROW })
  await svc.standups.create({ date: '2026-07-01', update_text: 'x' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_7/standups', 'create and upsert are the same call')
  t.deepEqual(JSON.parse(opts.body), { date: '2026-07-01', update_text: 'x' })
  sandbox.restore()
  t.end()
})

test('standups.update PATCHes the id sub-path with a bare body', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: STANDUP_ROW })
  await svc.standups.update('su-1', { summary: 'edited' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/workspaces/ws_7/standups/su-1')
  t.equal(opts.method, 'PATCH')
  t.deepEqual(JSON.parse(opts.body), { summary: 'edited' }, 'bare body here too')
  sandbox.restore()
  t.end()
})

// ── workspace scope ──────────────────────────────────────────────────────────

// The routes are path-scoped, so a missing workspace would produce
// `/workspaces/undefined/standups` — a 404 that reads as "no standups".
// Failing in the SDK makes the real cause obvious.
test('a scopeless call throws in the SDK instead of building a broken path', async (t) => {
  t.plan(2)
  const svc = makeService(null)
  svc._context = {}
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  try {
    await svc.standups.list()
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/no workspace scope/.test(err.message), 'explicit error names the cause')
  }
  t.equal(reqStub.called, false, 'no request is issued')
  sandbox.restore()
  t.end()
})

test('an explicit options.workspaceId overrides the tab context', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.standups.list(null, { workspaceId: 'ws_other' })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_other/standups')
  sandbox.restore()
  t.end()
})

// ── audit log ────────────────────────────────────────────────────────────────

test('auditLog.list GETs the workspace activity-log and unwraps { data }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ success: true, data: [AUDIT_ROW] })
  const out = await svc.auditLog.list({})
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_7/activity-log')
  t.equal(reqStub.firstCall.args[1].methodName, 'auditLog.list')
  t.deepEqual(out, [AUDIT_ROW], 'admin/logs.js reads these column names directly')
  sandbox.restore()
  t.end()
})

test('auditLog.list threads limit', async (t) => {
  t.plan(1)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ data: [] })
  await svc.auditLog.list({}, { limit: 200 })
  t.equal(reqStub.firstCall.args[0], '/workspaces/ws_7/activity-log?limit=200')
  sandbox.restore()
  t.end()
})

// The row shape is the server's to own; the SDK must not translate it or the
// admin log table renders empty against a 200.
test('auditLog rows pass through untranslated', async (t) => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ data: [AUDIT_ROW] })
  const [row] = await svc.auditLog.list({})
  t.deepEqual(row, AUDIT_ROW, 'byte-identical')
  t.equal(row.userEmail, undefined, 'no camelCase alias synthesized')
  sandbox.restore()
  t.end()
})
