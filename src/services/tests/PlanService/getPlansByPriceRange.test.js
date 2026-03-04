/* eslint-disable no-undefined */
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
    pricing: {
      bestPrice: {
        amount: 1
      }
    }
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlansWithPricing').resolves([responseStub])
  const response = await planServiceStub.getPlansByPriceRange()
  t.equal(
    response[0].pricing.bestPrice.amount,
    responseStub.pricing.bestPrice.amount,
    'Response data matches stubbed data'
  )
  sandbox.restore()
  t.end()
})

function noPricingAmount () {
  const noPriceAmounts = [
    {
      name: 'undefined',
      amount: undefined
    },
    {
      name: 'null',
      amount: null
    },
    {
      name: 'less than the minimum',
      amount: 1
    },
    {
      name: 'more than the maximum',
      amount: 20
    },
    {
      name: 'a string',
      amount: 'test string'
    },
    {
      name: 'an object',
      amount: {}
    }
  ]
  for (let ii = 0; ii < noPriceAmounts.length; ii++) {
    test(`getPlansWithPricing should return an empty response when the amount entered is ${noPriceAmounts[ii].name}`, async t => {
      t.plan(1)
      const responseStub = {
        pricing: {
          bestPrice: {}
        }
      }
      responseStub.pricing.bestPrice.amount = noPriceAmounts[ii].amount
      const planServiceStub = new PlanService()
      sandbox
        .stub(planServiceStub, 'getPlansWithPricing')
        .resolves([responseStub])
      const response = await planServiceStub.getPlansByPriceRange(5, 10)
      t.equal(
        response.length,
        0,
        `Response is an empty array when entered amount is: ${responseStub.pricing.bestPrice.amount}`
      )
      sandbox.restore()
      t.end()
    })
  }
}

test('getPlans should return an error', async t => {
  t.plan(1)
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlansWithPricing').throws('Test Error')
  try {
    await planServiceStub.getPlansByPriceRange()
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to get plans by price range: Sinon-provided Test Error',
      'Error caught and correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

noPricingAmount()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
