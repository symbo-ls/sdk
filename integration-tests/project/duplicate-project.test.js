/* eslint-disable no-empty-function */
/* eslint-disable no-await-in-loop */
import test from 'tape'
import { faker } from '@faker-js/faker'
import { authenticateUser, createAndGetUser, isProduction } from '../base.js'
import { duplicateProjectDataSets } from '../data/duplicateProject.objects.negative.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)

sdkInstance.updateContext({
  state: {
    quietUpdate () {},
    getByPath () {},
    setPathCollection () {}
  }
})
// #endregion

test('duplicateProject executed with success', async tape => {
  const newName = faker.string.uuid()
  const response = await global.globalSdk.duplicateProject(
    global.globalProject._id,
    newName,
    `${faker.string.uuid()}.symbo.ls`
  )

  tape.equal(response.name, newName, 'Project is successfully set')
})

if (isProduction()) {
  test.skip('should duplicate the project and assign a new user')
} else {
  test('should duplicate the project and assign a new user', async t => {
    const testUser = await createAndGetUser({
      login: true,
      sdkInstance,
      role: 'admin'
    })
    const getMeResponse = await sdkInstance.getMe()
    const testUserName = getMeResponse.user.username
    const newName = faker.string.uuid()
    const duplicateProjectResponse = await global.globalSdk.duplicateProject(
      global.globalProject._id,
      newName,
    `${faker.string.uuid()}.symbo.ls`,
    testUser.id
    )

    const getProjectResponse = await sdkInstance.getProject(duplicateProjectResponse.id)

    t.equal(getProjectResponse.owner.id, testUser.id, 'Project Owner id matches expected id')
    t.equal(getProjectResponse.owner.username, testUserName, 'Project owner username matches expected username')
  })
}

test('duplicateProject should throw an error when provided with invalid input', async tape => {
  for (const key of Object.keys(duplicateProjectDataSets)) {
    const { projectId, companyName, newKey, error } =
      duplicateProjectDataSets[key]

    try {
      const response = await global.globalSdk.duplicateProject(
        projectId,
        companyName,
        newKey
      )
      tape.fail(
        `Project duplication did not fail as expected. Response = ${JSON.stringify(
          response
        )}`
      )
    } catch (e) {
      tape.equal(e.message, error, `Error message matches for case: "${key}"`)
    }
  }
})

test.onFinish(() => process.exit(0))
