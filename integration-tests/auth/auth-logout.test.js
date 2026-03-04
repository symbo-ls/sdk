import test from 'tape'
import { authenticateUser } from '../base.js'
import { guestLogin } from '../index.js'
import { getTokenManager } from '../../src/utils/TokenManager.js'

// #region Tests
test('authToken update after successful logout', async t => {
  const sdkInstance = Object.create(global.globalSdk)
  const tmInstance = getTokenManager()
  await authenticateUser(sdkInstance)
  await sdkInstance.logout()
  t.equal(tmInstance.getAccessToken(), null, 'authToken is null')
})

test('Get stored auth state after logout', async t => {
  const sdkInstance = Object.create(global.globalSdk)
  await authenticateUser(sdkInstance)
  await sdkInstance.logout()
  const response = await sdkInstance.getStoredAuthState()
  t.ok(!response.userId, 'User Id is removed')
  t.ok(!response.authToken, 'Auth token is removed')
  t.ok(!response.error, 'There are no errors')
})
// #endregion

// #region Teardown
test.onFinish(async () => {
  await guestLogin()
  process.exit(0)
})
// #endregion
