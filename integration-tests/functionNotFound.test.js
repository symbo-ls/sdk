import test from 'tape'

const functions = [
  'updateState',
  'getState',
  'destroy',
  'updateSchema',
  'subscribeChannel',
  'publishToChannel',
  'chooseProject'
]

function updateStateTestNegative (funcName) {
  test(`${funcName} failed: ${funcName} is not a function`, async tape => {
    try {
      await globalSdk.call(funcName)
    } catch (error) {
      tape.equal(
        error.message,
        `Function call failed: [${funcName}] Function not found.`,
        `${funcName} failed: ${funcName} is not a function`
      )
    }
  })
}

functions.forEach(updateStateTestNegative)

test.onFinish(() => process.exit(0))
