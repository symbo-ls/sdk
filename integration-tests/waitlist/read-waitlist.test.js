import test from 'tape'

test('read the waitlist', async tape => {
  const response = await globalSdk.listWaitlistEntries()
  tape.ok(response)
  const foundAccount = response.items.filter((item) => (item.email.includes('zachary@symbols.app')))
  tape.ok(foundAccount)
})

test.onFinish(() => process.exit(0))
