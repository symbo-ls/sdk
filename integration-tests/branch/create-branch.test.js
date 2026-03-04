/* eslint-disable no-empty-function */
import test from 'tape'
import { faker } from '@faker-js/faker'
import { dataSets } from '../data/createBranch.objects.negative.js'
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

function createBranchTestPositive () {
  test('should create a branch with success', async tape => {
    const branchName = faker.string.alpha(10)
    const response = await sdkInstance.createBranch(global.globalProject.id, {
      name: branchName
    })
    tape.ok(response, `Branch '${branchName}' is created with success`)
    tape.ok(response.id, 'Id is set')
    tape.ok(typeof response.id === 'string', 'Id type is string')
  })
}

function createBranchTestNegative (dataSet) {
  test(`createBranch ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.createBranch(dataSet.id, dataSet.branch)
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
