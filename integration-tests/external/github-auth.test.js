import test from 'tape'
import { authenticateUser } from '../base.js'
import { dataSets } from '../data/githubAuth.objects.negative.js'

// #region Helpers
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })
// #endregion

// #region Tests
function githubAuthTestNegative (dataSet) {
  test(`Github Auth ${dataSet.title}`, async tape => {
    try {
      await sdkInstance.githubAuth(dataSet.token)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `Github Auth failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  githubAuthTestNegative(dataSet)
})
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
