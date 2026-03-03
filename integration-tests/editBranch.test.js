import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from './data/editBranch.objects.negative.js'

function editBranchTestPositive () {
  test('should edit a branch with success - https://github.com/symbo-ls/platform/issues/926', async tape => {
    const branchName = faker.string.alpha(10)
    const createBranchResponse = await globalSdk.createBranch(branchName)
    tape.ok(
      createBranchResponse,
      `Branch '${branchName}' is created successfully`
    )
    const anotherBranchName = 'different-branch-name'
    const response = await globalSdk.editBranch(branchName, {
      name: anotherBranchName
    })
    tape.ok(response, `Branch '${branchName}' is edited successfully`)
    tape.equal(
      response.branch,
      anotherBranchName,
      `Branch '${branchName}' is edited successfully to the new branch name '${anotherBranchName}'`
    )
  })
}

function editBranchTestNegative (dataSet) {
  test(`editBranch ${dataSet.title}`, async tape => {
    try {
      await globalSdk.editBranch(dataSet.branch, dataSet.options)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `editBranch failed: ${dataSet.error}`
      )
    }
  })
}

editBranchTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  editBranchTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
