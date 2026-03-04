import test from 'tape'

test('update the waitlist', async tape => {
  let response = await globalSdk.updateWaitlistEntry('69825ddf5193b102c08145d6', { notes: 'test note' })
  tape.equal('test note', response.notes, 'note response')
  response = await globalSdk.listWaitlistEntries()
  let foundAccount = response.items.filter((item) => (item.email.includes('zachary@symbols.app')))
  tape.equal('test note', foundAccount[0].notes, 'note saved')

  // reset the note
  response = await globalSdk.updateWaitlistEntry('69825ddf5193b102c08145d6', { notes: 'reset note' })
  tape.equal('reset note', response.notes, 'reset response')
  response = await globalSdk.listWaitlistEntries()
  foundAccount = response.items.filter((item) => (item.email.includes('zachary@symbols.app')))
  tape.equal('reset note', foundAccount[0].notes, 'reset saved')
})

test('incorrect ID in update', async tape => {
  try {
    await globalSdk.updateWaitlistEntry('invalid ID', { notes: 'test note' })
  } catch (error) {
    tape.equal(
      error.message,
      'Failed to update waitlist entry: Request failed: Cast to ObjectId failed for value "invalid ID" (type string) at path "_id" for model "WaitlistEntry"',
      `updateWaitlistEntry failed: ${error.message}`
    )
  }
})

test('incorrect update', async tape => {
  try {
    await globalSdk.updateWaitlistEntry('69825ddf5193b102c08145d6', { source: 'web' })
  } catch (error) {
    tape.equal(
      error.message,
      'Failed to update waitlist entry: Request failed: Provide at least one of: status, notes, metadata',
      `updateWaitlistEntry failed: ${error.message}`
    )
  }
})

test.onFinish(() => process.exit(0))
