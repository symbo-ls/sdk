import test from 'tape'
import sinon from 'sinon'
import { FeatureFlagService } from '../../FeatureFlagService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getFeatureFlags should return response data', async t => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: { flags: { new_ui: { enabled: true, variant: null, payload: null } } }
  }
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()
  sandbox.stub(service, '_request').resolves(responseStub)

  const response = await service.getFeatureFlags()
  t.equal(response, responseStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getFeatureFlags should pass keys query param', async t => {
  t.plan(1)
  const responseStub = { success: true, data: { flags: {} } }
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves(responseStub)

  await service.getFeatureFlags({ keys: ['new_ui', 'checkout_experiment'] })
  t.ok(
    requestStub.firstCall.args[0].includes('/feature-flags?keys=new_ui%2Ccheckout_experiment'),
    'Keys query param included'
  )

  sandbox.restore()
  t.end()
})

test('getFeatureFlags should return an error', async t => {
  t.plan(1)
  const responseStub = {
    success: false,
    data: {},
    message: 'Negative getFeatureFlags Test'
  }
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()
  sandbox.stub(service, '_request').resolves(responseStub)

  try {
    await service.getFeatureFlags()
  } catch (err) {
    t.ok(
      err.toString().includes(`Failed to get feature flags: ${responseStub.message}`),
      'Error correctly returned'
    )
  }

  sandbox.restore()
  t.end()
})
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion

