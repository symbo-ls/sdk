import test from 'tape'
import { dataSets } from './data/passwordReset.objects.negative.js'

/* function requestPasswordResetTestPositive (email, callbackUrl, title) {
  test(`requestPasswordReset ${title}`, async tape => {
    const response = await globalSdk.requestPasswordReset(email, callbackUrl)
    console.log('res', response)
  })
}

requestPasswordResetTestPositive(process.env.GUEST_EMAIL, 'http://test.com') */

function requestPasswordResetTestNegative (
  email,
  callbackUrl,
  title,
  errorMessage
) {
  test(`requestPasswordReset ${title}`, async tape => {
    try {
      await globalSdk.requestPasswordReset(email, callbackUrl)
    } catch (error) {
      tape.equal(
        error.message,
        errorMessage,
        `requestPasswordReset failed: ${errorMessage}`
      )
    }
  })
}

function confirmPasswordResetTestNegative (
  token,
  password,
  title,
  errorMessage
) {
  test(`confirmPasswordReset ${title}`, async tape => {
    try {
      await globalSdk.confirmPasswordReset(token, password)
    } catch (error) {
      tape.equal(
        error.message,
        errorMessage,
        `confirmPasswordReset failed: ${errorMessage}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const { title, error, ...dataSet } = dataSets[key]
  if (key.startsWith('requestPasswordReset')) {
    requestPasswordResetTestNegative(
      dataSet.email,
      dataSet.callbackUrl,
      title,
      error
    )
  }
  if (key.startsWith('confirmPasswordReset')) {
    confirmPasswordResetTestNegative(
      dataSet.token,
      dataSet.password,
      title,
      error
    )
  }
})

test.onFinish(() => process.exit(0))
