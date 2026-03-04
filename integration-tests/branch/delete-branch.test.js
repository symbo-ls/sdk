/* eslint-disable no-empty-function */
import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from '../data/deleteBranch.objects.negative.js'
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

function deleteBranchTestPositive () {
  test('should delete a branch with success - https://github.com/symbo-ls/platform/issues/926', async tape => {
    const branchName = faker.string.alpha(10)
    const createBranchResponse = await sdkInstance.createBranch(
      global.globalProject.id,
      {
        name: branchName
      }
    )
    tape.ok(
      createBranchResponse,
      `Branch '${branchName}' is created successfully`
    )
    const response = await sdkInstance.deleteBranch(
      global.globalProject.id,
      branchName
    )

    tape.ok(response.message, 'Branch deleted successfully')
  })
}

function deleteBranchTestNegative (dataSet) {
  test(`deleteBranch ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.deleteBranch(dataSet.id, dataSet.branch)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        'deleteBranch failed successfully'
      )
    }
  })
}

deleteBranchTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  deleteBranchTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
