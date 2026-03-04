import test from 'tape'

let lastProject
test('addFavoriteProject executed with success', async tape => {
  const projects = await globalSdk.addFavoriteProject(globalProject.id)
  tape.ok(projects, 'addFavoriteProject successfully returned data')
  lastProject = projects.length - 1
  tape.equal(projects[lastProject].id, globalProject.id, 'added the global project')
})
test('getFavoriteProjects executed with success', async tape => {
  const projects = await globalSdk.getFavoriteProjects()
  tape.ok(projects, 'getFavoriteProjects successfully returned data')
  tape.equal(projects[lastProject].id, globalProject.id, 'most recent project is the global project')
})
test('removeFavoriteProject executed with success', async tape => {
  const response = await globalSdk.removeFavoriteProject(globalProject.id)
  tape.ok(response, 'removeFavoriteProject successfully returned data')
  tape.equal(response, 'Project removed from favorites', 'Project removed from favorites')
  const projects = await globalSdk.getFavoriteProjects()
  tape.equal(projects.length, lastProject, 'removed the global project')
})

test.onFinish(() => process.exit(0))
