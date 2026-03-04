import test from 'tape'
import { authenticateUser } from '../base.js'
import { dataSets } from '../data/confirmPasswordChange.objects.negative.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
// #endregion

function confirmPasswordChangeTestNegative (dataSet) {
  test(`confirmPasswordChange ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.confirmPasswordChange(
        dataSet.currentPassword,
        dataSet.newPassword,
        dataSet.verificationCode
      )
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `confirmPasswordChange failed: ${dataSet.title}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  confirmPasswordChangeTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
