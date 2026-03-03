import test from 'tape'
import { dataSets } from './data/getProjectByKey.objects.negative.js'

test('Get project by key', async tape => {
  const response = await globalSdk.getProjectByKey(globalProject.key)

  tape.ok(response, 'getProjectByKey successfully returned data')

  tape.equal(response.key, globalProject.key, 'Project key matches')
  tape.equal(response.name, globalProject.name, 'Project name matches')
  tape.equal(response.createdBy, globalProject.createdBy, 'Created by matches')
  tape.deepEqual(
    response.settings,
    globalProject.settings,
    'Project settings match'
  )

  tape.true(Object.keys(response).length > 0, 'Project object is not empty')
})

test('getProject By Key should throw an error when called with invalid or malformed projectId => Bug created for this issue: `https://github.com/symbo-ls/platform/issues/930`', async t => {
  for (const key of Object.keys(dataSets)) {
    const { projectId, error, title } = dataSets[key]

    try {
      const response = await globalSdk.getProjectByKey(projectId)
      t.fail(
        `getProjectByKey did not fail as expected for case: "${title}". Response = ${JSON.stringify(
          response
        )}`
      )
    } catch (e) {
      t.match(e.message, error, `Error message matches for case: "${title}"`)
    }
  }
})
test.onFinish(() => process.exit(0))
