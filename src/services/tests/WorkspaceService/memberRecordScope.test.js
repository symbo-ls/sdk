import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Unit coverage for the caller side of the records-plane scope-field
// mechanism — getWorkspaceMemberRecordScope / updateWorkspaceMemberRecordScope,
// mirroring GET/PATCH /workspaces/:workspaceId/members/:userId/record-scope
// (server a95cda9f "records: a real HTTP path to read/assign
// WorkspaceMember.recordScope"; tickets/natali.md "NAT-V1-02"). Transport is
// mocked at `_request` (the { success, data } envelope contract), same as
// updateWorkspaceSettings.test.js / workspaceConfigAndSecrets.test.js. The
// server-side gate (owner/admin, unconditional self-refusal, cross-workspace
// double-close, scopeField validation) lives in
// server/src/domains/workspaces/* and is NOT re-tested here.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('teardown-before', t => {
  sandbox.restore()
  t.end()
})

test('getWorkspaceMemberRecordScope / updateWorkspaceMemberRecordScope are flat-exposed by the SDK', t => {
  t.plan(2)
  t.equal(SERVICE_METHODS.getWorkspaceMemberRecordScope, 'workspace')
  t.equal(SERVICE_METHODS.updateWorkspaceMemberRecordScope, 'workspace')
})

test('getWorkspaceMemberRecordScope GETs the record-scope sub-resource', async t => {
  t.plan(3)
  const svc = makeService()
  const data = {
    workspaceId: 'ws1',
    userId: 'u1',
    role: 'editor',
    recordScope: { locationId: ['wh-tbilisi'] },
    scopeFields: ['locationId', 'warehouseId', 'salonId']
  }
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.getWorkspaceMemberRecordScope('ws1', 'u1')

  t.equal(request.firstCall.args[0], '/workspaces/ws1/members/u1/record-scope')
  t.equal(request.firstCall.args[1].method, 'GET', '_call defaults method to GET')
  t.deepEqual(result, data, 'resolves the unwrapped data, not the {success,data} envelope')
  sandbox.restore()
})

test('getWorkspaceMemberRecordScope throws without workspaceId/userId (no request sent)', async t => {
  t.plan(3)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.getWorkspaceMemberRecordScope(undefined, 'u1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId and userId are required')
  }
  try {
    await svc.getWorkspaceMemberRecordScope('ws1', undefined)
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId and userId are required')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('getWorkspaceMemberRecordScope surfaces a 403 thrown by _request verbatim (self-read-someone-else refusal)', async t => {
  t.plan(2)
  const svc = makeService()
  const err = new Error("Requires owner|admin to read another member's record scope")
  err.status = 403
  err.cause = { error: 'forbidden', message: err.message }
  sandbox.stub(svc, '_request').rejects(err)

  try {
    await svc.getWorkspaceMemberRecordScope('ws1', 'other-user')
    t.fail('should have thrown')
  } catch (thrown) {
    t.equal(thrown.status, 403)
    t.equal(thrown.message, "Requires owner|admin to read another member's record scope")
  }
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope PATCHes the record-scope sub-resource with the recordScope body VERBATIM', async t => {
  t.plan(4)
  const svc = makeService()
  const recordScope = { locationId: ['wh-tbilisi'], warehouseId: ['wh-tbilisi'] }
  const data = { workspaceId: 'ws1', userId: 'u1', role: 'editor', recordScope, scopeFields: ['locationId', 'warehouseId'] }
  const request = sandbox.stub(svc, '_request').resolves({ success: true, data })

  const result = await svc.updateWorkspaceMemberRecordScope('ws1', 'u1', { recordScope })

  const [endpoint, opts] = request.firstCall.args
  t.equal(endpoint, '/workspaces/ws1/members/u1/record-scope')
  t.equal(opts.method, 'PATCH')
  t.deepEqual(JSON.parse(opts.body), { recordScope }, 'wire body is { recordScope }, nothing else')
  t.deepEqual(result, data)
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope sends an explicit null to clear the assignment', async t => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { workspaceId: 'ws1', userId: 'u1', role: 'editor', recordScope: null, scopeFields: [] } })

  await svc.updateWorkspaceMemberRecordScope('ws1', 'u1', { recordScope: null })

  const body = JSON.parse(request.firstCall.args[1].body)
  t.ok('recordScope' in body, 'the key survives JSON.stringify (value is null, not undefined)')
  t.equal(body.recordScope, null)
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope throws without workspaceId/userId (no request sent)', async t => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.updateWorkspaceMemberRecordScope(undefined, 'u1', { recordScope: null })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId and userId are required')
  }
  t.equal(request.called, false, 'no transport attempted')
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope throws when recordScope is omitted entirely (client-side, before any request)', async t => {
  t.plan(2)
  const svc = makeService()
  const request = sandbox.stub(svc, '_request')

  try {
    await svc.updateWorkspaceMemberRecordScope('ws1', 'u1', {})
    t.fail('should have thrown')
  } catch (err) {
    t.equal(
      err.message,
      'recordScope is required (an object of { scopeField: [values] }, or null to clear)'
    )
  }
  t.equal(request.called, false, 'no transport attempted — mirrors the server-side hasOwnProperty guard')
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope throws when called with no options at all', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request')
  try {
    await svc.updateWorkspaceMemberRecordScope('ws1', 'u1')
    t.fail('should have thrown')
  } catch (err) {
    t.equal(
      err.message,
      'recordScope is required (an object of { scopeField: [values] }, or null to clear)'
    )
  }
  sandbox.restore()
})

