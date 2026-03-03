import test from 'tape'
import { createAndGetProject } from './base.js'

function addProjectLibrariesTestPositive () {
  test('addProjectLibraries executed with success', async tape => {
    const project = await createAndGetProject()
    const project2 = await createAndGetProject()
    const response = await globalSdk.addProjectLibraries(project.id, [
      project2.id
    ])
    tape.equal(
      response.success,
      true,
      'addProjectLibraries successfully added libraries'
    )
  })
}

function addProjectLibrariesTestNegative () {
  test('addProjectLibraries failed: Project is not a shared library', async tape => {
    const project2 = await createAndGetProject(false)
    const { key } = project2
    try {
      await globalSdk.addProjectLibraries(globalProject.id, [key])
    } catch (error) {
      tape.equal(
        error.message,
        `Failed to add project libraries: Function call failed: [projects:add-libraries] Project ${key} is not a shared library.`,
        `addProjectLibraries failed: Project ${key} is not a shared library`
      )
    }
  })
}

addProjectLibrariesTestPositive()
addProjectLibrariesTestNegative()

test.onFinish(() => process.exit(0))
