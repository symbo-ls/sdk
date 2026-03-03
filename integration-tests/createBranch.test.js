import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from './data/createBranch.objects.negative.js'

function createBranchTestPositive () {
  test('should create a branch with success - https://github.com/symbo-ls/platform/issues/926', async tape => {
    const branchName = faker.string.alpha(10)
    const response = await globalSdk.createBranch(branchName)
    tape.ok(response, `Branch '${branchName}' is created with success`)
    tape.ok(response.id, 'Id is set')
    tape.ok(typeof response.id === 'string', 'Id type is string')
  })
}

function createBranchTestNegative (dataSet) {
  test(`createBranch ${dataSet.title}`, async tape => {
    try {
      await globalSdk.createBranch(dataSet.branch, dataSet.options)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `createBranch failed: ${dataSet.error}`
      )
    }
  })
}

createBranchTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  createBranchTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
