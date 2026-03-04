import test from 'tape'
import { dataSets } from '../data/mergeBranch.objects.negative.js'

// function mergeBranchTestPositive () {
//   test('should merge a branch with success', async tape => {
//     const branchName = faker.string.alpha(10)
//     const createBranchResponse = await globalSdk.createBranch(branchName)
//     tape.ok(
//       createBranchResponse,
//       `Branch '${branchName}' is created successfully`
//     )
//     const response = await globalSdk.mergeBranch(branchName, {})
//     console.log('res', response)
//   })
// }

function mergeBranchTestNegative (dataSet) {
  test(`mergeBranch ${dataSet.title} - https://github.com/symbo-ls/platform/issues/926`, async tape => {
    try {
      await globalSdk.mergeBranch(globalProject.id, dataSet.branch, dataSet.options)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `mergeBranch failed: ${dataSet.error}`
      )
    }
  })
}

// mergeBranchTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  mergeBranchTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
