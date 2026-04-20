import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

function makeStub () {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: 'ok' })
  return { svc, stub }
}

test('getCreditPool hits /organizations/:id/credit-pool with GET', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.getCreditPool('org-1')
  t.equal(stub.firstCall.args[0], '/organizations/org-1/credit-pool')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('updateCreditPool PATCHes with { pooledCredits }', async t => {
  t.plan(3)
  const { svc, stub } = makeStub()
  await svc.updateCreditPool('org-1', 5000)
  t.equal(stub.firstCall.args[0], '/organizations/org-1/credit-pool')
  t.equal(stub.firstCall.args[1].method, 'PATCH')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { pooledCredits: 5000 })
  sandbox.restore()
  t.end()
})

test('getSso hits /organizations/:id/sso with GET', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.getSso('org-1')
  t.equal(stub.firstCall.args[0], '/organizations/org-1/sso')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('updateSso PATCHes with sso payload', async t => {
  t.plan(3)
  const { svc, stub } = makeStub()
  await svc.updateSso('org-1', { provider: 'okta', metadata: 'x' })
  t.equal(stub.firstCall.args[0], '/organizations/org-1/sso')
  t.equal(stub.firstCall.args[1].method, 'PATCH')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { provider: 'okta', metadata: 'x' })
  sandbox.restore()
  t.end()
})

test('getScim hits /organizations/:id/scim with GET', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.getScim('org-1')
  t.equal(stub.firstCall.args[0], '/organizations/org-1/scim')
  t.equal(stub.firstCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('updateScim only forwards provided keys', async t => {
  t.plan(2)
  const { svc, stub } = makeStub()
  await svc.updateScim('org-1', { enabled: true })
  t.equal(stub.firstCall.args[0], '/organizations/org-1/scim')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { enabled: true })
  sandbox.restore()
  t.end()
})

test('updateScim supports rotateToken flag', async t => {
  t.plan(1)
  const { svc, stub } = makeStub()
  await svc.updateScim('org-1', { rotateToken: true })
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { rotateToken: true })
  sandbox.restore()
  t.end()
})

test('credit-pool/sso/scim methods throw without orgId', async t => {
  const methods = ['getCreditPool', 'updateCreditPool', 'getSso', 'updateSso', 'getScim', 'updateScim']
  t.plan(methods.length)
  for (const m of methods) {
    const svc = new OrganizationService()
    sandbox.stub(svc, '_requireReady').resolves()
    try {
      await svc[m](undefined, {})
      t.fail(`${m} should have thrown`)
    } catch (err) {
      t.equal(err.message, 'orgId is required', `${m} rejects missing orgId`)
    }
    sandbox.restore()
  }
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
