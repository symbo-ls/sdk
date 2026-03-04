import test from 'tape'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
// #endregion

function addProjectLibrariesTestPositive () {
  test('addProjectLibraries executed with success', async tape => {
    const project = await createAndGetProject(true, sdkInstance)
    const project2 = await createAndGetProject(true, sdkInstance)
    const response = await sdkInstance.addProjectLibraries(project._id, [
      project2._id
    ])
    tape.equal(
      response.success,
      true,
      'addProjectLibraries successfully added libraries'
    )
    tape.equal(
      response.data[0]._id,
      project2._id,
      `response id matches project2 id: ${project2._id}`
    )
    tape.equal(
      response.message,
      '1 library added successfully',
      'Actual response message matches expected response message: "1 library added successfully"'
    )
  })
}

function addProjectLibrariesTestNegative () {
  test('addProjectLibraries failed: Project is not a shared library', async tape => {
    const project = await createAndGetProject(true, sdkInstance)
    const project2 = await createAndGetProject(false, sdkInstance)

    try {
      await sdkInstance.addProjectLibraries(project._id, [project2._id])
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to add project libraries: Request failed: No valid shared libraries found for provided IDs (must be active or explicitly allow deprecated)',
        `addProjectLibraries failed: Project ${project2.key} is not a shared library`
      )
    }
  })
}

addProjectLibrariesTestPositive()
addProjectLibrariesTestNegative()

test.onFinish(() => process.exit(0))
