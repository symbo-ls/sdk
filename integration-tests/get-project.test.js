import test from 'tape'

function getProjectTestPositive () {
  test('getProject executed with success', async tape => {
    const response = await globalSdk.getProject(globalProject.id)
    tape.ok(response, 'getProject successfully returned data')
    tape.true(Object.keys(response).length > 0, 'project object is defined')
  })
}

function getProjectTestNegative () {
  test('getProject failed: project id is required', async tape => {
    try {
      await globalSdk.getProject('')
    } catch (error) {
      tape.equal(
        error.message,
        'Project ID is required',
        'getProject failed: Project ID is required'
      )
    }
  })
}

getProjectTestPositive()
getProjectTestNegative()

test.onFinish(() => process.exit(0))
