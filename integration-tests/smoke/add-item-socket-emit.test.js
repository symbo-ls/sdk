/* eslint-disable init-declarations */
/* eslint-disable no-empty-function */
import test from 'tape'
import { createAndGetProject, waitFor } from '../base.js'

const COMMIT_TIMEOUT_MS = 20000

// #region Tests
test('includePending=true, changes should commit after socket.emit via manual checkpoint', async (tape) => {
  // Setup
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

  // Manual checkpoint forces a commit; poll until pending settles. The
  // checkpoint() call resolves on the server's commit ack, but read-side
  // state can lag a tick — waitFor handles both.
  const projectResponse = await waitFor(
    async () => {
      await sdkInstance.checkpoint()
      const r = await sdkInstance.getProjectData(project.id, { includePending: true })
      return r?.__pending?.count === 0 && !r.__pending.uncommitted ? r : null
    },
    {
      timeout: COMMIT_TIMEOUT_MS,
      interval: 1000,
      message: 'pending state never settled after manual checkpoint'
    }
  )

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
