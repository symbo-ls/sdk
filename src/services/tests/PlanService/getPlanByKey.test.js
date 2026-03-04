/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getPlanByKey should return response data', async t => {
  t.plan(1)
  const responseStub = {
    key: 'test123'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').resolves([responseStub])
  const response = await planServiceStub.getPlanByKey('test123')
  t.equal(response.key, responseStub.key, 'Response data matches stubbed data')
  sandbox.restore()
  t.end()
})

test('getPlanByKey should return a key not found error', async t => {
  t.plan(1)
  const responseStub = {
    key: 'test123'
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').resolves([responseStub])
  try {
    await planServiceStub.getPlanByKey('wrongKey123')
    t.fail('getPlanByKey key validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      "Error: Failed to get plan by key: Plan with key 'wrongKey123' not found",
      'Plan key not found validation successfully threw an error for a wrong key entered.'
    )
  }
  sandbox.restore()
  t.end()
})

test('getPlanByKey error handling catches and returns an error', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').throws('Test Error')
  try {
    await planServiceStub.getPlanByKey('test123')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to get plan by key: Sinon-provided Test Error',
      'Error handling caught and returned the correct error.'
    )
  }
  sandbox.restore()
  t.end()
})

function checkPlanKeyIsRequired () {
  const badPlanKeys = [
    {
      name: 'an undefined value',
      key: undefined
    },
    {
      name: 'a null',
      key: null
    },
    {
      name: 'an empty string',
      key: ''
    }
  ]
  for (let ii = 0; ii < badPlanKeys.length; ii++) {
    test(`getPlanByKey should demand a Plan key when the key entered is ${badPlanKeys[ii].name}`, async t => {
      t.plan(1)
      const responseStub = {
        key: 'test123'
      }
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'getPlans').resolves([responseStub])
      try {
        await planServiceStub.getPlanByKey(badPlanKeys[ii].key)
        t.fail('getPlanByKey key validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Plan key is required',
          `Key requirement validation successfully threw an error when ${badPlanKeys[ii].name} key is entered.`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

checkPlanKeyIsRequired()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
