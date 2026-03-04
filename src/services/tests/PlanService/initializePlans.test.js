import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('initializePlans should return response data', async t => {
  t.plan(1)

  const planDataStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(planDataStub)
  sandbox.stub(planServiceStub, '_requireReady').resolves()
  const response = await planServiceStub.initializePlans()
  t.equal(response, planDataStub, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('initializePlans should return an error - Failed to parse URL', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.initializePlans()
    t.fail('initializePlans should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to initialize plans: Request failed: Failed to parse URL from null/core/admin/plans/initialize',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('initializePlans should fail the requireReady', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox
    .stub(planServiceStub, '_requireReady')
    .throws(
      () => new Error('Service not initialized for method: initializePlans')
    )

  try {
    await planServiceStub.initializePlans()
    t.fail('initializePlans should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Service not initialized for method: initializePlans',
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
