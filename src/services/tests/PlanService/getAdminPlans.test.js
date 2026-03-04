import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getAdminPlans should return response data', async t => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)
  sandbox.stub(planServiceStub, '_requireReady').resolves()
  const response = await planServiceStub.getAdminPlans()
  t.equal(response, responseStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getAdminPlans should return an error', async t => {
  t.plan(1)
  const responseStub = {
    success: false,
    data: sandbox.stub(),
    message: 'Negative getAdminPlans Test'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.getAdminPlans()
  } catch (err) {
    t.ok(
      err
        .toString()
        .includes(`Failed to get admin plans: ${responseStub.message}`),
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('getAdminPlans should fail the requireReady', async t => {
  t.plan(1)
  const responseStub = {
    success: false,
    data: sandbox.stub(),
    message: 'Service not initialized for method: getAdminPlans'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)
  sandbox
    .stub(planServiceStub, '_requireReady')
    .throws(() => new Error(responseStub.message))

  try {
    await planServiceStub.getAdminPlans()
    t.fail('getAdminPlans should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      `Error: ${responseStub.message}`,
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
