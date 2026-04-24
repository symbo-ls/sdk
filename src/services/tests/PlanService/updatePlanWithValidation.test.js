/* eslint-disable no-useless-escape */
/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('updatePlanWithValidation should return response data', async t => {
  t.plan(1)
  const responseStub = [sandbox.stub()]
  const testData = {
    planId: 'testString',
    planData: {
      name: 'testName',
      key: 'testkey'
    }
  }
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
  const response = await planServiceStub.updatePlanWithValidation(
    testData.planId,
    testData.planData
  )
  t.ok(response, 'Response returned successfully')

  sandbox.restore()
  t.end()
})

function planIdEmptyOrNotAString () {
  // Data test object
  const badData = {
    planIdUndefined: {
      name: 'planId is undefined',
      testValue: undefined
    },
    planIdIsNull: {
      name: 'planId is null',
      testValue: null
    },
    planIdIsAnObject: {
      name: 'planId is an object',
      testValue: {}
    },
    planIdIsANumber: {
      name: 'planId is number',
      testValue: 123
    }
  }

  Object.keys(badData).forEach(key => {
    test(`updatePlanWithValidation should return an error - ${badData[key].name}`, async t => {
      t.plan(1)
      const planData = {
        name: 'testName',
        key: 'testkey'
      }
      const planId = badData[key].testValue
      const planServiceStub = new PlanService()
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('updatePlanWithValidation should have failed')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Plan ID must be a valid string',
          `${badData[key].name} successfully caused an error`
        )
      }
      sandbox.restore()
      t.end()
    })
  })
}

function planDataEmptyOrNotAnObject () {
  // Data test object
  const badData = {
    planDataUndefined: {
      name: 'planData is undefined',
      testValue: undefined
    },
    planDataIsNull: {
      name: 'planData is null',
      testValue: null
    },
    planDataIsAString: {
      name: 'planData is a string',
      testValue: 'test string'
    },
    planDataIsANumber: {
      name: 'planData is a string',
      testValue: 123
    }
  }

  Object.keys(badData).forEach(key => {
    test(`updatePlanWithValidation should return an error - ${badData[key].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = badData[key].testValue
      const planServiceStub = new PlanService()
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('updatePlanWithValidation should have failed')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Plan data must be a valid object',
          `${badData[key].name} successfully caused an error`
        )
      }
      sandbox.restore()
      t.end()
    })
  })
}

test('Price validation should throw an error when price field is present', async t => {
  t.plan(1)
  const planId = 'testString'
  const planData = {
    name: 'testName',
    description: 'test description',
    price: 1.0
  }
  const planServiceStub = new PlanService()
  try {
    await planServiceStub.updatePlanWithValidation(planId, planData)
    t.fail('Price validation successfully threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Field "price" is no longer supported. Use unified "pricingOptions" with "amount" instead.',
      'Price validation detected unsupported price field'
    )
  }
  sandbox.restore()
  t.end()
})

function pricingOptionsValidation () {
  // Data test object
  const planData = {
    name: 'testName',
    description: 'test description'
  }

  const badPricingOptions = {
    stringValue: 'test string',
    numberValue: 123,
    falseBooleanValue: false,
    trueBooleanValue: true,
    emptyArray: []
  }
  Object.keys(badPricingOptions).forEach(field => {
    test(`pricingOptions validation throws error for ${field}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const { ...testData } = planData
      testData.pricingOptions = badPricingOptions[field]
      const planServiceStub = new PlanService()
      try {
        await planServiceStub.updatePlanWithValidation(planId, testData)
        t.fail('updatePlanWithValidation failed - bad pricingOptions detected')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: pricingOptions must be a non-empty array when provided',
          `pricingOptions validation failed successfully on bad pricingOptions data: ${field}`
        )
      }
      sandbox.restore()
      t.end()
    })
  })
}

