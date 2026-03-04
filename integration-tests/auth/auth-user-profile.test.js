import test from 'tape'
import { authenticateUser } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
// #endregion

test('Get stored auth state after login from getMe()', async t => {
  await authenticateUser(sdkInstance)
  const response = await sdkInstance.getMe()
  t.equal(
    response.user.email,
    global.globalUser.user.email,
    `email matches ${response.user.email}`
  )
  t.equal(
    response.user.authProvider,
    global.globalUser.user.authProvider,
    `authProvider matches ${response.user.authProvider}`
  )
  t.equal(
    response.user.emailVerified,
    global.globalUser.user.emailVerified,
    `emailVerified matches ${response.user.emailVerified}`
  )
  t.equal(
    response.user.globalRole,
    global.globalUser.user.globalRole,
    `globalRole matches ${response.user.globalRole}`
  )
  t.equal(
    response.user.id,
    global.globalUser.user.id,
    `id matches ${response.user.id}`
  )
  t.equal(
    response.user.name,
    global.globalUser.user.name,
    `name matches ${response.user.name}`
  )
  t.equal(
    response.user.status,
    global.globalUser.user.status,
    `status matches ${response.user.status}`
  )
  t.equal(
    response.user.username,
    global.globalUser.user.username,
    `username matches ${response.user.username}`
  )
})

test('Get stored auth state after login from getUserProfile', async t => {
  await authenticateUser(sdkInstance)
  const response = await sdkInstance.getUserProfile()
  t.equal(
    response.email,
    global.globalUser.user.email,
    `email matches ${response.email}`
  )
  t.equal(
    response.authProvider,
    global.globalUser.user.authProvider,
    `authProvider matches ${response.authProvider}`
  )
  t.equal(
    response.emailVerified,
    global.globalUser.user.emailVerified,
    `emailVerified matches ${response.emailVerified}`
  )
  t.equal(
    response.globalRole,
    global.globalUser.user.globalRole,
    `globalRole matches ${response.globalRole}`
  )
  t.equal(response.id, global.globalUser.user.id, `id matches ${response.id}`)
  t.equal(
    response.name,
    global.globalUser.user.name,
    `name matches ${response.name}`
  )
  t.equal(
    response.status,
    global.globalUser.user.status,
    `status matches ${response.status}`
  )
  t.equal(
    response.username,
    global.globalUser.user.username,
    `username matches ${response.username}`
  )
})

test.onFinish(() => {
  process.exit(0)
})
