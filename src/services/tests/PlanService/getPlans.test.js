import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getPlans should return response data', async t => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)
  const response = await planServiceStub.getPlans()
  t.equal(response, responseStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getPlans should return an error', async t => {
  t.plan(1)
  const responseStub = {
    success: false,
    data: sandbox.stub(),
    message: 'Negative getPlans Test'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)

  try {
    await planServiceStub.getPlans()
  } catch (err) {
    t.ok(
      err.toString().includes(`Failed to get plans: ${responseStub.message}`),
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
