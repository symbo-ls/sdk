import test from 'tape'

function getAvailableLibrariesTestPositive () {
  test('getAvailableLibraries executed with success', async tape => {
    const response = await globalSdk.getAvailableLibraries()
    tape.ok(response, 'getAvailableLibraries successfully returned data')
  })
}

getAvailableLibrariesTestPositive()

test.onFinish(() => process.exit(0))
