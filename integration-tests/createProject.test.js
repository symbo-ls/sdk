import test from 'tape'
import { createAndGetProject } from './base.js'
import { dataSets } from './data/createProject.objects.negative.js'

function createProjectTestPositive () {
  test('createProject executed with success', async tape => {
    const response = await createAndGetProject()
    tape.ok(response, 'createProject executed with success')
    tape.ok(typeof response.id === 'string', 'Project Id is successfully set')
  })
}

function createProjectTestNegative (dataSet) {
  test(`createProject ${dataSet.title}`, async tape => {
    try {
      await globalSdk.createProject(dataSet.data)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `createProject failed: ${dataSet.error}`
      )
    }
  })
}

createProjectTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  createProjectTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
