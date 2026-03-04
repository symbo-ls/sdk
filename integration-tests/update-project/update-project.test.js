import test from 'tape'
import { createAndGetProject } from '../base.js'
import { dataSets } from '../data/updateProject.objects.negative.js'

const sdkInstance = Object.create(globalSdk)

function updateProjectTestPositive () {
  test('updateProject executed with success', async tape => {
    let project = await createAndGetProject()
    const response = await sdkInstance.updateProject(project.id, {
      name: 'newName'
    })
    tape.equal(response.id, project.id, 'Project is successfully updated')
    project = await sdkInstance.getProject(project.id)
    tape.equal(project.name, 'newName', 'Name is updated in the project.')
  })
}

function updateProjectTestNegative (dataSet) {
  test(`updateProject failed: ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.updateProject(dataSet.projectId, dataSet.data)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `updateProject failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  updateProjectTestNegative(dataSet)
})

updateProjectTestPositive()

test.onFinish(() => process.exit(0))
