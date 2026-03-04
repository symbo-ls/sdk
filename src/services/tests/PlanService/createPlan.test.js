/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('createPlan should return response data', async t => {
  t.plan(1)

  const planDataStub = {
    success: true,
    data: sandbox.stub()
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_request').resolves(planDataStub)
  sandbox.stub(planServiceStub, '_requireReady').resolves()
  const response = await planServiceStub.createPlan([])
  t.equal(response, planDataStub.data, 'Response data returned')

  sandbox.restore()
  t.end()
})

function planDataValidation () {
  const badData = {
    falseValue: false,
    undefinedValue: undefined,
    stringValue: 'testString'
  }
  Object.keys(badData).forEach(key => {
    test(`createPlan should return an error for ${key} - Plan data is required`, async t => {
      t.plan(1)
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, '_requireReady').resolves()

      try {
        await planServiceStub.createPlan(badData[key])
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
  })
}

test('createPlan should return an error - Failed to parse URL', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, '_requireReady').resolves()

  try {
    await planServiceStub.createPlan([])
    t.fail('createPlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to create plan: Request failed: Failed to parse URL from null/core/admin/plans',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('createPlan should fail the requireReady', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox
    .stub(planServiceStub, '_requireReady')
    .throws(() => new Error('Service not initialized for method: createPlan'))

  try {
    await planServiceStub.createPlan()
    t.fail('createPlan should have failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Service not initialized for method: createPlan',
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

planDataValidation()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
