/* eslint-disable no-await-in-loop */
import test from 'tape'
import { dataSets } from '../data/getProjectByKey.objects.negative.js'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })
// #endregion

// #region Tests
test('Get project by key', async tape => {
  const project = await createAndGetProject(true, sdkInstance)
  const response = await sdkInstance.getProjectByKey(project.key)

  tape.ok(response, 'getProjectByKey successfully returned data')

  tape.equal(response.key, project.key, 'Project key matches')
  tape.equal(response.name, project.name, 'Project name matches')
  tape.equal(response.createdBy, project.createdBy, 'Created by matches')
  tape.deepEqual(response.settings, project.settings, 'Project settings match')

  tape.true(Object.keys(response).length > 0, 'Project object is not empty')
})

test('getProject By Key should throw an error when called with invalid or malformed projectId', async t => {
  for (const key of Object.keys(dataSets)) {
    const { projectId, error, title } = dataSets[key]

    try {
      const response = await sdkInstance.getProjectByKey(projectId)
      t.fail(
        `getProjectByKey did not fail as expected for case: "${title}". Response = ${JSON.stringify(
          response
        )}`
      )
    } catch (e) {
      t.equal(e.message, error, `Error message matches for case: "${title}"`)
    }
  }
})
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
