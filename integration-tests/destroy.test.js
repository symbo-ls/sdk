import test from 'tape'
import { initializeSdk } from './index.js'

// #region Tests
test('should destroy the sdk instance', async t => {
  const tempSdk = await initializeSdk(true)
  await tempSdk.destroy()
  t.notOk(tempSdk.isReady(), 'sdk successfully destroyed.')
  t.end()
})
// #endregion

test.onFinish(() => process.exit(0))
