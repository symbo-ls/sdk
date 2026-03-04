import test from 'tape'

function getProjectLibrariesTestPositive () {
  test('getProjectLibraries executed with success', async tape => {
    const response = await globalSdk.getProjectLibraries(globalProject.id)
    tape.ok(response, 'getProjectLibraries successfully returned data')
  })
}

function getProjectLibrariesTestNegative () {
  test('getProjectLibraries executed with success', async tape => {
    try {
      await globalSdk.getProjectLibraries('')
    } catch (error) {
      tape.equal(
        error.message,
        'Project ID is required',
        'getProjectLibraries failed: Project ID is required'
      )
    }
  })
}

getProjectLibrariesTestPositive()
getProjectLibrariesTestNegative()

test.onFinish(() => process.exit(0))
