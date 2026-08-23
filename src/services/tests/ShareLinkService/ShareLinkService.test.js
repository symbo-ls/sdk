import test from 'tape'
import sinon from 'sinon'
import { ShareLinkService, SHARE_DEFAULT_EXPIRY_DAYS } from '../../ShareLinkService.js'
import { BaseService } from '../../BaseService.js'

// PUBLIC-SHARE-LINKS-1 — the SDK half of public share links.
//
// The assertions that matter here are the ones a careless refactor would
// break silently, turning a safe default into a leak:
//   - `expiresInDays` stays TRI-STATE (omitted ≠ null). Coalescing them
//     turns the 30-day default into "never expires".
//   - `getSharedResource` is in the no-auth-header set, so the recipient's
//     read never rides the sharer's bearer token.
//   - revoke is a POST to /revoke, never a DELETE (the row is the audit
//     record of the share).

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new ShareLinkService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('createShareLink POSTs /share-links with the target', async (t) => {
  t.plan(4)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.createShareLink({ targetType: 'note', targetId: 'n1' })
  t.equal(stub.firstCall.args[0], 'createShareLink', 'methodName')
  t.equal(stub.firstCall.args[1], '/share-links', 'path')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST')
  t.deepEqual(
    stub.firstCall.args[2].body,
    { targetType: 'note', targetId: 'n1' },
    'no expiresInDays key when the caller named none'
  )
  sandbox.restore()
  t.end()
})

test('createShareLink keeps expiresInDays tri-state — omitted is NOT null', async (t) => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.createShareLink({ targetType: 'file', targetId: 'f1' })
  await svc.createShareLink({ targetType: 'file', targetId: 'f1', expiresInDays: null })
  await svc.createShareLink({ targetType: 'file', targetId: 'f1', expiresInDays: 7 })
  const bodies = stub.getCalls().map((c) => c.args[2].body)
  t.equal(
    'expiresInDays' in bodies[0],
    false,
    'omitted → the key is absent so the server applies its 30-day default'
  )
  t.equal(bodies[1].expiresInDays, null, 'explicit null → never')
  t.equal(bodies[2].expiresInDays, 7, 'a number passes through')
  sandbox.restore()
  t.end()
})

test('createShareLink validates its target', async (t) => {
  t.plan(2)
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.createShareLink({ targetId: 'n1' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/targetType/.test(err.message), 'targetType guard')
  }
  try {
    await svc.createShareLink({ targetType: 'note' })
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/targetId/.test(err.message), 'targetId guard')
  }
  sandbox.restore()
  t.end()
})

test('listShareLinks GETs /share-links with both filters', async (t) => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ data: [] })
  await svc.listShareLinks({ targetType: 'file', targetId: 'f/1' })
  t.equal(stub.firstCall.args[0], 'listShareLinks', 'methodName')
  t.equal(
    stub.firstCall.args[1],
    '/share-links?targetType=file&targetId=f%2F1',
    'both filters, id encoded'
  )
  sandbox.restore()
  t.end()
})

test('revokeShareLink POSTs /:id/revoke — never DELETEs the row', async (t) => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.revokeShareLink('link/1')
  t.equal(stub.firstCall.args[0], 'revokeShareLink', 'methodName')
  t.equal(stub.firstCall.args[1], '/share-links/link%2F1/revoke', 'encoded id + /revoke')
  t.equal(stub.firstCall.args[2].method, 'POST', 'POST, not DELETE')
  sandbox.restore()
  t.end()
})

test('getSharedResource GETs the public /share/:token', async (t) => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getSharedResource('tok/en')
  t.equal(stub.firstCall.args[0], 'getSharedResource', 'methodName')
  t.equal(stub.firstCall.args[1], '/share/tok%2Fen', 'encoded token')
  sandbox.restore()
  t.end()
})

test('getSharedResource is exempt from the bearer-token header', (t) => {
  t.plan(2)
  const svc = makeService()
  t.equal(
    svc._requiresInit('getSharedResource'),
    false,
    'the recipient read must not attach the sharer session'
  )
  t.equal(
    svc._requiresInit('createShareLink'),
    true,
    'minting a link still requires the caller session'
  )
  sandbox.restore()
  t.end()
})

test('getSharedResourceContentUrl points at the API, never at storage', (t) => {
  t.plan(2)
  const svc = makeService()
  svc._apiUrl = 'https://api.example.test'
  const url = svc.getSharedResourceContentUrl('tok en')
  t.equal(url, 'https://api.example.test/core/share/tok%20en/content', 'encoded token')
  t.equal(/storage|googleapis|bucket/.test(url), false, 'no storage host')
  sandbox.restore()
  t.end()
})

test('shareUrl composes the recipient link from a caller-supplied origin', (t) => {
  t.plan(4)
  const svc = makeService()
  t.equal(svc.shareUrl('/s/abc', 'https://app.test'), 'https://app.test/s/abc', 'path + origin')
  t.equal(svc.shareUrl('abc', 'https://app.test/'), 'https://app.test/s/abc', 'bare token, trailing slash trimmed')
  t.equal(svc.shareUrl('/s/abc'), '/s/abc', 'no origin → the relative path')
  try {
    svc.shareUrl()
    t.fail('should have thrown')
  } catch (err) {
    t.ok(/token/.test(err.message), 'guard')
  }
  sandbox.restore()
  t.end()
})

test('the default expiry the UI shows matches the server contract', (t) => {
  t.plan(1)
  t.equal(SHARE_DEFAULT_EXPIRY_DAYS, 30, 'Nika Q2: 30-day default, finite by design')
  t.end()
})

test('ShareLinkService is a BaseService', (t) => {
  t.plan(1)
  t.ok(new ShareLinkService() instanceof BaseService, 'extends BaseService')
  t.end()
})

// CORE-DOCS-GETONE-STRICTER-THAN-LIST-1 — the OWNER plane must carry the tab's
// tenant, exactly like `DocService._scopeQuery()`. The server resolves the
// share target through the docs read predicate; without an explicit scope it
// falls back to the caller's global `activeOrganization` claim, so a tab on
// org A could not mint a link for a note that same tab had just listed.
test('owner-plane calls carry the tab tenant scope (workspaceId + orgId)', async (t) => {
  t.plan(4)
  const svc = makeService()
  svc._context = { activeOrgId: 'org-A', activeWorkspaceId: 'ws-1' }
  const stub = sandbox.stub(svc, '_call').resolves({})

  await svc.createShareLink({ targetType: 'note', targetId: 'n1' })
  t.equal(
    stub.getCall(0).args[1],
    '/share-links?workspaceId=ws-1&orgId=org-A',
    'createShareLink carries the scope'
  )

  await svc.listShareLinks({ targetType: 'file', targetId: 'f/1' })
  t.equal(
    stub.getCall(1).args[1],
    '/share-links?targetType=file&targetId=f%2F1&workspaceId=ws-1&orgId=org-A',
    'listShareLinks keeps its filters AND carries the scope'
  )

  await svc.revokeShareLink('sl-1')
  t.equal(
    stub.getCall(2).args[1],
    '/share-links/sl-1/revoke?workspaceId=ws-1&orgId=org-A',
    'revokeShareLink carries the scope'
  )

  // The PUBLIC plane is unauthenticated — the token is the authority, and a
  // tenant hint there would be noise at best and an oracle at worst.
  await svc.getSharedResource('tok-1')
  t.equal(stub.getCall(3).args[1], '/share/tok-1', 'public read carries NO tenant scope')

  sandbox.restore()
  t.end()
})