test('ESCALATION-ADJACENT: updateWorkspaceMemberRecordScope surfaces a 403 forbidden_self_scope thrown by _request verbatim', async t => {
  t.plan(2)
  const svc = makeService()
  const err = new Error(
    'A member cannot assign their own record scope — ask another owner/admin of this workspace'
  )
  err.status = 403
  err.cause = { error: 'forbidden_self_scope', message: err.message }
  sandbox.stub(svc, '_request').rejects(err)

  try {
    await svc.updateWorkspaceMemberRecordScope('ws1', 'self-id', { recordScope: { locationId: ['a'] } })
    t.fail('should have thrown')
  } catch (thrown) {
    t.equal(thrown.status, 403)
    t.equal(thrown.cause.error, 'forbidden_self_scope')
  }
  sandbox.restore()
})

test('updateWorkspaceMemberRecordScope surfaces a 400 unknown-field rejection with knownFields on the cause', async t => {
  t.plan(2)
  const svc = makeService()
  const err = new Error('Invalid record scope')
  err.status = 400
  err.cause = { error: 'unknown_scope_field', message: err.message, knownFields: ['locationId', 'warehouseId', 'salonId'] }
  sandbox.stub(svc, '_request').rejects(err)

  try {
    await svc.updateWorkspaceMemberRecordScope('ws1', 'u1', { recordScope: { bogusField: ['x'] } })
    t.fail('should have thrown')
  } catch (thrown) {
    t.equal(thrown.status, 400)
    t.deepEqual(thrown.cause.knownFields, ['locationId', 'warehouseId', 'salonId'])
  }
  sandbox.restore()
})

// ── EntityDispatcher route: sdk.execute('workspace.members.recordScope', ...) ──
// so a `fetch: [...]` / `sdk.execute(...)` caller reaches the same two
// methods without going through the flat sdk.* proxy.

const spy = (calls, service, method) => (...args) => {
  calls.push({ service, method, args })
  return Promise.resolve({ ok: true })
}

const makeDispatcherSdk = calls => {
  const workspace = {
    getWorkspaceMemberRecordScope: spy(calls, 'workspace', 'getWorkspaceMemberRecordScope'),
    updateWorkspaceMemberRecordScope: spy(calls, 'workspace', 'updateWorkspaceMemberRecordScope')
  }
  return { getService: name => (name === 'workspace' ? workspace : {}) }
}

test('sdk.execute("workspace.members.recordScope", "get", ...) threads workspaceId + userId positionally', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.members.recordScope', 'get', { workspaceId: 'ws1', userId: 'u1' })
  t.deepEqual(calls[0], {
    service: 'workspace',
    method: 'getWorkspaceMemberRecordScope',
    args: ['ws1', 'u1']
  })
})

// The fetch plugin's declarative adapter never emits a bare 'get' op — only
// list/rpc/insert/update/upsert/delete/subscribe (smbls/plugins/fetch
// ADAPTER_METHODS) — so `list` must ALSO resolve the same read, or a
// `fetch: [{ from: 'workspace.members.recordScope', method: 'select' }]`
// declaration 404s on "does not support op 'list'".
test('sdk.execute("workspace.members.recordScope", "list", ...) resolves the SAME read as "get" (declarative fetch: reachability)', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.members.recordScope', 'list', { workspaceId: 'ws1', userId: 'u1' })
  t.deepEqual(calls[0], {
    service: 'workspace',
    method: 'getWorkspaceMemberRecordScope',
    args: ['ws1', 'u1']
  })
})

// End-to-end shape check: exactly what workspace/packages/shared/functions/
// sdkAdapter.js's buildSdkAdapter().select() packs for a
// `fetch: [{ from: 'workspace.members.recordScope', params: { workspaceId, userId } }]`
// declaration (method defaults to 'select' → sdkAdapter maps it to op
// 'list' — see resolveFetchConfig in smbls/plugins/fetch/index.js).
test('sdk.execute("workspace.members.recordScope", "list", <sdkAdapter _packSelect shape>) round-trips', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  const packedSelectArgs = {
    filter: { workspaceId: 'ws1', userId: 'u1' },
    params: { workspaceId: 'ws1', userId: 'u1' },
    single: undefined,
    limit: undefined,
    offset: undefined,
    order: undefined,
    options: undefined,
    workspaceId: 'ws1',
    userId: 'u1'
  }
  await execute('workspace.members.recordScope', 'list', packedSelectArgs)
  t.deepEqual(calls[0].args, ['ws1', 'u1'])
})

test('sdk.execute("workspace.members.recordScope", "update", ...) threads a flat recordScope bag as the 3rd positional', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.members.recordScope', 'update', {
    workspaceId: 'ws1',
    userId: 'u1',
    recordScope: { locationId: ['wh-tbilisi'] }
  })
  t.deepEqual(calls[0], {
    service: 'workspace',
    method: 'updateWorkspaceMemberRecordScope',
    args: ['ws1', 'u1', { recordScope: { locationId: ['wh-tbilisi'] } }]
  })
})

test('sdk.execute("workspace.members.recordScope", "update", ...) preserves an explicit null (clear)', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.members.recordScope', 'update', {
    workspaceId: 'ws1',
    userId: 'u1',
    recordScope: null
  })
  t.deepEqual(
    calls[0].args[2],
    { recordScope: null },
    'the key survives with a null value — a caller clearing scope must not be silently dropped'
  )
})

test('sdk.execute("workspace.members.recordScope", "update", ...) honors a packed { payload } bag (fetch-adapter shape)', async t => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher(makeDispatcherSdk(calls))
  await execute('workspace.members.recordScope', 'update', {
    workspaceId: 'ws1',
    userId: 'u1',
    payload: { recordScope: { salonId: ['tbilisi'] } }
  })
  t.deepEqual(calls[0].args[2], { recordScope: { salonId: ['tbilisi'] } })
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
