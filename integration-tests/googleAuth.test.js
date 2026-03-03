import test from 'tape'
import { dataSets } from './data/googleAuth.objects.negative.js'

function googleAuthTestNegative (dataSet) {
  test(`Google Auth ${dataSet.title}`, async tape => {
    try {
      await globalSdk.googleAuth(dataSet.token)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `Google Auth failed ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  googleAuthTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
