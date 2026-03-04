import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getPlansWithValidation should return response data', async t => {
  t.plan(1)
  const responseStub = [sandbox.stub()]
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').resolves(responseStub)
  const response = await planServiceStub.getPlansWithValidation()
  t.equal(response, responseStub, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getPlansWithValidation should return an error - plans should be an array', async t => {
  t.plan(1)
  const responseStub = null
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').resolves(responseStub)

  try {
    await planServiceStub.getPlansWithValidation()
  } catch (err) {
    t.ok(
      err
        .toString()
        .includes('Invalid response format: plans should be an array'),
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
