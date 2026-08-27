// WHITELABEL-ARCH-FOLLOWUP-1 — the white-label domain wrappers, and the
// tier-lock reader every upsell in every consumer reads a 402 through.
//
// Why these routes needed SDK methods at all: `bun run check-drift` listed all
// three (`GET/POST /core/organizations/:id/custom-domains`, `POST
// .../:domain/verify`) as MISSING_IN_SDK, which is the state that pushes a
// consumer toward a raw fetch. The URL assertions below are literal on
// purpose — the drift analyzer only sees template literals AT the call site.

import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'
import { readTierLock, isTierLocked } from '../../../utils/tierLock.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('listOrgCustomDomains — literal path, GET', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { customDomains: [] } })
  await svc.listOrgCustomDomains('org1')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/custom-domains', 'literal path')
  t.equal(opts.method, 'GET', 'method GET')
  sandbox.restore()
  t.end()
})

test('attachOrgCustomDomain — POSTs domain + workspaceId to the literal path', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { customDomains: [{ domain: 'app.x.test' }] } })
  const out = await svc.attachOrgCustomDomain('org1', {
    domain: 'app.x.test',
    workspaceId: 'ws1'
  })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/custom-domains', 'literal path')
  t.deepEqual(JSON.parse(opts.body), { domain: 'app.x.test', workspaceId: 'ws1' }, 'body')
  t.deepEqual(out, { customDomains: [{ domain: 'app.x.test' }] }, 'envelope unwrapped')
  sandbox.restore()
  t.end()
})

test('attachOrgCustomDomain — refuses locally without domain or workspaceId', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.attachOrgCustomDomain('org1', { workspaceId: 'ws1' }).catch(e => {
    t.match(e.message, /domain is required/, 'domain required')
  })
  await svc.attachOrgCustomDomain('org1', { domain: 'a.test' }).catch(e => {
    t.match(e.message, /workspaceId is required/, 'workspaceId required')
  })
  t.equal(requestStub.callCount, 0, 'no request was sent')
  sandbox.restore()
  t.end()
})

test('verifyOrgCustomDomain — encodes the domain into the literal path', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { customDomains: [] } })
  await svc.verifyOrgCustomDomain('org1', 'app.x.test')
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/custom-domains/app.x.test/verify', 'literal path')
  t.equal(opts.method, 'POST', 'method POST')
  sandbox.restore()
  t.end()
})

// ── readTierLock — the contract the UI upsell renders ───────────────────────

test('readTierLock — reads capability_locked off a 402 the server sent', t => {
  t.plan(5)
  const err = new Error('locked', {
    cause: {
      error: 'capability_locked',
      capability: 'whitelabel_domain',
      tier: 'scale',
      requiredTier: 'enterprise',
      requiredTierName: 'Enterprise',
      message: "The 'whitelabel_domain' capability is not available on the scale tier."
    }
  })
  err.status = 402
  const lock = readTierLock(err)
  t.equal(lock.capability, 'whitelabel_domain', 'capability')
  t.equal(lock.tier, 'scale', "the org's real tier")
  t.equal(lock.requiredTier, 'enterprise', 'required tier key')
  t.equal(lock.requiredTierName, 'Enterprise', 'required tier display name')
  t.ok(isTierLocked(err), 'isTierLocked agrees')
  t.end()
})

test('readTierLock — a service tier_locked 402 reads too, with null capability', t => {
  t.plan(2)
  const err = new Error('white-label workspace domains require the enterprise tier', {
    cause: { error: 'tier_locked', message: 'white-label workspace domains require it' }
  })
  err.status = 402
  const lock = readTierLock(err)
  t.equal(lock.error, 'tier_locked', 'error code')
  t.equal(lock.capability, null, 'no capability on a service-thrown lock')
  t.end()
})

test('readTierLock — a NON-402 failure is not an upsell', t => {
  t.plan(4)
  const notFound = new Error('nope')
  notFound.status = 404
  t.equal(readTierLock(notFound), null, '404 is not a lock')
  t.equal(isTierLocked(notFound), false, 'isTierLocked false')
  t.equal(readTierLock(new Error('network down')), null, 'a transport error is not a lock')
  t.equal(readTierLock(null), null, 'null is not a lock')
  t.end()
})

test('readTierLock — a 402 with an unparsable body still degrades to an upsell', t => {
  t.plan(3)
  const err = new Error('Payment required')
  err.status = 402
  const lock = readTierLock(err)
  t.ok(lock, 'a 402 IS the tier plane, whatever the body says')
  t.equal(lock.requiredTier, null, 'no invented tier name')
  t.equal(lock.message, 'Payment required', 'falls back to the error message')
  t.end()
})
