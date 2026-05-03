import test from 'tape'
import { createAndGetProject } from '../base.js'
import { dataSets } from '../data/createProject.objects.negative.js'

function createProjectTestPositive () {
  test('createProject executed with success', async tape => {
    const response = await createAndGetProject()
    tape.ok(response, 'createProject executed with success')
    tape.ok(typeof response.id === 'string', 'Project Id is successfully set')
  })
}

function createProjectTestNegative (dataSet) {
  test(`createProject rejects: ${dataSet.title}`, async tape => {
    try {
      await global.globalSdk.createProject(dataSet.data)
      tape.fail(`expected createProject to reject for: ${dataSet.title}`)
    } catch (error) {
      tape.ok(
        typeof error.message === 'string' &&
          error.message.includes(dataSet.errorContains),
        `error message contains "${dataSet.errorContains}" — got: ${error.message}`
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
