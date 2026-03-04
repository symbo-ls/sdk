import test from 'tape'
import { createAndGetProject } from '../base.js'
import { dataSets } from '../data/removeProject.objects.negative.js'

function removeProjectTestPositive () {
  test('removeProject executed with success', async tape => {
    const project = await createAndGetProject()
    tape.ok(project, 'Project is successfully created')
    const responseDelete = await global.globalSdk.removeProject(project._id)
    tape.equal(responseDelete.success, true, 'Project is successfully removed')
  })
}

function removeProjectTestNegative (dataSet) {
  test(`removeProject: ${dataSet.title}`, async tape => {
    try {
      await global.globalSdk.removeProject(dataSet.projectId)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `removeProject failed: ${dataSet.error}`
      )
    }
  })
}

removeProjectTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  removeProjectTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
