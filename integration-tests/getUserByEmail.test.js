import test from 'tape'

function getUserByEmailTestPositive () {
  test('getUserByEmailTestPositive executed with success', async tape => {
    const response = await globalSdk.getUserByEmail(globalUser.email)
    tape.ok(response, 'response is truthy')
    tape.equal(response.email, globalUser.email, 'email matches')
    tape.equal(response.name, globalUser.name, 'name matches')
  })
}

function getUserByEmailTestNegative () {
  test('getUserByEmailTestPositive executed without success because Email is required', async tape => {
    try {
      await globalSdk.getUserByEmail('')
    } catch (error) {
      tape.equal(error.message, 'Email is required', 'Email is required')
    }
  })
  test('getUserByEmailTestPositive executed without success because Email does not exists', async tape => {
    const response = await globalSdk.getUserByEmail('nonexistingemail@test.com')
    tape.notOk(response, 'response is null')
  })
}

getUserByEmailTestPositive()
getUserByEmailTestNegative()

test.onFinish(() => process.exit(0))
