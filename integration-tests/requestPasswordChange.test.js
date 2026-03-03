import test from 'tape'

function requestPasswordChangeTestPositive () {
  test('requestPasswordChange executed with success', async tape => {
    const response = await globalSdk.requestPasswordChange()
    tape.equal(
      response.success,
      true,
      `requestPasswordChange successfully requested password change: ${response.message}`
    )
  })
}

requestPasswordChangeTestPositive()

test.onFinish(() => process.exit(0))
