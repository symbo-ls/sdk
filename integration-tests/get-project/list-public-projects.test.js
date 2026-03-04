import test from 'tape'

test('listPublicProjects executed with success', async tape => {
  const projects = await globalSdk.listPublicProjects()
  Object.keys(projects).forEach(key => {
    tape.equal(projects[key].access, 'public', 'listPublicProjects project access is public')
  })
})

test.onFinish(() => process.exit(0))
