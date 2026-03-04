import test from 'tape'

function getUserByEmailTestPositive () {
  test('getUserByEmailTestPositive executed with success', async tape => {
    const response = await global.globalSdk.getUserByEmail('nika@symbols.app')

    tape.ok(response, 'Successful response from call to getUserByEmail')
    tape.equal(response.email, 'nika@symbols.app', 'Email matches')
  })
}

function getUserByEmailTestNegative () {
  test('getUserByEmailTestPositive executed without success because Email is required', async tape => {
    try {
      await global.globalSdk.getUserByEmail('')
    } catch (error) {
      tape.equal(error.message, 'Email is required', 'Email is required')
    }
  })
  test('getUserByEmailTestPositive executed without success because Email does not exists', async tape => {
    try {
      await global.globalSdk.getUserByEmail('nonexistingemail@test.com')
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to get user by email: Request failed: No user found with the specified criteria',
        'Failed to get user by email'
      )
    }
  })
}

getUserByEmailTestPositive()
getUserByEmailTestNegative()

test.onFinish(() => process.exit(0))
