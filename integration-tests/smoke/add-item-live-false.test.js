/* eslint-disable no-empty-function */
import test from 'tape'
import { createAndGetProject, waitFor } from '../base.js'

// Server-side commit debounce when live=false is ~10s
// (packages/socket/collaborative.js → COMMIT_DEBOUNCE = 10_000).
// Polling timeout: 25s gives the debounce window plus headroom for
// network + commit-socket-ops latency.
const COMMIT_TIMEOUT_MS = 25000

// #region Tests
test('includePending=false, live=false, change should not be visible or committed until after wait', async (tape) => {
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

  // Adding item to project
  await sdkInstance.addItem(testType, testData)
  await sdkInstance.toggleLive(false)
  let projectResponse = await sdkInstance.getProjectData(project.id, {
    includePending: false
  })

  // Assertions — pre-connect snapshot should not yet contain the queued op
  tape.ok(!projectResponse.schema.test_type, 'Changes were not saved.')
  tape.equal(projectResponse.__pending.count, 0, 'pending.count is 0')
  tape.ok(
    !projectResponse.__pending.uncommitted,
    'uncommitted field set to false'
  )
  tape.equal(
    projectResponse.__pending.etag,
    '1.0.0:0',
    'Version was not bumped by 1 patch'
  )
  tape.ok(projectResponse.isLatest, 'isLatest field set to true')

  await sdkInstance.connect(connectObject)

  // Poll until the queued op flushes through the socket and the server's
  // debounced commit lands. waitFor returns the first response that has
  // the committed key, so the test moves on as soon as it lands rather
  // than always burning 15s.
  projectResponse = await waitFor(
    async () => {
      const r = await sdkInstance.getProjectData(project.id)
      return r?.schema?.test_type?.test_key ? r : null
    },
    {
      timeout: COMMIT_TIMEOUT_MS,
      interval: 500,
      message: 'addItem op did not appear in schema.test_type.test_key after connect+commit'
    }
  )

  // Assertions
  tape.equal(
    projectResponse.schema.test_type.test_key.key,
    testData.key,
    'Changes successfully saved.'
  )
  tape.ok(projectResponse.isLatest, 'isLatest field set to true')
  tape.end()
})

test('includePending=true, live=false, addItem should save change and increment pending count', async (tape) => {
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

  // Connecting to project
  await sdkInstance.addItem(testType, testData)

  // Poll until either the pending count goes up (op sat in queue, not yet
  // committed) or the schema reports the key (committed before we polled).
  // Either is a valid "the op was accepted" outcome for this assertion.
  const projectResponse = await waitFor(
    async () => {
      const r = await sdkInstance.getProjectData(project.id, { includePending: true })
      const seen = r?.__pending?.count > 0 || r?.schema?.test_type?.test_key
      return seen ? r : null
    },
    {
      timeout: COMMIT_TIMEOUT_MS,
      interval: 500,
      message: 'addItem op never showed up as pending or committed'
    }
  )

  // Assertions
  tape.equal(
    projectResponse.schema.test_type.test_key.key,
    testData.key,
    'Changes successfully saved.'
  )
  tape.ok(projectResponse.__pending.count > 0, 'pending.count > 0')
  tape.ok(
    projectResponse.__pending.uncommitted,
    'uncommitted field set to true'
  )
  tape.end()
})

test('includePending=true, live=false, changes should commit after debounce window', async (tape) => {
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

  // Poll until the schema sees the committed key AND pending is zeroed.
  // This is the post-commit steady state.
  const projectResponse = await waitFor(
    async () => {
      const r = await sdkInstance.getProjectData(project.id, { includePending: true })
      const committed = r?.schema?.test_type?.test_key?.key
      const settled = r?.__pending?.count === 0
      return committed && settled ? r : null
    },
    {
      timeout: COMMIT_TIMEOUT_MS,
      interval: 500,
      message: 'addItem op did not commit + clear pending within window'
    }
  )

  // Assertions
  tape.equal(
    projectResponse.schema.test_type.test_key.key,
    testData.key,
    'Actual response key matches expected response key'
  )
  tape.equal(projectResponse.__pending.count, 0, 'pending.count is zeroed out')
  tape.ok(
    !projectResponse.__pending.uncommitted,
    'uncommitted field set to false'
  )
  tape.equal(
    projectResponse.__pending.etag,
    '1.0.1:0',
    'Version bumped by 1 patch'
  )
  tape.ok(projectResponse.isLatest, 'isLatest field set to true')
  tape.end()
})
// #endregion

// #region Exit Cleanup
test.onFinish(() => process.exit(0))
// #endregion
