import test from 'tape'

test('join a waitlist without email', async tape => {
  const data = {}
  try {
    await globalSdk.joinWaitlist(data)
  } catch (error) {
    tape.equal(
      error.message,
      'Email is required',
      `joinWaitlist failed: ${error.message}`
    )
  }
})

test('join a waitlist with an incorrect email', async tape => {
  const data = { email: 'incorrect email format' }
  try {
    await globalSdk.joinWaitlist(data)
  } catch (error) {
    tape.equal(
      error.message,
      'Failed to join waitlist: Request failed: Please provide a valid email address',
      `joinWaitlist failed: ${error.message}`
    )
  }
})

test('join a waitlist', async tape => {
  const data = { email: 'zachary@symbols.app' }
  const response = await globalSdk.joinWaitlist(data)
  tape.equal(data.email, response.email, 'emails do not match')
  tape.equal('api', response.source, 'source is incorrect')
  tape.equal('waiting', response.status, 'status is incorrect')
  tape.ok(response)
})

test.onFinish(() => process.exit(0))
