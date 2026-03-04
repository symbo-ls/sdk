import test from 'tape'
import { authenticateUser } from '../base.js'
import { dataSets } from '../data/googleAuth.objects.negative.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })
// #endregion

// #region Tests
function googleAuthTestNegative (dataSet) {
  test(`Google Auth ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.googleAuth(dataSet.token)
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
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
