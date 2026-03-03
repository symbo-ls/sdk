import test from 'tape'
import { authenticateUser } from './base.js'

test('Get stored auth state after login', async t => {
  const response = await globalSdk.getStoredAuthState()
  t.ok(typeof response.userId === 'string', 'User Id is string')
  t.ok(response.userId, 'User Id is defined')
  t.ok(response.userId !== '', 'User Id is not empty')
  t.ok(typeof response.authToken === 'string', 'Auth token is string')
  t.ok(response.authToken, 'Auth token is defined')
  t.ok(response.authToken !== '', 'Auth token is not empty')
  t.ok(!response.error, 'There are no errors')
})

test('authToken update after successful logout, Bug created for this issue: https://github.com/symbo-ls/platform/issues/1175', async t => {
  const sdkInstance = Object.create(globalSdk)
  await authenticateUser(sdkInstance)
  await sdkInstance.logout()

  t.equal(
    sdkInstance._context.authToken,
    null,
    `authToken: ${sdkInstance._context.authToken} is null`
  )
})

test('Get stored auth state after logout', async t => {
  const sdkInstance = Object.create(globalSdk)
  await authenticateUser(sdkInstance)
  await sdkInstance.logout()
  const response = await sdkInstance.getStoredAuthState()
  t.ok(!response.userId, 'User Id is removed')
  t.ok(!response.authToken, 'Auth token is removed')
  t.ok(!response.error, 'There are no errors')
})

test.onFinish(() => process.exit(0))
