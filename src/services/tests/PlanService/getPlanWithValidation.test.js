/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { PlanService } from '../../PlanService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('getPlanWithValidation should return response data', async t => {
  t.plan(1)
  const responseStub = [sandbox.stub()]
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlan').resolves(responseStub)
  const response = await planServiceStub.getPlanWithValidation(
    'Plan ID Test String'
  )
  t.equal(response, responseStub, 'Response data returned')

  sandbox.restore()
  t.end()
})

test('getPlanWithValidation should return an error - null causes Invalid plan data received', async t => {
  t.plan(1)
  const responseStub = null
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlan').resolves(responseStub)

  try {
    await planServiceStub.getPlanWithValidation('Plan ID Test String')
  } catch (err) {
    t.ok(
      err.toString().includes('Invalid plan data received'),
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('getPlanWithValidation should return an error - string causes Invalid plan data received', async t => {
  t.plan(1)
  const responseStub = 'Not an object'
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlan').resolves(responseStub)

  try {
    await planServiceStub.getPlanWithValidation('Plan ID Test String')
  } catch (err) {
    t.ok(
      err.toString().includes('Invalid plan data received'),
      'Error correctly returned'
    )
  }
  sandbox.restore()
  t.end()
})

test('getPlanWithValidation should return an error - Plan ID must be a valid string', async t => {
  t.plan(1)
  const responseStub = null
  const planServiceStub = new PlanService()
  sandbox.stub(planServiceStub, 'getPlan').resolves(responseStub)

  try {
    await planServiceStub.getPlanWithValidation(undefined)
  } catch (err) {
    t.ok(
      err.toString().includes('Plan ID must be a valid string'),
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
