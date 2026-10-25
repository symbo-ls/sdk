import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Unit coverage for the Fly Blueprint store + the workspace setup job
// (server lane S1, S1-API.md): saveWorkspaceBlueprint / getWorkspaceBlueprint
// (PUT / GET /core/workspaces/:id/blueprint) and startWorkspaceSetup /
// getWorkspaceSetup (POST / GET /core/workspaces/:id/setup), all owner/admin.
// Transport is mocked at `_request`, so the `_call` envelope unwrap is
// exercised too: every route answers `{ success: true, data: … }`.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

const BLUEPRINT = {
  v: 1,
  id: 'b_northwind1',
  company: { name: 'Northwind Estates', tagline: 'Homes in Tbilisi' },
  industry: 'real-estate',
  apps: ['system/realestate-app', 'system/crm-app'],
  site: { name: 'Northwind', sections: [{ kind: 'hero', title: 'Homes that fit' }] },
  lang: 'ka',
  theme: 'dark',
  summary: 'They run 12 agents in Tbilisi.',
  preset: { key: 'real-estate', include: ['system/hr-app'], exclude: ['system/cms-app'] }
}

const { summary: _summary, ...SERVED } = BLUEPRINT
const STORE = {
  blueprint: SERVED,
  hasSummary: true,
  rev: 1,
  updatedAt: '2026-10-25T01:00:00.000Z',
  updatedBy: 'u1'
}

const STATUS = {
  id: 'j1',
  run: 1,
  rev: 1,
  status: 'running',
  stale: false,
  steps: [
    { key: 'name', status: 'done', at: '2026-10-25T01:00:01.000Z' },
    { key: 'language', status: 'done', at: '2026-10-25T01:00:01.000Z' },
    { key: 'theme', status: 'done', at: '2026-10-25T01:00:01.000Z' },
    { key: 'onboarding', status: 'done', at: '2026-10-25T01:00:01.000Z' },
    { key: 'thread', status: 'done', at: '2026-10-25T01:00:01.000Z' },
    { key: 'app:system/realestate-app', status: 'pending', at: null },
    { key: 'preset', status: 'pending', at: null },
    { key: 'website', status: 'pending', at: null }
  ],
  counts: { pending: 3, running: 0, done: 5, skipped: 0, failed: 0 },
  threadId: 'c1',
  projectId: null,
  startedAt: '2026-10-25T01:00:00.000Z',
  finishedAt: null
}

const METHODS = ['saveWorkspaceBlueprint', 'getWorkspaceBlueprint', 'startWorkspaceSetup', 'getWorkspaceSetup']

test('the Blueprint + setup methods are flat-exposed by the SDK', t => {
  t.plan(METHODS.length)
  for (const m of METHODS) t.equal(SERVICE_METHODS[m], 'workspace', `${m} maps to WorkspaceService`)
})

test('every Blueprint + setup method carries the caller session (owner/admin routes)', t => {
  t.plan(METHODS.length)
  const svc = makeService()
  for (const m of METHODS) t.equal(svc._requiresInit(m), true, `${m} attaches the bearer token`)
  sandbox.restore()
})

// saveWorkspaceBlueprint ------------------------------------------------------

test('saveWorkspaceBlueprint PUTs /workspaces/:id/blueprint with the Blueprint verbatim', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { ...STORE, changed: true } })

  const result = await svc.saveWorkspaceBlueprint('w1', BLUEPRINT)

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/blueprint', 'URL matches')
  t.equal(opts.method, 'PUT', 'method PUT')
  t.deepEqual(JSON.parse(opts.body), BLUEPRINT, 'the body IS the Blueprint (its own id and v included)')
  t.deepEqual(result, { ...STORE, changed: true }, 'the store answer, unwrapped — no summary in it')
  sandbox.restore()
  t.end()
})

test('saveWorkspaceBlueprint throws before any request without a workspace id or an object Blueprint', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: STORE })
  for (const [label, args] of [
    ['no workspace id', [undefined, BLUEPRINT]],
    ['no Blueprint', ['w1']],
    ['an array', ['w1', [BLUEPRINT]]]
  ]) {
    try {
      await svc.saveWorkspaceBlueprint(...args)
      t.fail(`${label}: expected a throw`)
    } catch (err) {
      t.ok(err instanceof Error, `${label}: throws`)
    }
  }
  t.equal(requestStub.callCount, 0, 'no request was sent')
  sandbox.restore()
  t.end()
})

test('saveWorkspaceBlueprint surfaces a 400 invalid_blueprint with its path + reason on the cause', async t => {
  t.plan(4)
  const svc = makeService()
  const cause = {
    success: false,
    error: 'invalid_blueprint',
    message: 'the Blueprint has a value this server does not take (see path and reason)',
    path: 'apps[1]',
    reason: 'bad_app_id'
  }
  const httpErr = Object.assign(new Error(cause.message, { cause }), { status: 400 })
  sandbox.stub(svc, '_request').rejects(httpErr)
  try {
    await svc.saveWorkspaceBlueprint('w1', BLUEPRINT)
  } catch (err) {
    t.equal(err.status, 400)
    t.equal(err.cause.error, 'invalid_blueprint')
    t.equal(err.cause.path, 'apps[1]')
    t.equal(err.cause.reason, 'bad_app_id')
  }
  sandbox.restore()
  t.end()
})

// getWorkspaceBlueprint -------------------------------------------------------

test('getWorkspaceBlueprint GETs /workspaces/:id/blueprint; null before the first save', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request')
  requestStub.onFirstCall().resolves({ success: true, data: STORE })
  requestStub.onSecondCall().resolves({ success: true, data: null })

  t.deepEqual(await svc.getWorkspaceBlueprint('w1'), STORE, 'the kept Blueprint (hasSummary, never summary)')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/blueprint', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  t.equal(await svc.getWorkspaceBlueprint('w2'), null, 'no Blueprint yet → null')
  sandbox.restore()
  t.end()
})

// startWorkspaceSetup ---------------------------------------------------------

test('startWorkspaceSetup POSTs /workspaces/:id/setup — an empty body, or { retry }', async t => {
  t.plan(6)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: STATUS })

  const started = await svc.startWorkspaceSetup('w1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/setup', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(JSON.parse(opts.body), {}, 'no options → an empty body')
  t.deepEqual(started, STATUS, 'the job status, unwrapped (threadId once `thread` is done)')

  await svc.startWorkspaceSetup('w1', { retry: true })
  t.deepEqual(JSON.parse(requestStub.secondCall.args[1].body), { retry: true }, 'retry rides the body')

  try {
    await svc.startWorkspaceSetup()
    t.fail('expected a throw')
  } catch (err) {
    t.equal(requestStub.callCount, 2, 'no workspace id → throws before any request')
  }
  sandbox.restore()
  t.end()
})

test('startWorkspaceSetup surfaces a 409 no_blueprint verbatim', async t => {
  t.plan(2)
  const svc = makeService()
  const cause = { success: false, error: 'no_blueprint', message: 'this workspace has no Blueprint yet (PUT /blueprint first)' }
  sandbox.stub(svc, '_request').rejects(Object.assign(new Error(cause.message, { cause }), { status: 409 }))
  try {
    await svc.startWorkspaceSetup('w1')
  } catch (err) {
    t.equal(err.status, 409)
    t.equal(err.cause.error, 'no_blueprint')
  }
  sandbox.restore()
  t.end()
})

// getWorkspaceSetup -----------------------------------------------------------

test('getWorkspaceSetup GETs /workspaces/:id/setup; null before the first start', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request')
  requestStub.onFirstCall().resolves({ success: true, data: STATUS })
  requestStub.onSecondCall().resolves({ success: true, data: null })

  t.deepEqual(await svc.getWorkspaceSetup('w1'), STATUS, 'one status per step, in run order')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/setup', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  t.equal(await svc.getWorkspaceSetup('w2'), null, 'no job yet → null')
  sandbox.restore()
  t.end()
})

// EntityDispatcher: sdk.execute('workspace.blueprint' | 'workspace.setup', …) --

const spy = (calls, method) => (...args) => {
  calls.push({ method, args })
  return Promise.resolve({ ok: true })
}

const makeDispatcherSdk = calls => {
  const workspace = Object.fromEntries(METHODS.map(m => [m, spy(calls, m)]))
  return { getService: name => (name === 'workspace' ? workspace : {}) }
}

test('sdk.execute("workspace.blueprint", get | list | update) threads the workspace id positionally', async t => {
  t.plan(3)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.blueprint', 'get', { workspaceId: 'w1' })
  await execute('workspace.blueprint', 'list', { workspaceId: 'w1' })
  await execute('workspace.blueprint', 'update', { workspaceId: 'w1', blueprint: BLUEPRINT })
  t.deepEqual(calls[0], { method: 'getWorkspaceBlueprint', args: ['w1'] })
  t.deepEqual(calls[1], { method: 'getWorkspaceBlueprint', args: ['w1'] }, 'list = the same read (declarative fetch)')
  t.deepEqual(
    calls[2],
    { method: 'saveWorkspaceBlueprint', args: ['w1', BLUEPRINT] },
    'the Blueprint goes whole — its own `id` is never read as a routing id'
  )
})

test('sdk.execute("workspace.blueprint") takes the fetch-adapter packs ({ params } / { filter } / { payload })', async t => {
  t.plan(2)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.blueprint', 'list', {
    filter: { workspaceId: 'w1' },
    params: { workspaceId: 'w1' },
    single: undefined,
    limit: undefined
  })
  await execute('workspace.blueprint', 'update', { params: { workspaceId: 'w1' }, payload: BLUEPRINT })
  t.deepEqual(calls[0].args, ['w1'])
  t.deepEqual(calls[1].args, ['w1', BLUEPRINT])
})

test('sdk.execute("workspace.setup", create | get | list) starts, retries and polls', async t => {
  t.plan(4)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.setup', 'create', { workspaceId: 'w1' })
  await execute('workspace.setup', 'create', { workspaceId: 'w1', retry: true })
  await execute('workspace.setup', 'get', { workspaceId: 'w1' })
  await execute('workspace.setup', 'list', { params: { workspaceId: 'w1' } })
  t.deepEqual(calls[0], { method: 'startWorkspaceSetup', args: ['w1', {}] })
  t.deepEqual(calls[1], { method: 'startWorkspaceSetup', args: ['w1', { retry: true }] })
  t.deepEqual(calls[2], { method: 'getWorkspaceSetup', args: ['w1'] })
  t.deepEqual(calls[3], { method: 'getWorkspaceSetup', args: ['w1'] })
})
