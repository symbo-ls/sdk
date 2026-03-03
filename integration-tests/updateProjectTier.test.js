import test from 'tape'
import { createAndGetProject } from './base.js'
import { dataSets } from './data/updateProjectTier.objects.negative.js'

function updateProjectTierTestPositive () {
  test('Update project tier executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await globalSdk.updateProjectTier(project.id, 'free')
    tape.ok(response.success, 'updateProjectTier executed with success')
  })
}

function updateProjectTierTestNegative (dataSet) {
  test(`Update project tier: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.updateProjectTier(dataSet.projectId, dataSet.tier)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `updateProjectTier failed: ${dataSet.error}`
      )
    }
  })
}

updateProjectTierTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  updateProjectTierTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