function keyTypeValidation () {
  const badKeyData = [
    { name: 'array value', key: [] },
    { name: 'number value', key: 123 },
    { name: 'null value', key: null },
    { name: 'undefined value', key: undefined },
    { name: 'false boolean value', key: false }
  ]
  for (let ii = 0; ii < badKeyData.length; ii++) {
    test(`Key type validation should throw an error checking for: ${badKeyData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badKeyData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.ok(
          err
            .toString()
            .includes(
              "Error: Pricing option at index 0 is missing required field 'key'"
            ),
          `Key type validation detected bad data: ${badKeyData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function keyFormatValidation () {
  const badKeyData = [
    { name: 'capital letters', key: 'CAPITALLETTERS' },
    { name: 'special character', key: 'Special @ Character' },
    { name: 'under score', key: 'under_score' },
    { name: 'punctuation', key: 'syntax!' }
  ]
  for (let ii = 0; ii < badKeyData.length; ii++) {
    test(`Key format validation should throw an error checking for: ${badKeyData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badKeyData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          `Error: Pricing option key '${badKeyData[ii].key}' must contain only lowercase letters, numbers, and hyphens`,
          `Key format validation detected bad data: ${badKeyData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function displayNameValidation () {
  const badDisplayNameData = [
    {
      name: 'false boolean value',
      displayName: false,
      key: 'false-boolean-value'
    },
    { name: 'number value', displayName: 123, key: 'number-value' },
    { name: 'undefined value', displayName: undefined, key: 'undefined-value' },
    { name: 'null value', displayName: null, key: 'null-value' }
  ]
  for (let ii = 0; ii < badDisplayNameData.length; ii++) {
    test(`displayName validation should throw an error checking for: ${badDisplayNameData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badDisplayNameData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          `Error: Pricing option \'${badDisplayNameData[ii].key}\' is missing required field \'displayName\'`,
          `displayName validation detected bad data: ${badDisplayNameData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function amountValidation () {
  const badAmountData = [
    {
      name: 'negative amount value',
      displayName: 'test displayname',
      key: 'negative-amount-value',
      amount: -1
    },
    {
      name: 'letter value',
      displayName: 'test displayname',
      key: 'letter-value',
      amount: 'abc123'
    },
    {
      name: 'undefined value',
      displayName: 'test displayname',
      key: 'undefined-value',
      amount: undefined
    },
    {
      name: 'null value',
      displayName: 'test displayname',
      key: 'null-value',
      amount: null
    }
  ]
  for (let ii = 0; ii < badAmountData.length; ii++) {
    test(`amount validation should throw an error checking for: ${badAmountData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badAmountData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          `Error: Pricing option \'${badAmountData[ii].key}\' must have a non-negative numeric \'amount\'`,
          `amount validation detected bad data: ${badAmountData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function intervalValidation () {
  const badAmountData = [
    {
      name: 'number value',
      displayName: 'test displayname',
      key: 'number-amount-value',
      amount: 0,
      interval: 123
    },
    {
      name: 'unsupported string value',
      displayName: 'test displayname',
      key: 'letter-value',
      amount: 0,
      interval: 'abc123'
    },
    {
      name: 'undefined value',
      displayName: 'test displayname',
      key: 'undefined-value',
      amount: 0,
      interval: undefined
    }
  ]
  for (let ii = 0; ii < badAmountData.length; ii++) {
    test(`interval validation should throw an error checking for: ${badAmountData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badAmountData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          `Error: Pricing option \'${badAmountData[ii].key}\' has invalid interval \'${badAmountData[ii].interval}\'. Allowed: month, year, week, day or null`,
          `interval validation detected bad data: ${badAmountData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function lookupKeyValidation () {
  const badData = [
    {
      name: 'number value',
      displayName: 'test displayname',
      key: 'number-amount-value',
      amount: 0,
      interval: null,
      lookupKey: 123
    },
    {
      name: 'false boolean value',
      displayName: 'test displayname',
      key: 'letter-value',
      amount: 0,
      interval: null,
      lookupKey: false
    },
    {
      name: 'true boolean value',
      displayName: 'test displayname',
      key: 'letter-value',
      amount: 0,
      interval: null,
      lookupKey: true
    },
    {
      name: 'object value',
      displayName: 'test displayname',
      key: 'undefined-value',
      amount: 0,
      interval: null,
      lookupKey: {}
    },
    {
      name: 'undefined value',
      displayName: 'test displayname',
      key: 'undefined-value',
      amount: 0,
      interval: null,
      lookupKey: undefined
    },
    {
      name: 'null value',
      displayName: 'test displayname',
      key: 'undefined-value',
      amount: 0,
      interval: null,
      lookupKey: null
    }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`lookup key validation should throw an error checking for: ${badData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const planData = {
        name: 'testName',
        description: 'test description',
        pricingOptions: []
      }
      planData.pricingOptions.push(badData[ii])
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData)
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          `Error: Pricing option \'${badData[ii].key}\' is missing required field \'lookupKey\'`,
          `lookup key validation detected bad data: ${badData[ii].name}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function topLevelKeyValidation () {
  const planData = [
    {
      name: 'Uppercase letters',
      description: 'test description',
      key: 'ALLCAPS'
    },
    {
      name: 'Underscore character',
      description: 'test description',
      key: '_'
    },
    {
      name: 'Special characters',
      description: 'test description',
      key: '!@#$%'
    },
    {
      name: 'Object type',
      description: 'test description',
      key: {}
    },
    {
      name: 'Null value',
      description: 'test description',
      key: null
    }
  ]
  // Null-key hits an earlier validation branch with a different error
  // message (`Plan key must be a valid string` — see PlanService.js:
  // the null-gate runs before the format regex). Every other bad shape
  // hits the format-check branch with the lowercase-hyphen message.
  const expectedError = (name) =>
    name === 'Null value'
      ? 'Error: Plan key must be a valid string'
      : 'Error: Plan key must contain only lowercase letters, numbers, and hyphens'
  for (let ii = 0; ii < planData.length; ii++) {
    test(`top-level key validation should throw an error checking for: ${planData[ii].name}`, async t => {
      t.plan(1)
      const planId = 'testString'
      const responseStub = [sandbox.stub()]
      const planServiceStub = new PlanService()
      sandbox.stub(planServiceStub, 'updatePlan').resolves(responseStub)
      try {
        await planServiceStub.updatePlanWithValidation(planId, planData[ii])
        t.fail('Key type validation successfully threw an error')
      } catch (err) {
        t.equal(
          err.toString(),
          expectedError(planData[ii].name),
          `displayName validation detected bad data: ${planData[ii].name} with ${err}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

amountValidation()
displayNameValidation()
intervalValidation()
keyFormatValidation()
keyTypeValidation()
lookupKeyValidation()
planIdEmptyOrNotAString()
planDataEmptyOrNotAnObject()
pricingOptionsValidation()
topLevelKeyValidation()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
