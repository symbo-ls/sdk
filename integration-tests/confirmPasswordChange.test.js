import test from 'tape'
import { dataSets } from './data/confirmPasswordChange.objects.negative.js'

function confirmPasswordChangeTestNegative (dataSet) {
  test(`confirmPasswordChange ${dataSet.title}`, async tape => {
    try {
      await globalSdk.confirmPasswordChange(
        dataSet.verificationCode,
        dataSet.newPassword,
        dataSet.confirmPassword
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
