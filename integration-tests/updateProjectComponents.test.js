import test from 'tape'
import { createAndGetProject } from './base.js'

function updateProjectComponentsTestPositive () {
  test('updateProjectComponents executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await globalSdk.updateProjectComponents(project.id, {
      text: 'test'
    })
    tape.equal(
      response.success,
      true,
      'Project components are updated successfully'
    )
  })
}

function updateProjectComponentsTestNegative () {
  test('updateProjectComponents failed: Invalid components data structure', async tape => {
    try {
      await globalSdk.updateProjectComponents(globalProject.id)
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to update project components: Function call failed: [projects:update-components] Invalid components data structure.',
        'updateProjectComponents failed: Invalid components data structure'
      )
    }
  })
}

updateProjectComponentsTestNegative()
updateProjectComponentsTestPositive()

test.onFinish(() => process.exit(0))
