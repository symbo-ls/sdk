import test from 'tape'

function getUserTestPositive () {
  test('getUser executed with success', async tape => {
    const response = await global.globalSdk.getUser(global.globalUser.user.id)
    tape.ok(response, 'response is truthy')
    tape.equal(response.email, global.globalUser.user.email, 'email matches')
    tape.equal(response.name, global.globalUser.user.name, 'name matches')
    tape.equal(response.id, global.globalUser.user.id, 'id matches')
  })
}

function getUserTestNegative () {
  test('getUser executed without success because user id is required', async tape => {
    try {
      await global.globalSdk.getUser('')
    } catch (error) {
      tape.equal(error.message, 'User ID is required', 'User ID is required')
    }
  })
}

getUserTestPositive()
getUserTestNegative()

test.onFinish(() => process.exit(0))
