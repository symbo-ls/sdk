import test from 'tape'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// "workspace-scoping gaps in the chat transport" (tickets/sdk.md, 2026-07-13)
// item 1 — `_resolveAuthHeader` must NOT let a cached/localStorage federated
// JWT outrank a freshly-scoped Mongo access token when the JWT's workspace
// claim disagrees with `sdk._context.activeWorkspaceId` (post-switchOrg/
// switchWorkspace, before the background re-mint lands — which can stall
// indefinitely while the federation Supabase plane is paused).

// Minimal JWT builder — mirrors TokenManager/tests/jwtExpiry.test.js. The
// signature is never verified by the SDK (it only decodes the payload), so
// a placeholder is fine.
const b64url = (obj) => {
  const json = JSON.stringify(obj)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
const makeJwt = (payload) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

const makeService = ({ tokenProvider, activeWorkspaceId, tokenManager } = {}) => {
  const svc = new WorkspaceProjectService()
  svc._tokenProvider = tokenProvider || null
  svc._context = activeWorkspaceId === undefined ? {} : { activeWorkspaceId }
  svc._tokenManager = tokenManager || null
  return svc
}

test('_resolveAuthHeader: federated JWT wins when its workspace claim matches activeWorkspaceId', async t => {
  t.plan(1)
  const jwt = makeJwt({ sub: 'u1', app_metadata: { active_workspace_id: 'ws-1' } })
  const svc = makeService({
    tokenProvider: async () => jwt,
    activeWorkspaceId: 'ws-1',
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, `Bearer ${jwt}`, 'matching claim → federated JWT returned')
})

test('_resolveAuthHeader: stale federated JWT (workspace claim disagrees) defers to the Mongo token', async t => {
  t.plan(1)
  // JWT still carries the OLD workspace (aihouse) after a switchWorkspace to
  // 'ws-new' — the exact scenario from the ticket's live repro.
  const jwt = makeJwt({ sub: 'u1', app_metadata: { active_workspace_id: 'ws-old' } })
  const svc = makeService({
    tokenProvider: async () => jwt,
    activeWorkspaceId: 'ws-new',
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO-FRESH' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, 'Bearer MONGO-FRESH', 'stale claim → Mongo token preferred over the federated JWT')
})

test('_resolveAuthHeader: stale claim + no usable Mongo token falls back to the stale federated JWT (never 401 a valid session)', async t => {
  t.plan(1)
  const jwt = makeJwt({ sub: 'u1', app_metadata: { active_workspace_id: 'ws-old' } })
  const svc = makeService({
    tokenProvider: async () => jwt,
    activeWorkspaceId: 'ws-new',
    tokenManager: { ensureValidToken: async () => { throw new Error('no mongo session') }, getAuthHeader: () => null }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, `Bearer ${jwt}`, 'Mongo unavailable → stale federated JWT is still sent as a last resort')
})

test('_resolveAuthHeader: undecodable/opaque federated token is "unknown", not "stale" — keeps historical precedence', async t => {
  t.plan(1)
  const svc = makeService({
    tokenProvider: async () => 'opaque-not-a-jwt',
    activeWorkspaceId: 'ws-new',
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO-FRESH' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, 'Bearer opaque-not-a-jwt', 'undecodable claim never treated as stale')
})

test('_resolveAuthHeader: no activeWorkspaceId in context — federated JWT wins unconditionally (unknown, not stale)', async t => {
  t.plan(1)
  const jwt = makeJwt({ sub: 'u1', app_metadata: { active_workspace_id: 'ws-old' } })
  const svc = makeService({
    tokenProvider: async () => jwt,
    // no activeWorkspaceId set at all
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO-FRESH' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, `Bearer ${jwt}`, 'absent activeWorkspaceId → historical precedence (federated JWT)')
})

test('_resolveAuthHeader: tokenProvider returns falsy — falls through to the Mongo TokenManager (unchanged)', async t => {
  t.plan(1)
  const svc = makeService({
    tokenProvider: async () => null,
    activeWorkspaceId: 'ws-1',
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, 'Bearer MONGO', 'no federated token at all → Mongo path')
})

test('_resolveAuthHeader: top-level workspace_id claim (non-federated shape) is honored too', async t => {
  t.plan(1)
  const jwt = makeJwt({ sub: 'u1', workspace_id: 'ws-old' })
  const svc = makeService({
    tokenProvider: async () => jwt,
    activeWorkspaceId: 'ws-new',
    tokenManager: { ensureValidToken: async () => 'mongo', getAuthHeader: () => 'Bearer MONGO-FRESH' }
  })
  const header = await svc._resolveAuthHeader()
  t.equal(header, 'Bearer MONGO-FRESH', 'top-level workspace_id claim also drives the staleness check')
})

// ── switchOrg/switchWorkspace hooks — best-effort token-provider cache bust ──

test('switchOrg/switchWorkspace call tokenProvider.invalidate() when the provider exposes one', t => {
  t.plan(2)
  const svc = new WorkspaceProjectService()
  let invalidated = 0
  const tokenProvider = async () => 'tok'
  tokenProvider.invalidate = () => { invalidated += 1 }
  svc._tokenProvider = tokenProvider

  svc.switchOrg('org-1', 'org-0')
  t.equal(invalidated, 1, 'switchOrg invalidates the cached federated JWT')

  svc.switchWorkspace('ws-1', 'ws-0')
  t.equal(invalidated, 2, 'switchWorkspace invalidates the cached federated JWT')
})

test('switchOrg/switchWorkspace are no-ops (no throw) when the provider has no invalidate()', t => {
  t.plan(2)
  const svc = new WorkspaceProjectService()
  svc._tokenProvider = async () => 'tok' // no .invalidate
  t.doesNotThrow(() => svc.switchOrg('org-1'), 'switchOrg tolerates a provider without invalidate()')
  t.doesNotThrow(() => svc.switchWorkspace('ws-1'), 'switchWorkspace tolerates a provider without invalidate()')
})
