/* eslint-disable no-empty-function */
import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from '../data/renameBranch.objects.negative.js'
import { authenticateUser } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)

sdkInstance.updateContext({
  state: {
    quietUpdate () {},
    getByPath () {},
    setPathCollection () {}
  }
})
// #endregion

function renameBranchTestPositive () {
  test('should rename a branch with success', async tape => {
    const branchName = faker.string.alpha(10)
    const createBranchResponse = await sdkInstance.createBranch(
      global.globalProject.id,
      {
        name: branchName
      }
    )
    tape.ok(createBranchResponse, `${createBranchResponse.message}`)
    const anotherBranchName = `Updated - ${branchName}`
    const response = await sdkInstance.renameBranch(
      global.globalProject.id,
      branchName,
      anotherBranchName
    )

    tape.equal(
      response.message,
      'Branch renamed successfully',
      `${response.message}`
    )
  })
}

function renameBranchTestNegative (dataSet) {
  test(`editBranch ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.renameBranch(dataSet.id, dataSet.branch)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `renameBranch failed: ${dataSet.error}`
      )
    }
  })
}

renameBranchTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  renameBranchTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
