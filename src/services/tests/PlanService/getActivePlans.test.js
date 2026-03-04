/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getActivePlans should return active plans', async t => {
  t.plan(3)
  const numActivePlans = 2
  const plansStub = [
    {
      plan: 'plan1',
      status: 'active',
      isVisible: true
    },
    {
      plan: 'plan2',
      status: 'inactive',
      isVisible: false
    },
    {
      plan: 'plan3',
      status: 'active',
      isVisible: true
    }
  ]
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlans').resolves(plansStub)
  const response = await planServiceStub.getActivePlans()

  t.equal(
    response.length,
    numActivePlans,
    'Correct number of active plans returned'
  )
  t.equal(
    response[0].plan,
    plansStub[0].plan,
    'First plan successfully returned'
  )
  t.equal(
    response[1].plan,
    plansStub[2].plan,
    'Third plan successfully returned'
  )
})

function planFilter () {
  const badPlans = [
    {
      plan: 'status is inactive and isVisible is false',
      status: 'inactive',
      isVisible: false
    },
    {
      plan: 'status is active and isVisible is false',
      status: 'active',
      isVisible: false
    },
    {
      plan: 'status is undefined and isVisible is true',
      status: undefined,
      isVisible: true
    },
    {
      plan: 'status is undefined and isVisible is false',
      status: undefined,
      isVisible: false
    },
    {
      plan: 'status is null and isVisible is true',
      status: null,
      isVisible: true
    },
    {
      plan: 'status is null and isVisible is false',
      status: null,
      isVisible: false
    },
    {
      plan: 'status is active and isVisible is undefined',
      status: 'active',
      isVisible: undefined
    },
    {
      plan: 'status is active and isVisible is null',
      status: 'active',
      isVisible: null
    },
    {
      plan: 'status is a number and isVisible is true',
      status: 123,
      isVisible: true
    }
  ]
  for (let ii = 0; ii < badPlans.length; ii++) {
    test(`getActivePlans should return no plans using ${badPlans[ii].plan}`, async t => {
      t.plan(1)
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'getPlans').resolves([badPlans[ii]])
      const response = await planServiceStub.getActivePlans()
      t.equal(
        response.length,
        0,
        `No active plans returned when ${badPlans[ii].plan}`
      )
    })
  }
}

planFilter()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
