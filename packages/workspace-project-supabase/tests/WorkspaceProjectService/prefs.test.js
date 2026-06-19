import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// PREFS-trio DORMANT Supabase → Mongo cutover (SDK side). The default path
// (_useCorePrefs() === false) MUST be byte-identical to today: userPreferences /
// homeDashboardPrefs / workspaceDashboardDefaults each ride the _sb(...) PostgREST
// passthrough. The on-flag path repoints to the Mongo /core/prefs/* routes and
// unwraps the `{ prefs }` / `{ defaults }` envelope back to the row shape the
// readers consume. These tests assert BOTH directions without a live server.

const sandbox = sinon.createSandbox()

// Build a service whose _useCorePrefs() returns `flag`, with _sb + _request
// stubbed so we can observe which path each method takes. The prefs surfaces are
// field initializers that capture `this`, so post-construction stubs are honored.
const makeService = (flag) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_useCorePrefs').returns(flag)
  return svc
}

// ── DEFAULT (dormant) path — byte-identical _sb delegation ──────────────────

test('userPreferences.get (default OFF) hits _sb(user_preferences), /core never touched', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const sbStub = sandbox.stub(svc, '_sb').resolves([{ user_id: 'u', email_digest: 'daily' }])
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  const out = await svc.userPreferences.get()
  t.ok(sbStub.calledOnce, '_sb invoked')
  t.equal(sbStub.firstCall.args[1], 'user_preferences', 'targets the user_preferences table')
  t.equal(reqStub.callCount, 0, '_request (/core) never called in the default path')
  t.deepEqual(out, { user_id: 'u', email_digest: 'daily' }, 'returns the raw _sb row (reader parity)')
  sandbox.restore()
  t.end()
})

test('userPreferences.upsert (default OFF) hits _sb create w/ on_conflict=user_id', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const sbStub = sandbox.stub(svc, '_sb').resolves({})
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.userPreferences.upsert({ email_digest: 'weekly', homeWelcomeDismissed: true })
  t.equal(sbStub.firstCall.args[1], 'user_preferences', 'table')
  t.equal(sbStub.firstCall.args[2], 'create', 'create op (PostgREST upsert)')
  t.equal(sbStub.firstCall.args[3].options.upsertOnConflict, 'user_id', 'conflict key unchanged')
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

test('homeDashboardPrefs.{get,upsert} (default OFF) ride _sb(home_dashboard_prefs)', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const sbStub = sandbox.stub(svc, '_sb').resolves([{}])
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.homeDashboardPrefs.get()
  await svc.homeDashboardPrefs.upsert({ hidden_widgets: { events: true }, dashboard_v: 3 })
  t.equal(sbStub.firstCall.args[1], 'home_dashboard_prefs', 'get → table')
  t.equal(sbStub.secondCall.args[2], 'create', 'upsert → create op')
  t.equal(
    sbStub.secondCall.args[3].options.upsertOnConflict,
    'user_id,workspace_id',
    'composite conflict key unchanged'
  )
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

test('workspaceDashboardDefaults.{get,upsert} (default OFF) ride _sb(workspace_dashboard_defaults)', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const sbStub = sandbox.stub(svc, '_sb').resolves([{}])
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.workspaceDashboardDefaults.get()
  await svc.workspaceDashboardDefaults.upsert({ home_default_panels: ['greeting'] })
  t.equal(sbStub.firstCall.args[1], 'workspace_dashboard_defaults', 'get → table')
  t.equal(sbStub.secondCall.args[2], 'create', 'upsert → create op')
  t.equal(sbStub.secondCall.args[3].options.upsertOnConflict, 'workspace_id', 'conflict key unchanged')
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

// ── ON-flag path — Mongo /core/prefs repoint + envelope unwrap ──────────────

test('userPreferences.get (flag ON) GETs /core/prefs/user + unwraps { prefs }', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  const sbStub = sandbox.stub(svc, '_sb').rejects(new Error('SB MUST NOT BE HIT'))
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ prefs: { user_id: 'u', email_digest: 'daily', homeWelcomeDismissed: true } })
  const out = await svc.userPreferences.get()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'targets /core/prefs/user (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(sbStub.callCount, 0, '_sb NOT called when flag is on')
  t.deepEqual(
    out,
    { user_id: 'u', email_digest: 'daily', homeWelcomeDismissed: true },
    '{ prefs } envelope unwrapped — ad-hoc key carried through'
  )
  sandbox.restore()
  t.end()
})

test('userPreferences.upsert (flag ON) PUTs { payload } to /core/prefs/user', async (t) => {
  t.plan(3)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request').resolves({ prefs: { email_digest: 'weekly' } })
  const out = await svc.userPreferences.upsert({ email_digest: 'weekly' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'PUT /core/prefs/user')
  t.deepEqual(JSON.parse(opts.body), { payload: { email_digest: 'weekly' } }, 'payload wrapped')
  t.deepEqual(out, { email_digest: 'weekly' }, '{ prefs } unwrapped to the row')
  sandbox.restore()
  t.end()
})

test('homeDashboardPrefs (flag ON) repoint to /core/prefs/home-dashboard', async (t) => {
  t.plan(5)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request')
  reqStub.onFirstCall().resolves({ prefs: { hidden_widgets: { events: true }, dashboard_v: 3 } })
  reqStub.onSecondCall().resolves({ prefs: { dashboard_v: 3 } })
  const got = await svc.homeDashboardPrefs.get()
  await svc.homeDashboardPrefs.upsert({ hidden_widgets: { events: true } })
  t.equal(reqStub.firstCall.args[0], '/prefs/home-dashboard', 'get endpoint')
  t.equal(reqStub.firstCall.args[1].method, 'GET', 'GET')
  t.deepEqual(got, { hidden_widgets: { events: true }, dashboard_v: 3 }, 'get unwrapped')
  t.equal(reqStub.secondCall.args[0], '/prefs/home-dashboard', 'upsert endpoint')
  t.equal(reqStub.secondCall.args[1].method, 'PUT', 'PUT')
  sandbox.restore()
  t.end()
})

test('workspaceDashboardDefaults (flag ON) repoint to /core/prefs/workspace-defaults + unwrap { defaults }', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request')
  reqStub.onFirstCall().resolves({ defaults: { home_default_panels: ['greeting', 'projects'] } })
  reqStub.onSecondCall().resolves({ defaults: { home_default_panels: ['greeting'] } })
  const got = await svc.workspaceDashboardDefaults.get()
  const put = await svc.workspaceDashboardDefaults.upsert({ home_default_panels: ['greeting'] })
  t.equal(reqStub.firstCall.args[0], '/prefs/workspace-defaults', 'get endpoint')
  t.deepEqual(
    got,
    { home_default_panels: ['greeting', 'projects'] },
    '{ defaults } envelope unwrapped on get'
  )
  t.equal(reqStub.secondCall.args[1].method, 'PUT', 'PUT on upsert')
  t.deepEqual(put, { home_default_panels: ['greeting'] }, '{ defaults } unwrapped on upsert')
  sandbox.restore()
  t.end()
})
