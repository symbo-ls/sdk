import test from 'tape'

test('list user availability', async tape => {
  const user = await global.globalSdk.getUserByEmail('zachary@symbols.app')
  const availability = await global.globalSdk.getService('availabilityRules').list({
    user: user.id,
    workspaceId: user.workspaces?.[0]?.id
  })
  console.log('availability: ' + JSON.stringify(availability))
  tape.ok(availability, 'availability rules returned')
})

test('intersect availability', async tape => {
  const user1 = await global.globalSdk.getUserByEmail('zachary@symbols.app')
  const user2 = await global.globalSdk.getUserByEmail('jerry@symbols.app')
  const availability = await global.globalSdk.getService('availabilityRules').intersect(
    [user1.id, user2.id],
    user1.workspaces?.[0]?.id
  )
  tape.ok(availability, 'availability rules returned')
})

test.onFinish(() => process.exit(0))
