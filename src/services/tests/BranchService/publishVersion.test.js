/* eslint-disable no-undefined */
import test from 'tape'
import sinon from 'sinon'
import { BranchService } from '../../BranchService.js'

// #region Setup
const sandbox = sinon.createSandbox()
// #endregion

// #region Tests
test('publishVersion should return response data', async (t) => {
  t.plan(1)
  const responseStub = {
    success: true,
    data: 'Test data response'
  }
  const publishVersionMock = {
    name: 'Test_Branch_Name',
    version: '1.0.0',
    branch: 'main'
  }
  const testProjectId = 'Test Project ID'
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
  const response = await branchServiceStub.publishVersion(
    testProjectId,
    publishVersionMock
  )
  t.equal(
    response,
    responseStub.data,
    'Actual response matches expected response'
  )
  sandbox.restore()
  t.end()
})

test('publishVersion should return response data', async (t) => {
  t.plan(1)
  const publishVersionMock = {
    name: 'Test_Branch_Name',
    version: '1.0.0',
    branch: 'main'
  }
  const testProjectId = 'Test Project ID'
  const branchServiceStub = new BranchService()
  sandbox.stub(branchServiceStub, '_requireReady').resolves()
  sandbox.stub(branchServiceStub, '_request').throws('Test Error')
  try {
    await branchServiceStub.publishVersion(testProjectId, publishVersionMock)
    t.fail('publish version threw an error')
  } catch (err) {
    t.equal(
      err.toString(),
      'Error: Failed to publish version: Sinon-provided Test Error',
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
      const publishVersionMock = {
        name: 'Test_Branch_Name',
        version: '1.0.0',
        branch: 'main'
      }
      const testProjectId = badData[ii].projectId
      const branchServiceStub = new BranchService()
      sandbox.stub(branchServiceStub, '_requireReady').resolves()
      sandbox.stub(branchServiceStub, '_request').resolves(responseStub)
      try {
        await branchServiceStub.publishVersion(
          testProjectId,
          publishVersionMock
        )
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
      testName: 'No name',
      branch: 'main'
    },
    {
      testName: 'Empty string',
      version: '',
      branch: 'main'
    },
    {
      testName: 'False boolean value',
      version: false,
      branch: 'main'
    },
    {
      testName: 'Undefined value',
      version: undefined,
      branch: 'main'
    },
    {
      testName: 'Null value',
      version: null,
      branch: 'main'
    }
  ]
  for (let ii = 0; ii < badData.length; ii++) {
    test(`publishData version validation should throw an error when: ${badData[ii].testName} is passed in`, async (t) => {
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
        await branchServiceStub.publishVersion(testProjectId, badData[ii])
        t.fail('Branch name validation threw an error with an invalid value')
      } catch (err) {
        t.equal(
          err.toString(),
          'Error: Version is required',
          `publishData version validation successfully threw an error with: ${badData[ii].testName}`
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
test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
// #endregion
