import test from 'tape'
import { authenticateUser } from '../base.js'

// #region Helpers
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })

function getAvailableLibrariesTestPositive () {
  test('getAvailableLibraries executed with success', async tape => {
    const response = await sdkInstance.getAvailableLibraries()
    tape.ok(response, 'getAvailableLibraries successfully returned data')
  })
}

getAvailableLibrariesTestPositive()

test.onFinish(() => process.exit(0))
