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
// #endregion

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

  // Assertions
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

  // Wait for debounce
  await sleep(15000) // waiting > 10s without sending further ops
  projectResponse = await sdkInstance.getProjectData(project.id)

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
  let projectResponse = await sdkInstance.getProjectData(project.id, {
    includePending: true
  })

  for (let ii = 0; ii < 2; ii++) {
    if (projectResponse.__pending.count > 0) {
      break
    }
    await sdkInstance.addItem(testType, testData)
    projectResponse = await sdkInstance.getProjectData(project.id, {
      includePending: true
    })
  }

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

test('includePending=true, live=false, changes should commit after 10 second wait', async (tape) => {
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
  await sleep(15000) // waiting > 10s without sending further ops
  let projectResponse = await sdkInstance.getProjectData(project.id, {
    includePending: true
  })

  for (let ii = 0; ii < 3; ii++) {
    if (projectResponse.schema.test_type.test_key.key) {
      break
    } else {
      await sleep(5000)
      projectResponse = await sdkInstance.getProjectData(project.id, {
        includePending: true
      })
    }
  }

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
