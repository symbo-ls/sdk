import test from 'tape'
import { createAndGetProject } from './base.js'

function updateProjectSettingsTestPositive () {
  test('updateProjectSettings executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await globalSdk.updateProjectSettings(project.id, {
      text: 'test'
    })
    tape.equal(
      response.success,
      true,
      'Project settings are updated successfully'
    )
  })
}

function updateProjectSettingsTestNegative () {
  test('updateProjectSettings failed: Invalid components data structure', async tape => {
    try {
      await globalSdk.updateProjectSettings(globalProject.id)
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to update project settings: Function call failed: [projects:update-settings] Invalid settings data structure.',
        'updateProjectSettings failed: Invalid settings data structure'
      )
    }
  })
}

updateProjectSettingsTestPositive()
updateProjectSettingsTestNegative()

test.onFinish(() => process.exit(0))
