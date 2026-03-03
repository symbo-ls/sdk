import test from 'tape'
import { createAndGetUser } from './base.js'
import { dataSets } from './data/updateUserRole.objects.negative.js'

// This test requires a user with permission to update roles.
test('Update user role', async tape => {
  const globalSdkClone = Object.create(globalSdk)
  const user = await createAndGetUser()
  await createAndGetUser({
    login: true,
    sdkInstance: globalSdkClone,
    role: 'owner'
  })
  const response = await globalSdkClone.updateUserRole(user.id, 'admin')
  tape.ok(response.success, 'updateUserRole executed with success')
  const auth = globalSdkClone.getService('auth')
  const loginResponse = await auth.login(user.email, user.password)
  tape.equal(loginResponse.globalRole, 'admin', 'user has been set as admin')
})

function updateUserRoleTestNegative (dataSet) {
  test(`Update user role: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.updateUserRole(dataSet.userId, dataSet.role)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `updateUserRole failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  updateUserRoleTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
