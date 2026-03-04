import test from 'tape'
import { initializeSdk, guestLogin } from '../index.js'

// #region Tests
test('should destroy the sdk instance', async t => {
  const tempSdk = await initializeSdk(true)
  await tempSdk.destroy()
  t.notOk(tempSdk.isReady(), 'sdk successfully destroyed.')
  t.ok(global.globalSdk.isReady(), 'globalSdk was not damaged')
  await guestLogin()
  t.ok(global.globalUser, 'global.globalUser still exists')
  t.end()
})

// #endregion
test.onFinish(() => {
  process.exit(0)
})
