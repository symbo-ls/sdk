// CORE-ORG-BRANDING-HAS-NO-WRITE-ROUTE-1 — the branding write wrapper.
// URL assertion is literal on purpose: the drift analyzer only sees
// template literals AT the `_request` call site (whitelabelCustomDomains.
// test.js documents the same convention for the sibling whitelabel routes).

import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('updateOrganizationBranding — PATCHes the literal branding path with the given body', async t => {
  t.plan(3)
  const svc = makeService()
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { name: 'Vault', accent: '#3366ff' } })
  const out = await svc.updateOrganizationBranding('org1', { name: 'Vault', accent: '#3366ff' })
  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/organizations/org1/branding', 'literal path')
  t.equal(opts.method, 'PATCH', 'method PATCH')
  t.deepEqual(out, { name: 'Vault', accent: '#3366ff' }, 'envelope unwrapped')
  sandbox.restore()
  t.end()
})

test('updateOrganizationBranding — refuses locally without orgId', async t => {
  t.plan(2)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: {} })
  await svc.updateOrganizationBranding(undefined, { name: 'x' }).catch(e => {
    t.match(e.message, /orgId is required/, 'orgId required')
  })
  t.equal(requestStub.callCount, 0, 'no request was sent')
  sandbox.restore()
  t.end()
})

test('updateOrganizationBranding — throws the server message on a non-success envelope', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'invalid_color' })
  await svc.updateOrganizationBranding('org1', { accent: 'nope' }).catch(e => {
    t.equal(e.message, 'invalid_color', 'server message surfaced')
  })
  sandbox.restore()
  t.end()
})
