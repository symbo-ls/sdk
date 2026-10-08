import test from 'tape'
import sinon from 'sinon'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { OrganizationService } from '../../OrganizationService.js'

// Org invitations: the email invitation (unchanged) and the LINK invitation
// (INVITE-MAGIC-LINK-1 — "share by magic link"). Both POST to the same route;
// the server tells them apart by `kind`, and only the link omits the email.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

// createOrgInvitation (unchanged) --------------------------------------------

test('createOrgInvitation POSTs { email, role, teams } to /organizations/:orgId/invitations', async t => {
  t.plan(4)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { _id: 'inv1', inviteUrl: 'https://x/accept-org-invite?token=t', emailSent: true } })
  const data = await svc.createOrgInvitation('o1', { email: 'a@b.co', role: 'admin' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/invitations', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ email: 'a@b.co', role: 'admin' }), 'body is the email invitation, no kind')
  t.equal(data.inviteUrl, 'https://x/accept-org-invite?token=t', 'returns the data envelope')
  sandbox.restore()
  t.end()
})

test('createOrgInvitation still requires an email', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  try { await svc.createOrgInvitation('o1', { role: 'member' }) } catch (err) {
    t.equal(err.message, 'email is required', 'validation')
  }
  t.equal(requestStub.callCount, 0, 'no request without an email')
  sandbox.restore()
  t.end()
})

// createOrgInvitationLink ----------------------------------------------------

test('createOrgInvitationLink POSTs { kind: link, role } — no email', async t => {
  t.plan(5)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: { _id: 'inv2', kind: 'link', role: 'maintainer', expiresAt: '2026-10-16T00:00:00.000Z', inviteUrl: 'https://x/accept-org-invite?token=l' }
  })
  const data = await svc.createOrgInvitationLink('o1', { role: 'maintainer' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/invitations', 'the same route as the email invitation')
  t.equal(opts.method, 'POST', 'method POST')
  t.equal(opts.body, JSON.stringify({ kind: 'link', role: 'maintainer' }), 'body names the kind and the role only')
  t.equal(opts.methodName, 'createOrgInvitationLink', 'its own method name')
  t.deepEqual(
    { kind: data.kind, inviteUrl: data.inviteUrl, expiresAt: data.expiresAt },
    { kind: 'link', inviteUrl: 'https://x/accept-org-invite?token=l', expiresAt: '2026-10-16T00:00:00.000Z' },
    'returns the row with its one-time inviteUrl'
  )
  sandbox.restore()
  t.end()
})

test('createOrgInvitationLink defaults the role to member', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.createOrgInvitationLink('o1')
  t.equal(requestStub.firstCall.args[1].body, JSON.stringify({ kind: 'link', role: 'member' }), 'member by default')
  sandbox.restore()
  t.end()
})

test('createOrgInvitationLink requires an orgId and sends nothing without it', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  try { await svc.createOrgInvitationLink() } catch (err) {
    t.equal(err.message, 'orgId is required', 'validation')
  }
  t.equal(requestStub.callCount, 0, 'no request')
  sandbox.restore()
  t.end()
})

test('createOrgInvitationLink surfaces the server refusal', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'Cannot grant role \'admin\' at your current rank' })
  try { await svc.createOrgInvitationLink('o1', { role: 'admin' }) } catch (err) {
    t.equal(err.message, 'Cannot grant role \'admin\' at your current rank', 'message passes through')
  }
  sandbox.restore()
  t.end()
})

// listOrgInvitations / revokeOrgInvitation (reused by the panel's link list) --

test('listOrgInvitations GETs /organizations/:orgId/invitations', async t => {
  t.plan(3)
  const svc = makeService()
  const rows = [{ _id: 'inv2', kind: 'link', role: 'member', expiresAt: '2026-10-16T00:00:00.000Z' }]
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: rows })
  const data = await svc.listOrgInvitations('o1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/invitations', 'URL matches')
  t.equal(opts.method, 'GET', 'method GET')
  t.deepEqual(data, rows, 'returns the rows')
  sandbox.restore()
  t.end()
})

test('revokeOrgInvitation POSTs .../invitations/:inviteId/revoke', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { status: 'revoked' } })
  await svc.revokeOrgInvitation('o1', 'inv2')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/o1/invitations/inv2/revoke', 'URL matches')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

// The facade ---------------------------------------------------------------
//
// `sdk.createOrgInvitationLink(…)` exists only if SERVICE_METHODS routes it to
// the organization service (src/index.js builds one proxy per entry). Probed
// in a CHILD process on a real SDK — a fresh module graph — with `_request`
// replaced on the live service instance, so no request leaves it.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const CHILD = `
const { SDK } = await import(${JSON.stringify(`${SRC}/index.js`)})
const sdk = new SDK({ apiUrl: 'http://localhost:0/api' })
await sdk.initialize({})
const out = { proxy: typeof sdk.createOrgInvitationLink === 'function' }
const svc = sdk.getService('organization')
const calls = []
svc._requireReady = () => {}
svc._request = async (endpoint, init) => {
  calls.push([endpoint, init.method, init.body])
  return { success: true, data: { kind: 'link', inviteUrl: 'https://x/accept-org-invite?token=l' } }
}
if (out.proxy) out.result = await sdk.createOrgInvitationLink('o1', { role: 'admin' })
out.calls = calls
process.stdout.write(JSON.stringify(out))
process.exit(0)
`

test('sdk.createOrgInvitationLink reaches the organization service through the SDK facade', t => {
  t.plan(3)
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const out = JSON.parse(raw.slice(raw.indexOf('{')))
  t.equal(out.proxy, true, 'the facade has the method')
  t.deepEqual(
    out.calls,
    [['/organizations/o1/invitations', 'POST', JSON.stringify({ kind: 'link', role: 'admin' })]],
    'one POST with the link body'
  )
  t.equal(out.result?.kind, 'link', 'the data envelope comes back')
  t.end()
})
