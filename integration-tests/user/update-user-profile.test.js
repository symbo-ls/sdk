import test from 'tape'
import { faker } from '@faker-js/faker'

const updateProfileSdk = Object.create(globalSdk)

test('updateUserProfile executed with success', async tape => {
  updateProfileSdk.updateContext({ authToken: globalUser.tokens.accessToken })
  const newName = faker.internet.username().replace(/[^a-zA-Z]+/g, '')
  const response = await updateProfileSdk.updateUserProfile({
    name: newName
  })
  tape.equal(response.name, newName, 'name updated')
})

test('updateUserProfile failed: At least one field to update must be provided', async tape => {
  try {
    await globalSdk.updateUserProfile()
  } catch (error) {
    tape.equal(
      error.message,
      'Failed to update user profile: Request failed: Please provide valid fields to update',
      'Failed to update user profile: Request failed: Please provide valid fields to update'
    )
  }
})

test.onFinish(() => process.exit(0))
