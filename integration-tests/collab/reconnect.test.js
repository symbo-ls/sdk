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
test('disconnect and reconnect', async tape => {
  const sdkInstance = Object.create(global.globalSdk)
  await authenticateUser(sdkInstance)
  sdkInstance.updateContext({
    state: {
      quietUpdate () {},
      getByPath () {},
      setPathCollection () {}
    }
  })

  await toggleLiveAndConnect(sdkInstance)
  await sdkInstance.disconnect()
  let response = await sdkInstance.isConnected()
  tape.false(response, 'Collab Service disconnected')

  await toggleLiveAndConnect(sdkInstance)
  await sdkInstance.connect({ projectId: global.globalProject.id })

  await toggleLiveAndConnect(sdkInstance)
  response = await sdkInstance.isConnected()
  tape.true(response, 'Collab Service connected')
})
// #endregion

// #region Exit Cleanup
test.onFinish(() => process.exit(0))
// #endregion
