import test from 'tape'

const testUser = await global.globalSdk.getUserByEmail('zachary@symbols.app')

test('deactivate a user', async tape => {
  const response = await global.globalSdk.deactivateUser(testUser.id)
  tape.equal(response.status, 'inactive', 'User deactivated.')
})

test('activate a user', async tape => {
  const response = await global.globalSdk.activateUser(testUser.id)
  tape.equal(response.status, 'active', 'User activated.')
})

test('suspend a user', async tape => {
  const response = await global.globalSdk.suspendUser(testUser.id)
  tape.equal(response.status, 'suspended', 'User suspended.')
})

test.onFinish(() => process.exit(0))
