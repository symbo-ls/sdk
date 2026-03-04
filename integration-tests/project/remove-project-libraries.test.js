import test from 'tape'
import { createAndGetProject } from '../base.js'

test('removeProjectLibraries executed with success', async tape => {
  const project = await createAndGetProject()
  const project2 = await createAndGetProject()
  await global.globalSdk.addProjectLibraries(project._id, [project2._id])
  const response = await global.globalSdk.removeProjectLibraries(project._id, [
    project2._id
  ])
  tape.equal(
    response.success,
    true,
    'removeProjectLibraries successfully removed libraries'
  )
})

test('Attempt to remove a shared library', async t => {
  const project = await createAndGetProject()
  const libraryProject = await createAndGetProject()
  await global.globalSdk.addProjectLibraries(project._id, [libraryProject._id])
  try {
    await global.globalSdk.updateProject(libraryProject._id, {
      isSharedLibrary: false
    })
    t.fail('Removed shared library did not fail as expected.')
  } catch (err) {
    t.equal(
      err.message,
      'Failed to update project: Request failed: This project is used as a shared library by 1 project(s). Remove or migrate dependents (vendor or replace) before disabling shared mode.',
      'Successfully failed to remove a shared library.'
    )
  }
})

test.onFinish(() => process.exit(0))
