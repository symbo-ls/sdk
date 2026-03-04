import test from 'tape'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Helpers
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })

function updateProjectComponentsTestPositive () {
  test('updateProjectComponents executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await sdkInstance.updateProjectComponents(project.id, {
      text: 'test'
    })
    tape.equal(
      response.version,
      '1.0.1',
      'Project version updated successfully'
    )
  })
}

function updateProjectComponentsTestNegative () {
  test('updateProjectComponents failed: Invalid components data structure', async tape => {
    try {
      await sdkInstance.updateProjectComponents(global.globalProject.id)
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to update project components: Request failed: Components must be a valid object',
        'updateProjectComponents failed: Invalid components data structure'
      )
    }
  })
}

updateProjectComponentsTestNegative()
updateProjectComponentsTestPositive()

test.onFinish(() => process.exit(0))
