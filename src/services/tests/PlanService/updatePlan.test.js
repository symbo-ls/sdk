import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('updatePlan should return response data', async t => {
  t.plan(1)

  const planDataStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(planDataStub)
  sandbox.stub(planServiceStub, '_requireReady').resolves()
  const response = await planServiceStub.updatePlan(true, [])
  t.equal(response, planDataStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('updatePlan should return an error - Plan data required', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.updatePlan(true, false)
    t.fail('createPlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Plan data is required',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('updatePlan should return an error - Plan ID required', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.updatePlan(false, [])
    t.fail('updatePlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Plan ID is required',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('updatePlan should return an error - Failed to parse URL', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.updatePlan(true, [])
    t.fail('updatePlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to update plan: Request failed: Failed to parse URL from null/core/admin/plans/true',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('updatePlan should fail the requireReady', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox
    .stub(planServiceStub, '_requireReady')
    .throws(() => new Error('Service not initialized for method: updatePlan'))

  try {
    await planServiceStub.updatePlan()
    t.fail('updatePlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Service not initialized for method: updatePlan',
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
