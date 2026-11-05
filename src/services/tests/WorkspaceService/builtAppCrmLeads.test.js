import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// "CRM leads, opt-in per app" (Nika 2026-10-30): a built app's owner / admin
// reads and flips its "send sign-ups to CRM" setting.
//   GET   /workspaces/:workspaceId/built-apps/:projectId/crm-leads
//   PATCH /workspaces/:workspaceId/built-apps/:projectId/crm-leads { enabled }
// Both reply { success, data: { projectId, enabled, signupForms, crmInstalled,
// active, reason, updatedAt } }; `_call` unwraps `data`.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}
const VIEW = {
  projectId: 'p1',
  enabled: true,
  signupForms: [{ collection: 'signups', fields: { email: 'email' } }],
  crmInstalled: true,
  active: true,
  reason: null,
  updatedAt: '2026-10-30T10:00:00.000Z'
}

test('built-app CRM lead methods are flat-exposed by the SDK', t => {
  t.equal(SERVICE_METHODS.getBuiltAppCrmLeads, 'workspace')
  t.equal(SERVICE_METHODS.setBuiltAppCrmLeads, 'workspace')
  t.end()
})

test('getBuiltAppCrmLeads GETs the setting and unwraps data', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: VIEW })
  const out = await svc.getBuiltAppCrmLeads('w1', 'p1')
  const [endpoint, opts] = stub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/built-apps/p1/crm-leads')
  t.equal(opts.method, 'GET')
  t.deepEqual(out, VIEW)
  sandbox.restore()
  t.end()
})

test('setBuiltAppCrmLeads PATCHes { enabled } as a boolean', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: VIEW })
  const out = await svc.setBuiltAppCrmLeads('w1', 'p1', { enabled: true })
  const [endpoint, opts] = stub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/built-apps/p1/crm-leads')
  t.equal(opts.method, 'PATCH')
  t.deepEqual(JSON.parse(opts.body), { enabled: true })
  t.deepEqual(out, VIEW)
  sandbox.restore()
  t.end()
})

test('the methods refuse missing ids and a non-boolean enabled', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: VIEW })
  for (const fn of [
    () => svc.getBuiltAppCrmLeads('', 'p1'),
    () => svc.getBuiltAppCrmLeads('w1'),
    () => svc.setBuiltAppCrmLeads('w1', 'p1', { enabled: 'yes' }),
    () => svc.setBuiltAppCrmLeads('w1', 'p1')
  ]) {
    try {
      await fn()
      t.fail('should throw')
    } catch (err) {
      t.ok(err instanceof Error, err.message)
    }
  }
  t.equal(stub.callCount, 0, 'no request sent')
  sandbox.restore()
  t.end()
})
