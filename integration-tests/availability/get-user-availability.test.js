import test from 'tape'

test('get user availability', async tape => {
  const user = await global.globalSdk.getUserByEmail('nika@symbols.app')
  const availability = await global.globalSdk.getService('availabilityRules').list({
    user: user.id,
    workspaceId: user.workspaces?.[0]?.id
  })

  tape.ok(availability, 'availability rules returned')
})

test.onFinish(() => process.exit(0))
