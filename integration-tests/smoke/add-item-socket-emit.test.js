/* eslint-disable init-declarations */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-empty-function */
import test from 'tape'
import { createAndGetProject } from '../base.js'

// #region Helpers
// Wait function
function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isPending (projectResponse) {
  return (
    projectResponse.__pending.count !== 0 ||
    projectResponse.__pending.uncommitted
  )
}
// #endregion

// #region Tests
test('includePending=true, changes should commit after socket.emit via manual checkpoint ', async (tape) => {
  // Setup
  await sleep(5000)
  const sdkInstance = Object.create(global.globalSdk)
  const project = await createAndGetProject(false, sdkInstance)
  const connectObject = {
    authToken: global.globalUser.tokens.accessToken,
    projectId: project.id,
    branch: project.publishedVersion.branch,
    pro: true
  }
  const testType = 'test_type'
  const testData = {
    value: 'test_data',
    key: 'test_key'
  }
  sdkInstance.updateContext({
    state: {
      quietUpdate () {},
      getByPath () {},
      setPathCollection () {}
    }
  })
  await sdkInstance.toggleLive(false)
  await sdkInstance.connect(connectObject)

  // Adding item to project
  await sdkInstance.addItem(testType, testData)
  let projectResponse

  // Sets up retry to reduce test flakiness
  for (let ii = 0; ii < 3; ii++) {
    await sdkInstance.checkpoint()
    projectResponse = await sdkInstance.getProjectData(project.id, {
      includePending: true
    })
    if (!isPending(projectResponse)) {
      break
    }
    await sleep(2500)
  }

  // Assertions
  tape.equal(
    projectResponse.schema.test_type.test_key.key,
    testData.key,
    'Changes successfully saved.'
  )
  tape.equal(projectResponse.__pending.count, 0, 'pending.count is zeroed out')
  tape.ok(
    !projectResponse.__pending.uncommitted,
    'uncommitted field set to false'
  )
  tape.notEqual(
    projectResponse.__pending.etag,
    '1.0.0:0',
    'Version bumped by 1 patch'
  )
  tape.ok(projectResponse.isLatest, 'isLatest field set to true')
  tape.end()
})
// #endregion

// #region Exit Cleanup
test.onFinish(() => process.exit(0))
// #endregion
