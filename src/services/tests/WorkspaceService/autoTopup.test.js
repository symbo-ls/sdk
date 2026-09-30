import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

test('auto-top-up methods use workspace routes and preserve explicit consent', async (t) => {
  const service = new WorkspaceService()
  const call = sinon.stub(service, '_call').resolves({ enabled: false })
  const rule = { amountCents: 2000, thresholdCredits: 200, monthlyLimitCents: 4000, consent: true, returnUrl: 'https://workspace.localhost:1355/admin/usage' }
  for (const [method, suffix] of [['getAutoTopup', ''], ['setupAutoTopup', '/setup'], ['pauseAutoTopup', '/pause'], ['refreshAutoTopup', '/refresh']]) {
    t.equal(SERVICE_METHODS[method], 'workspace', `${method} is exposed`)
    await service[method]('ws_test', rule)
    const args = call.lastCall.args
    t.equal(args[0], method)
    t.equal(args[1], `/workspaces/ws_test/billing/auto-topup${suffix}`)
    if (suffix) t.equal(args[2].method, 'POST')
    if (method === 'setupAutoTopup') t.deepEqual(args[2].body, rule)
    await service[method](null).then(() => t.fail('missing workspace accepted'), () => t.pass('requires workspace'))
  }
  call.restore()
  t.end()
})
