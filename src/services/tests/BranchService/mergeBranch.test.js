/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { BranchService } from '../../BranchService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('mergeBranch should return response data', async (t) => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: 'Test data response'
  }
  const branchDataMock = {
    name: 'Test_Branch_Name'
  }
  const testProjectId = 'Test Project ID'
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
  const response = await branchServiceStub.mergeBranch(
    testProjectId,
    branchDataMock.name
  )
  t.equal(
    response,
    responseStub.data,
    'Actual response matches expected response'
  )
  sandbox.restore()
  t.end()
})

test('mergeBranch should handle error', async (t) => {
  t.plan(1)
  const branchDataMock = {
    name: 'Test_Branch_Name'
  }
  const testProjectId = 'Test Project ID'
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').throws('Test Error')
  try {
    await branchServiceStub.mergeBranch(testProjectId, branchDataMock.name)
    t.fail('mergeBranch successfully failed')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to merge branch: Sinon-provided Test Error',
      'Actual error matches expected error'
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
    test(`Project ID validation should throw an error when: ${badData[ii].testName} is passed in`, async (t) => {
      t.plan(1)
      const responseStub = {
        success: true,
        data: 'Test data response'
      }
      const branchDataMock = {
        name: 'Test_Branch_Name'
      }
      const testProjectId = badData[ii].projectId
      const branchServiceStub = new BranchService()
      sandbox.stub(branchServiceStub, '_requireReady').resolves()
      sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
      try {
        await branchServiceStub.mergeBranch(testProjectId, branchDataMock.name)
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
    test(`Branch name validation should throw an error when: ${badData[ii].testName} is passed in`, async (t) => {
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
        await branchServiceStub.mergeBranch(testProjectId, badData[ii].name)
        t.fail('Branch name validation threw an error with an invalid value')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Source branch name is required',
          `Branch name validation successfully threw an error with: ${badData[ii].testName}`
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

function checkMergeConflictErrorHandling () {
  const mergeError = [
    {
      name: 'merge conflict error',
      value: 'conflicts',
      expectedError: 'Error: Merge conflicts detected: Sinon-provided conflicts'
    },
    {
      name: '409 Conflict client error',
      value: '409',
      expectedError: 'Error: Merge conflicts detected: Sinon-provided 409'
    }
  ]
  for (let ii = 0; ii < mergeError.length; ii++) {
    test(`mergeBranch should handle ${mergeError[ii].name}`, async (t) => {
      t.plan(1)
      const branchDataMock = {
        name: 'Test_Branch_Name'
      }
      const testProjectId = 'Test Project ID'
      const branchServiceStub = new BranchService()
      sandbox.stub(branchServiceStub, '_requireReady').resolves()
      sandbox.stub(branchServiceStub, '_request').throws(mergeError[ii].value)
      try {
        await branchServiceStub.mergeBranch(testProjectId, branchDataMock.name)
        t.fail('mergeBranch successfully failed')
      } catch (err) {
        t.equal(
          err.toString(),
          mergeError[ii].expectedError,
          'Actual error matches expected error'
        )
      }
      sandbox.restore()
      t.end()
    })
  }
}

checkBranchDataNameValidation()
checkProjectIdValidation()
checkMergeConflictErrorHandling()
// #endregion

// #region Cleanup
test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
// #endregion
