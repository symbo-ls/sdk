import test from 'tape'

test('getProject executed with success', async tape => {
  const projects = await globalSdk.getRecentProjects()
  tape.ok(projects, 'getRecentProjects successfully returned data')
  tape.equal(projects[0]._id, globalProject.id, 'most recent project is the global project')
})

test.onFinish(() => process.exit(0))
