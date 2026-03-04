import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getPlan should return response data', async t => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)
  const response = await planServiceStub.getPlan(true)
  t.equal(response, responseStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getPlan should return an error', async t => {
  t.plan(1)
  const responseStub = {
    success: false,
    data: sandbox.stub(),
    message: 'Error: Plan ID is required'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(responseStub)

  try {
    await planServiceStub.getPlan()
  } catch (err) {
    t.equal(err.toString(), responseStub.message, 'Error correctly returned')
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
