import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for Workspace Presets (server CONTRACT §4) —
// listWorkspacePresets (GET /core/presets, public) and applyWorkspacePreset
// (POST /core/workspaces/:id/presets/:key/apply, owner/admin). Transport is
// mocked at `_request`, so the `_call` envelope unwrap is exercised too: both
// routes answer `{ success: true, data: … }`.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

const PRESET = {
  key: 'virtual-assistance',
  apps: ['system/production-app', 'system/invoices-app', 'system/payroll-app', 'system/scheduling-app', 'system/bi-app'],
  suggested: ['system/crm-app', 'system/hr-app', 'system/socials-app'],
  setup: {
    channels: [{ name: 'clients', topic: 'Client requests, briefs and updates.' }],
    folders: ['Clients', 'Templates', 'SOPs']
  },
  featured: true,
  order: 1
}

const APPLIED = {
  ok: true,
  preset: 'virtual-assistance',
  installed: ['system/scheduling-app', 'system/bi-app'],
  skipped: [],
  failed: [{ appId: 'system/production-app', error: 'app_not_found', message: 'app not found or unreadable: system/production-app' }],
  setup: {
    channels: { created: ['clients', 'production'], existing: [], failed: [] },
    folders: { created: ['Clients', 'Templates', 'SOPs'], existing: [], failed: [] }
  },
  workspacePreset: {
    key: 'virtual-assistance',
    appliedAt: '2026-10-24T12:00:00.000Z',
    appliedBy: 'u1',
    apps: ['system/scheduling-app', 'system/bi-app']
  }
}

test('workspace preset methods are flat-exposed by the SDK', t => {
  t.plan(2)
  t.equal(SERVICE_METHODS.listWorkspacePresets, 'workspace', 'listWorkspacePresets maps to WorkspaceService')
  t.equal(SERVICE_METHODS.applyWorkspacePreset, 'workspace', 'applyWorkspacePreset maps to WorkspaceService')
})

test('listWorkspacePresets is public (no session header); applyWorkspacePreset needs the session', t => {
  t.plan(2)
  const svc = makeService()
  t.equal(svc._requiresInit('listWorkspacePresets'), false, 'the registry read attaches no bearer token')
  t.equal(svc._requiresInit('applyWorkspacePreset'), true, 'the apply carries the caller session')
  sandbox.restore()
})

// listWorkspacePresets --------------------------------------------------------

test('listWorkspacePresets GETs /presets and returns the presets array', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { presets: [PRESET] } })

  const result = await svc.listWorkspacePresets()

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/presets', 'URL matches the public registry route')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(result, [PRESET], 'the v2 presets, unwrapped from { data: { presets } }')
  sandbox.restore()
  t.end()
})

test('listWorkspacePresets returns [] when the answer carries no presets array', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  t.deepEqual(await svc.listWorkspacePresets(), [], 'missing presets default to []')
  sandbox.restore()
  t.end()
})

// applyWorkspacePreset --------------------------------------------------------

test('applyWorkspacePreset POSTs /workspaces/:id/presets/:key/apply with the picks and returns the apply answer', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: APPLIED })

  const result = await svc.applyWorkspacePreset('w1', 'virtual-assistance', {
    include: ['system/crm-app'],
    exclude: ['system/payroll-app'],
    setup: false
  })

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/presets/virtual-assistance/apply', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.deepEqual(
    JSON.parse(opts.body),
    { include: ['system/crm-app'], exclude: ['system/payroll-app'], setup: false },
    'body carries include / exclude / setup'
  )
  t.deepEqual(result, APPLIED, 'the { ok, preset, installed, skipped, failed, setup, workspacePreset } answer')
  sandbox.restore()
  t.end()
})

test('applyWorkspacePreset sends an empty body without options and encodes the key', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: APPLIED })

  await svc.applyWorkspacePreset('w1', 'a b/c')

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/presets/a%20b%2Fc/apply', 'the key is URL-encoded')
  t.deepEqual(JSON.parse(opts.body), {}, 'no undefined picks sent — the server applies its defaults')
  sandbox.restore()
  t.end()
})

test('applyWorkspacePreset throws without workspaceId or presetKey', async t => {
  t.plan(2)
  const svc = makeService()
  try {
    await svc.applyWorkspacePreset(undefined, 'ecommerce')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'workspaceId validation')
  }
  try {
    await svc.applyWorkspacePreset('w1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'presetKey is required', 'presetKey validation')
  }
  sandbox.restore()
  t.end()
})

test('applyWorkspacePreset surfaces a 404 unknown_preset / 403 role refusal as the HTTP error (status + cause)', async t => {
  t.plan(4)
  const svc = makeService()
  const notFound = new Error('unknown preset: casino', {
    cause: { success: false, error: 'unknown_preset', message: 'unknown preset: casino' }
  })
  notFound.status = 404
  const forbidden = new Error('requires admin or above, got editor', {
    cause: { success: false, error: 'forbidden_workspace_role', message: 'requires admin or above, got editor' }
  })
  forbidden.status = 403
  sandbox.stub(svc, '_request').onFirstCall().rejects(notFound).onSecondCall().rejects(forbidden)

  try {
    await svc.applyWorkspacePreset('w1', 'casino')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 404, 'status 404')
    t.equal(err.cause.error, 'unknown_preset', 'cause carries the error code')
  }
  try {
    await svc.applyWorkspacePreset('w1', 'ecommerce')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.status, 403, 'status 403')
    t.equal(err.cause.error, 'forbidden_workspace_role', 'an editor sees the role refusal')
  }
  sandbox.restore()
  t.end()
})
