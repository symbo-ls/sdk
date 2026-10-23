import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

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
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ prefs: { user_id: 'u', email_digest: 'daily', homeWelcomeDismissed: true } })
  const out = await svc.userPreferences.get()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'targets /core/prefs/user (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  // The passthrough itself is gone now — a stronger guarantee than "not called".
  t.equal(svc._sb, undefined, '_sb (PostgREST passthrough) no longer exists')
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

// ─── userPreferences.patch — the per-path writer (CORE-USERPREFS-PATCH-PER-PATH-1)
//
// `upsert` PUTs the WHOLE record, so two tabs of one person race on the whole
// document and the loser's edits to other keys are destroyed. `patch` names only
// the paths it writes. The SDK's job here is narrow and all of it is asserted
// below: PATCH, the `{ patch }` envelope, the body it sends VERBATIM, and the
// `{ prefs }` envelope unwrapped back to the merged record.
//
// The body must carry NO DOTTED KEY. The server's mongoSanitize deletes every
// body key holding a '.' or a leading '$', so a dotted key would be gone before
// the handler ran and the write would silently do nothing. Paths therefore ride
// as segment ARRAYS — values, which the sanitizer never inspects — and the
// server joins them. The last case below is the regression guard for that.

test('userPreferences.patch PATCHes { patch } to /core/prefs/user', async (t) => {
  t.plan(5)
  const svc = makeService()
  const reqStub = sandbox
    .stub(svc, '_request')
    .resolves({ prefs: { user_id: 'u', themeMode: 'dark', email_digest: 'daily' } })
  const out = await svc.userPreferences.patch({ set: { themeMode: 'dark' } })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/prefs/user', 'PATCH /core/prefs/user')
  t.equal(opts.method, 'PATCH', 'PATCH, not PUT — PUT still replaces the whole record')
  t.equal(opts.methodName, 'userPreferences.patch', 'its own method name')
  t.deepEqual(JSON.parse(opts.body), { patch: { set: { themeMode: 'dark' } } }, 'patch wrapped')
  t.deepEqual(
    out,
    { user_id: 'u', themeMode: 'dark', email_digest: 'daily' },
    '{ prefs } unwrapped to the MERGED record — a key the patch never named is carried'
  )
  sandbox.restore()
  t.end()
})

test('userPreferences.patch sends a deep path as segments, with no dotted key', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ prefs: {} })
  const ws = '6a3adba656e557ea101d62b9'
  await svc.userPreferences.patch({
    set: [{ path: ['modulePrefs', ws, 'crm', 'adjustOpen'], value: true }],
    unset: [['navbar_tabs', ws], 'homeWelcomeDismissed']
  })
  const body = reqStub.firstCall.args[1].body
  t.deepEqual(
    JSON.parse(body),
    {
      patch: {
        set: [{ path: ['modulePrefs', ws, 'crm', 'adjustOpen'], value: true }],
        unset: [['navbar_tabs', ws], 'homeWelcomeDismissed']
      }
    },
    'the body is passed through verbatim — the SDK never rewrites a path'
  )
  // The regression guard: every KEY in the serialized body is dot-free and
  // $-free, so nothing the server sanitizer deletes is ever on the wire.
  const keys = []
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object')
      Object.entries(v).forEach(([k, val]) => {
        keys.push(k)
        walk(val)
      })
  }
  walk(JSON.parse(body))
  t.equal(
    keys.filter((k) => k.includes('.')).length,
    0,
    'no body KEY carries a dot — the sanitizer would delete it'
  )
  t.equal(
    keys.filter((k) => k.startsWith('$')).length,
    0,
    'no body KEY starts with $ — the sanitizer would delete it'
  )
  sandbox.restore()
  t.end()
})
