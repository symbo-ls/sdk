import test from 'tape'
import { dataSets } from '../data/confirmRegistration.objects.negative.js'

function confirmRegistrationTestNegative (dataSet) {
  test(`confirmRegistration ${dataSet.title}`, async tape => {
    try {
      await global.globalSdk.confirmRegistration(dataSet.token)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `confirmRegistration failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  confirmRegistrationTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
