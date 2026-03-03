import test from 'tape'

function checkProjectKeyAvailabilityTestNegative () {
  test('checkProjectKeyAvailability executed without success because key is required', async tape => {
    try {
      await globalSdk.checkProjectKeyAvailability('')
    } catch (error) {
      tape.equal(
        error.message,
        'Failed to check project key availability: Function call failed: [projects:check-key] Project key is required.',
        'checkProjectKeyAvailability failed: Project key is required'
      )
    }
  })
}

function checkProjectKeyAvailabilityTestPositive () {
  test('checkProjectKeyAvailability executed with success', async tape => {
    const response = await globalSdk.checkProjectKeyAvailability('some-key')
    tape.ok(response, 'checkProjectKeyAvailability executed successfully')
    tape.equal(response.available, true, 'key is available')
    tape.equal(response.key, 'some-key', 'key is some-key')
  })
}

checkProjectKeyAvailabilityTestPositive()
checkProjectKeyAvailabilityTestNegative()

test.onFinish(() => process.exit(0))
