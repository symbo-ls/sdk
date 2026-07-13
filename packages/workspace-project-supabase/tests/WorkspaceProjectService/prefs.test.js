import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// PREFS-trio — Mongo cutover complete (SDK side). userPreferences /
// homeDashboardPrefs / workspaceDashboardDefaults route unconditionally to
// the Mongo /core/prefs/* routes and unwrap the `{ prefs }` / `{ defaults }`
// envelope back to the row shape the readers consume. The legacy _sb(...)
// PostgREST rollback arms are gone (workspace-project Supabase org retired).
// These tests assert the /core wire shapes without a live server.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('userPreferences.get GETs /core/prefs/user + unwraps { prefs }', async (t) => {
  t.plan(4)
  const svc = makeService()
  const sbStub = sandbox.stub(svc, '_sb').rejects(new Error('SB MUST NOT BE HIT'))
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ prefs: { user_id: 'u', email_digest: 'daily', homeWelcomeDismissed: true } })
  const out = await svc.userPreferences.get()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'targets /core/prefs/user (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  t.equal(sbStub.callCount, 0, '_sb (PostgREST passthrough) never called')
  t.deepEqual(
    out,
    { user_id: 'u', email_digest: 'daily', homeWelcomeDismissed: true },
    '{ prefs } envelope unwrapped — ad-hoc key carried through'
  )
  sandbox.restore()
  t.end()
})

test('userPreferences.get resolves null when the server has no prefs row', async (t) => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ prefs: null })
  const out = await svc.userPreferences.get()
  t.equal(out, null, 'null → caller renders defaults')
  sandbox.restore()
  t.end()
})

test('userPreferences.upsert PUTs { payload } to /core/prefs/user', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ prefs: { email_digest: 'weekly' } })
  const out = await svc.userPreferences.upsert({ email_digest: 'weekly' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'PUT /core/prefs/user')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(JSON.parse(opts.body), { payload: { email_digest: 'weekly' } }, 'payload wrapped')
  t.deepEqual(out, { email_digest: 'weekly' }, '{ prefs } unwrapped to the row')
  sandbox.restore()
  t.end()
})

test('homeDashboardPrefs.{get,upsert} route to /core/prefs/home-dashboard', async (t) => {
  t.plan(5)
  const svc = makeService()
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

test('workspaceDashboardDefaults.{get,upsert} route to /core/prefs/workspace-defaults + unwrap { defaults }', async (t) => {
  t.plan(4)
  const svc = makeService()
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
