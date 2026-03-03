import test from 'tape'

function updateContextTestPositive () {
  test('updateContext executed with success', async tape => {
    tape.ok(
      !globalSdk._context.newContext,
      'new context does not exists inside _context'
    )
    await globalSdk.updateContext({
      newContext: {
        name: 'new context',
        description: 'new context description',
        type: 'context'
      }
    })
    tape.ok(
      globalSdk._context.newContext,
      'new context is added to the _context'
    )
    tape.equal(
      globalSdk._context.newContext.name,
      'new context',
      'newContext.name is defined'
    )
    tape.equal(
      globalSdk._context.newContext.description,
      'new context description',
      'newContext.description is defined'
    )
  })
}

updateContextTestPositive()

test.onFinish(() => process.exit(0))
