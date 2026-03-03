import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from './data/deleteBranch.objects.negative.js'

function deleteBranchTestPositive () {
  test('should delete a branch with success - https://github.com/symbo-ls/platform/issues/926', async tape => {
    const branchName = faker.string.alpha(10)
    const createBranchResponse = await globalSdk.createBranch(branchName)
    tape.ok(
      createBranchResponse,
      `Branch '${branchName}' is created successfully`
    )
    const response = await globalSdk.deleteBranch(branchName)
    tape.ok(response, `Branch '${branchName}' is deleted successfully`)
  })
}

function deleteBranchTestNegative (dataSet) {
  test(`deleteBranch ${dataSet.title}`, async tape => {
    try {
      await globalSdk.deleteBranch(dataSet.branch)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `deleteBranch failed: ${dataSet.error}`
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
