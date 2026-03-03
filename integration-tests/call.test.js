import test from 'tape'

function callTestPositive () {
  test('call based function should be executed with success', async tape => {
    const response = await globalSdk.call('projects:get', {
      projectId: globalProject.id
    })
    tape.ok(response, 'call based function executed with success')
    tape.true(Object.keys(response).length > 0, 'project object is defined')
  })
}

callTestPositive()

test.onFinish(() => process.exit(0))
