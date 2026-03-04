/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { BranchService } from '../../BranchService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('deleteBranch should return response data', async t => {
  t.plan(2)
  const responseStub = {
    success: true,
    data: 'Test data response'
  }
  const branchDataMock = {
    name: 'Test_Branch_Name',
    branch: 'not_main'
  }
  const testProjectId = 'Test Project ID'
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
  const response = await branchServiceStub.deleteBranch(
    testProjectId,
    branchDataMock.branch
  )
  t.ok(response.success, 'Response successfully returned')
  t.equal(
    response.data,
    responseStub.data,
    'Actual response matches expected response'
  )
  sandbox.restore()
  t.end()
})

test('Branch name validation should throw an error when the branch is main', async t => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: 'Test data response'
  }
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
  try {
    await branchServiceStub.deleteBranch('Test Project ID', 'main')
    t.fail('Branch name validation threw an error with an invalid value')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Cannot delete main branch',
      'deleteBranch successfully threw an error when the main branch is deleted'
    )
  }
  sandbox.restore()
  t.end()
})

function checkProjectIdValidation () {
  const badData = [
    {
      testName: 'No Project ID'
    },
    {
      testName: 'Empty string',
      projectId: ''
    },
    {
      testName: 'False boolean value',
      projectId: false
    },
    {
      testName: 'Undefined value',
      projectId: undefined
    },
    {
      testName: 'Null value',
      projectId: null
    }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`Project ID validation should throw an error when: ${badData[ii].testName} is passed in`, async t => {
      t.plan(1)
      const responseStub = {
        success: true,
        data: 'Test data response'
      }
      const branchDataMock = {
        name: 'Test_Branch_Name',
        branch: 'not_main'
      }
      const testProjectId = badData[ii].projectId
      const branchServiceStub = new BranchService()
      sandbox.stub(branchServiceStub, '_requireReady').resolves()
      sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
      try {
        await branchServiceStub.deleteBranch(testProjectId, branchDataMock)
        t.fail('Project ID validation threw an error with an invalid value')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Project ID is required',
          `Project ID validation successfully threw an error with: ${badData[ii].testName}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function checkBranchDataNameValidation () {
  const badData = [
    {
      testName: 'No name'
    },
    {
      testName: 'Empty string',
      name: ''
    },
    {
      testName: 'False boolean value',
      name: false
    },
    {
      testName: 'Undefined value',
      name: undefined
    },
    {
      testName: 'Null value',
      name: null
    }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`Branch name validation should throw an error when: ${badData[ii].testName} is passed in`, async t => {
      t.plan(1)
      const responseStub = {
        success: true,
        data: 'Test data response'
      }
      const testProjectId = 'Test Project ID'
      const branchServiceStub = new BranchService()
      sandbox.stub(branchServiceStub, '_requireReady').resolves()
      sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
      try {
        await branchServiceStub.deleteBranch(testProjectId, badData[ii].name)
        t.fail('Branch name validation threw an error with an invalid value')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Branch name is required',
          `Branch name validation successfully threw an error with: ${badData[ii].testName}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

checkBranchDataNameValidation()
checkProjectIdValidation()
// #endregion

// #region Cleanup
test('teardown', t => {
  sandbox.restore()
  t.end()
})
// #endregion
