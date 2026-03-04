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

// Toggles the client to live to mitigate the DB wait
async function toggleLiveAndConnect (sdkInstance, project) {
  const connectObject = {
    authToken: global.globalUser.tokens.accessToken,
    projectId: project.id,
    branch: project.publishedVersion.branch,
    pro: true
  }

  await sdkInstance.toggleLive(true)
  await sdkInstance.connect(connectObject)
}

function checkPending (projectResponse) {
  return (
    projectResponse.__pending.count === 0 &&
    !projectResponse.__pending.uncommitted
  )
}
// #endregion

// #region Tests
test('includePending=true, should commit after connect set to live=true', async (tape) => {
  // Setup
  await sleep(10000)
  const sdkInstance = Object.create(global.globalSdk)
  const project = await createAndGetProject(false, sdkInstance)
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

  // Adding item to project
  await toggleLiveAndConnect(sdkInstance, project)
  await sdkInstance.addItem(testType, testData)
  let projectResponse
  let ii = 0
  do {
    await toggleLiveAndConnect(sdkInstance, project)
    projectResponse = await sdkInstance.getProjectData(project.id, {
      includePending: true
    })
    ii++
  } while (!checkPending(projectResponse) && ii < 3)

  // Assertions
  tape.equal(projectResponse.__pending.count, 0, 'pending.count is 0')
  tape.ok(
    !projectResponse.__pending.uncommitted,
    'uncommitted field set to false'
  )
  tape.ok(projectResponse.isLatest, 'isLatest field set to true')
  tape.end()
})

test('Etag should display the correct values', async (tape) => {
  const sdkInstance = Object.create(global.globalSdk)
  const project = await createAndGetProject(false, sdkInstance)
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
  await sdkInstance.connect({ projectId: project.id })

  // Assertions
  // Test initial response: ETag value present
  const firstProjectResponse = await sdkInstance.getProjectData(project.id)
  const firstETag = firstProjectResponse.__pending.etag
  tape.equal(firstETag, '1.0.0:0', 'ETag present and set to 1.0.0:0')

  // Test unmodified response
  try {
    await sdkInstance.getProjectData(project.id, {
      headers: {
        'If-None-Match': firstETag
      }
    })
  } catch (err) {
    tape.ok(
      err.message.includes('HTTP 304'),
      'getProjectData successfully threw a 304 Not Modified error'
    )
  }

  // Test modified response: ETag value updated
  await toggleLiveAndConnect(sdkInstance, project)
  await sdkInstance.addItem(testType, testData)
  await sleep(5000) // Waiting for item to be added
  await toggleLiveAndConnect(sdkInstance, project)
  const secondProjectResponse = await sdkInstance.getProjectData(project.id)
  const secondETag = secondProjectResponse.__pending.etag
  tape.equal(secondETag, '1.0.1:0', 'ETag present and updated to 1.0.1:0')
  tape.end()
})

test('add and delete item', async (tape) => {
  const sdkInstance = Object.create(global.globalSdk)
  const project = await createAndGetProject(false, sdkInstance)
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
  await toggleLiveAndConnect(sdkInstance, project)

  // Connecting to project
  await sdkInstance.connect({
    projectId: project.id
  })

  // Assertions
  await toggleLiveAndConnect(sdkInstance, project)
  const addResponse = await sdkInstance.addItem(testType, testData)
  tape.true(addResponse.success, 'item added')
  await toggleLiveAndConnect(sdkInstance, project)
  const deleteResponse = sdkInstance.deleteItem(testType, testData.key)
  tape.true(deleteResponse.success, 'item deleted')
  tape.end()
})

test('add and delete multiple items', async (tape) => {
  const sdkInstance = Object.create(global.globalSdk)
  const project = await createAndGetProject(false, sdkInstance)
  const testType = 'test_type'
  const testData = [
    [
      testType,
      {
        value: 'test_data_1',
        key: 'test_key_1'
      }
    ],
    [
      testType,
      {
        value: 'test_data_2',
        key: 'test_key_2'
      }
    ]
  ]
  sdkInstance.updateContext({
    state: {
      quietUpdate () {},
      getByPath () {},
      setPathCollection () {}
    }
  })
  await toggleLiveAndConnect(sdkInstance, project)
  await sdkInstance.connect({ projectId: project.id })

  // Assertions
  await toggleLiveAndConnect(sdkInstance, project)
  let response = await sdkInstance.addMultipleItems(testData)
  tape.true(response.length > 0, 'items added')

  await toggleLiveAndConnect(sdkInstance, project)
  response = sdkInstance.deleteItem(testType, 'test_key_1')
  tape.true(response.success, 'item 1 deleted')

  await toggleLiveAndConnect(sdkInstance, project)
  response = sdkInstance.deleteItem(testType, 'test_key_2')
  tape.true(response.success, 'item 2 deleted')
  tape.end()
})
// #endregion

// #region Exit Cleanup
test.onFinish(() => process.exit(0))
// #endregion
