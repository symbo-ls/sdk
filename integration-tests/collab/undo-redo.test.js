/* eslint-disable no-empty-function */
import test from 'tape'
import { authenticateUser } from '../base.js'

// #region Helpers
// Toggles the client to live to mitigate the DB wait
async function toggleLiveAndConnect (sdkInstance) {
  const connectObject = {
    authToken: global.globalUser.tokens.accessToken,
    projectId: global.globalProject.id,
    branch: global.globalProject.publishedVersion.branch,
    pro: true
  }

  await sdkInstance.toggleLive(true)
  await sdkInstance.connect(connectObject)
}
// #endregion

// #region Tests
test('undo and redo', async tape => {
  const sdkInstance = Object.create(global.globalSdk)
  await authenticateUser(sdkInstance)
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
  await toggleLiveAndConnect(sdkInstance)
  await sdkInstance.connect({ projectId: global.globalProject.id })

  await toggleLiveAndConnect(sdkInstance)
  let response = await sdkInstance.isConnected()
  tape.true(response, 'Collab Service connected')

  await toggleLiveAndConnect(sdkInstance)
  response = await sdkInstance.addItem(testType, testData)
  tape.true(response.success, 'item added')

  await toggleLiveAndConnect(sdkInstance)
  response = await sdkInstance.undo()
  tape.equal(response[0][0], 'delete', 'items undone')

  await toggleLiveAndConnect(sdkInstance)
  response = await sdkInstance.redo()
  tape.equal(response[0][0], 'update', 'items redone')
})
// #endregion

// #region Exit Cleanup
test.onFinish(() => process.exit(0))
// #endregion
