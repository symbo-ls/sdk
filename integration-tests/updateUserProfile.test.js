import test from 'tape'
import { createAndGetUser, destroySdk } from './base.js'
import { initializeSdk } from './index.js'
import { faker } from '@faker-js/faker'

const updateProfileSdk = await initializeSdk(true)

test('updateUserProfile executed with success', async tape => {
  const user = await createAndGetUser({
    login: true,
    sdkInstance: updateProfileSdk
  })

  updateProfileSdk.updateContext({ authToken: user.token })
  const response = await updateProfileSdk.updateUserProfile({
    name: faker.internet.username().replace(/[^a-zA-Z]+/g, '')
  })
  tape.equal(response.success, true, response.message)
})

test('updateUserProfile failed: At least one field to update must be provided', async tape => {
  try {
    await globalSdk.updateUserProfile()
  } catch (error) {
    tape.equal(
      error.message,
      'Failed to update user profile: Function call failed: [users:update-profile] At least one field to update must be provided.',
      'Failed to update user profile: At least one field to update must be provided.'
    )
  }
})

test('Destroy Profile SDK', t => {
  destroySdk(updateProfileSdk)
  t.end()
})

test.onFinish(() => process.exit(0))
