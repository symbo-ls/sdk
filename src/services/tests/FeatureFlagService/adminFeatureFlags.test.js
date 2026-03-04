import test from 'tape'
import sinon from 'sinon'
import { FeatureFlagService } from '../../FeatureFlagService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getAdminFeatureFlags should pass includeArchived=false', async t => {
  t.plan(1)
  const responseStub = { success: true, data: [] }
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()
  const requestStub = sandbox.stub(service, '_request').resolves(responseStub)

  await service.getAdminFeatureFlags({ includeArchived: false })
  t.equal(
    requestStub.firstCall.args[0],
    '/admin/feature-flags?includeArchived=false',
    'includeArchived=false included'
  )

  sandbox.restore()
  t.end()
})

test('createFeatureFlag should require key', async t => {
  t.plan(1)
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()

  try {
    await service.createFeatureFlag({ enabled: true })
    t.fail('Expected createFeatureFlag to throw without key')
  } catch (err) {
    t.equal(err.toString(), 'Error: Feature flag key is required', 'Key validation works')
  }

  sandbox.restore()
  t.end()
})

test('updateFeatureFlag should require id', async t => {
  t.plan(1)
  const service = new FeatureFlagService()
  sandbox.stub(service, '_requireReady').resolves()

  try {
    await service.updateFeatureFlag(null, { enabled: false })
    t.fail('Expected updateFeatureFlag to throw without id')
  } catch (err) {
    t.equal(err.toString(), 'Error: Feature flag id is required', 'Id validation works')
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

