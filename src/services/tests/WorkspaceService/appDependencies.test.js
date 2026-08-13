import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for the App Interdependencies surface (Manifest v2.1,
// spec-app-dependencies.md §6) — getWorkspaceAppDependencies /
// installWorkspaceApps / removeWorkspaceApp. Transport is mocked at
// `_request` directly (NOT `_call`): WorkspaceAppsController replies flat
// (`{success, resolved, cycles}` / `{success, installed, alreadyInstalled,
// workspaceApps}` / `{success, uninstalled, dependents, forced}`), never
// enveloped under `data` like most other workspace routes, so these tests
// assert the flat fields survive without a `.data` unwrap — that is exactly
// the failure mode `_call` would have produced silently (response.data ===
// undefined). The 409 `app_has_dependents` contract (`err.status`,
// `err.cause.dependents`) is asserted via a rejected `_request` stub, per
// `_request`'s existing non-2xx handling (BaseService.js).

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('app interdependency methods are flat-exposed by the SDK', t => {
  t.plan(3)
  for (const method of [
    'getWorkspaceAppDependencies',
    'installWorkspaceApps',
    'removeWorkspaceApp'
  ]) {
    t.equal(SERVICE_METHODS[method], 'workspace', `${method} maps to WorkspaceService`)
  }
})

// getWorkspaceAppDependencies -------------------------------------------------

test('getWorkspaceAppDependencies GETs /workspaces/:id/apps/:appId/dependencies', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    resolved: [{ id: 'acme/billing', requirement: 'required', status: 'missing' }],
    cycles: []
  })

  const result = await svc.getWorkspaceAppDependencies('w1', 'acme/crm')

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/apps/acme%2Fcrm/dependencies', 'URL matches, appId encoded')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(
    result,
    { resolved: [{ id: 'acme/billing', requirement: 'required', status: 'missing' }], cycles: [] },
    'flat resolved/cycles fields survive without a .data unwrap'
  )
  sandbox.restore()
  t.end()
})

test('getWorkspaceAppDependencies defaults resolved/cycles to empty arrays when absent', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true })

  const result = await svc.getWorkspaceAppDependencies('w1', 'acme/crm')

  t.deepEqual(result, { resolved: [], cycles: [] }, 'missing fields default to []')
  sandbox.restore()
  t.end()
})

test('getWorkspaceAppDependencies throws without workspaceId or appId', async t => {
  t.plan(2)
  const svc = makeService()
  try {
    await svc.getWorkspaceAppDependencies(undefined, 'acme/crm')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'workspaceId validation')
  }
  try {
    await svc.getWorkspaceAppDependencies('w1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'appId is required', 'appId validation')
  }
  sandbox.restore()
  t.end()
})

test('getWorkspaceAppDependencies surfaces the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'app not found' })

  try {
    await svc.getWorkspaceAppDependencies('w1', 'acme/crm')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'app not found', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})

// installWorkspaceApps --------------------------------------------------------

test('installWorkspaceApps POSTs /workspaces/:id/apps with appId + alsoInstall', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    installed: ['acme/crm', 'acme/billing'],
    alreadyInstalled: [],
    workspaceApps: [{ id: 'acme/crm' }, { id: 'acme/billing' }]
  })

  const result = await svc.installWorkspaceApps('w1', {
    appId: 'acme/crm',
    alsoInstall: ['acme/billing']
  })

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/apps', 'URL is the apps collection')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(
    JSON.parse(opts.body),
    { appId: 'acme/crm', alsoInstall: ['acme/billing'] },
    'wire body carries appId + alsoInstall'
  )
  t.deepEqual(
    result,
    {
      installed: ['acme/crm', 'acme/billing'],
      alreadyInstalled: [],
      workspaceApps: [{ id: 'acme/crm' }, { id: 'acme/billing' }]
    },
    'flat installed/alreadyInstalled/workspaceApps fields survive without a .data unwrap'
  )
  sandbox.restore()
  t.end()
})

test('installWorkspaceApps omits alsoInstall from the body when not provided', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    installed: ['acme/crm'],
    alreadyInstalled: [],
    workspaceApps: []
  })

  await svc.installWorkspaceApps('w1', { appId: 'acme/crm' })

  t.deepEqual(
    JSON.parse(requestStub.firstCall.args[1].body),
    { appId: 'acme/crm' },
    'no alsoInstall key fabricated when the caller omits it'
  )
  sandbox.restore()
  t.end()
})

