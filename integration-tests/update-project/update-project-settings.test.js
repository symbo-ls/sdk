import test from 'tape'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Helpers
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })

function updateProjectSettingsTestPositive () {
  test('updateProjectSettings executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await sdkInstance.updateProjectSettings(project.id, {
      text: 'test'
    })
    tape.equal(
      response.version,
      '1.0.1',
      'Project version updated successfully'
    )
  })
}

function updateProjectSettingsTestNegative () {
  test('updateProjectSettings failed: Invalid components data structure', async tape => {
    try {
      await sdkInstance.updateProjectSettings(global.globalProject.id)
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to update project settings: Request failed: Settings must be a valid object',
        'updateProjectSettings failed: Invalid settings data structure'
      )
    }
  })
}

updateProjectSettingsTestPositive()
updateProjectSettingsTestNegative()

test.onFinish(() => process.exit(0))
