import test from 'tape'

function getUserTestPositive () {
  test('getUser executed with success', async tape => {
    const response = await globalSdk.getUser(globalUser.userId)
    tape.ok(response, 'response is truthy')
    tape.equal(response.email, globalUser.email, 'email matches')
    tape.equal(response.name, globalUser.name, 'name matches')
  })
}

function getUserTestNegative () {
  test('getUser executed without success because user id is required', async tape => {
    try {
      await globalSdk.getUser('')
    } catch (error) {
      tape.equal(error.message, 'UserId is required', 'User Id is required')
    }
  })
}

getUserTestPositive()
getUserTestNegative()

test.onFinish(() => process.exit(0))