test('installWorkspaceApps throws without workspaceId or appId', async t => {
  t.plan(2)
  const svc = makeService()
  try {
    await svc.installWorkspaceApps(undefined, { appId: 'acme/crm' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'workspaceId validation')
  }
  try {
    await svc.installWorkspaceApps('w1', {})
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'appId is required', 'appId validation')
  }
  sandbox.restore()
  t.end()
})

test('installWorkspaceApps surfaces the server message on { success: false } (e.g. missing_required_dependencies)', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({
    success: false,
    message: 'missing_required_dependencies: acme/billing'
  })

  try {
    await svc.installWorkspaceApps('w1', { appId: 'acme/crm' })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'missing_required_dependencies: acme/billing', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})

// removeWorkspaceApp -----------------------------------------------------------

test('removeWorkspaceApp DELETEs /workspaces/:id/apps/:appId', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    uninstalled: 'acme/crm',
    dependents: [],
    forced: false
  })

  const result = await svc.removeWorkspaceApp('w1', 'acme/crm')

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/apps/acme%2Fcrm', 'URL matches, appId encoded, no query string')
  t.equal(opts.method, 'DELETE', 'method DELETE')
  t.deepEqual(
    result,
    { uninstalled: 'acme/crm', dependents: [], forced: false },
    'flat uninstalled/dependents/forced fields survive without a .data unwrap'
  )
  sandbox.restore()
  t.end()
})

test('removeWorkspaceApp appends ?force=true when force is requested', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    uninstalled: 'acme/crm',
    dependents: [{ id: 'acme/reports', requirement: 'required' }],
    forced: true
  })

  const result = await svc.removeWorkspaceApp('w1', 'acme/crm', { force: true })

  t.equal(
    requestStub.firstCall.args[0],
    '/workspaces/w1/apps/acme%2Fcrm?force=true',
    'force=true rides the query string'
  )
  t.equal(result.forced, true, 'forced reflects the server response')
  sandbox.restore()
  t.end()
})

test('removeWorkspaceApp rejects with err.status 409 and err.cause.dependents when a required dependent blocks it', async t => {
  t.plan(4)
  const svc = makeService()
  const cause = {
    error: 'app_has_dependents',
    message: 'acme/reports still requires acme/crm',
    dependents: [{ id: 'acme/reports', requirement: 'required' }]
  }
  const conflict = new Error(cause.message, { cause })
  conflict.status = 409
  sandbox.stub(svc, '_request').rejects(conflict)

  try {
    await svc.removeWorkspaceApp('w1', 'acme/crm')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 409, 'status is 409')
    t.equal(err.cause.error, 'app_has_dependents', 'cause carries the parsed error code')
    t.deepEqual(
      err.cause.dependents,
      [{ id: 'acme/reports', requirement: 'required' }],
      'cause.dependents is the blocking dependent list — the caller reads err.cause.dependents'
    )
    t.notOk(err instanceof Error === false, 'still a real Error instance')
  }
  sandbox.restore()
  t.end()
})

test('removeWorkspaceApp throws without workspaceId or appId', async t => {
  t.plan(2)
  const svc = makeService()
  try {
    await svc.removeWorkspaceApp(undefined, 'acme/crm')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'workspaceId validation')
  }
  try {
    await svc.removeWorkspaceApp('w1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'appId is required', 'appId validation')
  }
  sandbox.restore()
  t.end()
})

test('removeWorkspaceApp surfaces the server message on an in-band { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'app not installed' })

  try {
    await svc.removeWorkspaceApp('w1', 'acme/crm')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'app not installed', 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})

test('app interdependency methods reject missing scope before making requests', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request')
  const cases = [
    () => svc.getWorkspaceAppDependencies('', 'acme/crm'),
    () => svc.installWorkspaceApps('', { appId: 'acme/crm' }),
    () => svc.removeWorkspaceApp('', 'acme/crm')
  ]

  for (const invoke of cases) {
    try {
      await invoke()
      t.fail('invalid input should be rejected')
    } catch (error) {
      t.ok(/required/.test(error.message), 'invalid input is rejected')
    }
  }
  t.equal(requestStub.callCount, 0, 'no request is made for invalid input')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
