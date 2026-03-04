import test from 'tape'
import { authenticateUser } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
// #endregion

test('Get stored auth state after login', async t => {
  await authenticateUser(sdkInstance)
  const response = await sdkInstance.getStoredAuthState()
  t.ok(typeof response.userId === 'string', 'User Id is string')
  t.ok(response.userId, 'User Id is defined')
  t.ok(response.userId !== '', 'User Id is not empty')
  t.ok(typeof response.authToken === 'string', 'Auth token is string')
  t.ok(response.authToken, 'Auth token is defined')
  t.ok(response.authToken !== '', 'Auth token is not empty')
  t.ok(!response.error, 'There are no errors')
})

test.onFinish(() => {
  process.exit(0)
})
