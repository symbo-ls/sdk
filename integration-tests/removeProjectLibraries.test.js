import test from 'tape'
import { createAndGetProject } from './base.js'

test('removeProjectLibraries executed with success', async tape => {
  const project = await createAndGetProject()
  const project2 = await createAndGetProject()
  await globalSdk.addProjectLibraries(project.id, [project2.id])
  const response = await globalSdk.removeProjectLibraries(project.id, [
    project2.id
  ])
  tape.equal(
    response.success,
    true,
    'removeProjectLibraries successfully removed libraries'
  )
})

test('Attempt to remove a non-shared library, Bug created for this issue: https://github.com/symbo-ls/platform/issues/931', async t => {
  const project = await createAndGetProject()
  const libraryProject = await createAndGetProject()

  await globalSdk.addProjectLibraries(project.id, [libraryProject.id])

  await globalSdk.updateProject(libraryProject.id, { isSharedLibrary: false })

  const updatedLibrary = await globalSdk.getProject(libraryProject.id)
  t.false(
    updatedLibrary.isSharedLibrary,
    'Library project is no longer marked as shared'
  )

  try {
    await globalSdk.removeProjectLibraries(project.id, [libraryProject.id])
    t.fail('Expected failure when removing a non-shared library')
  } catch (error) {
    t.ok(error, 'removeProjectLibraries threw an error as expected')

    t.equal(
      error.message,
      'Failed to remove project libraries: Function call failed: [projects:remove-libraries] Cannot find type from prefix te from set-object {\n  "$id": "test-project-id",\n  "useLibraries": {\n    "$delete": [\n      "hello.symbo.ls"\n    ]\n  }\n}.',
      'Error message matches expected failure for non-shared library'
    )
  }
})

test.onFinish(() => process.exit(0))
