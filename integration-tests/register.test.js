import test from 'tape'
import { faker } from '@faker-js/faker'
import { createRandomPassword } from './base.js'
import { userDataSets } from './data/registration.objects.negative.js'

// Rather than create a separate file to loop through, putting this into a function as there are only two scenarios.
function regTest (testName, userName) {
  test(`Register ${testName}`, async t => {
    // Register positive test
    const randomEmail = faker.internet.email()
    const password = createRandomPassword()
    const expectedName =
      typeof userName === 'undefined' ? randomEmail.split('@')[0] : userName

    const regResponse = await globalSdk.register({
      email: randomEmail,
      password,
      name: userName,
      callbackUrl: 'https://example.com'
    })
    t.ok(regResponse.success, 'Registration successful')
    t.ok(typeof regResponse.id === 'string', 'Registration ID is a string')
    const { id } = regResponse

    // Verify registered user status
    const based = globalSdk.getService('based')
    /**
     * Fetch a user
     * @param {string} userId - User ID
     */
    const userStatus = await based.getUser(id)
    t.equal(userStatus.id, id, 'User ID matches')
    t.equal(userStatus.name, expectedName, 'User name matches expected name')
    t.equal(userStatus.email, randomEmail.toLowerCase(), 'User email matches')
    t.ok(userStatus.projects.length === 0, 'User has no projects')
  })
}

regTest('With Name', 'Valid Name')
regTest('Without Name')

// tape does not have a function for data driven testing
Object.keys(userDataSets).forEach(key => {
  test(`Register - ${key}`, async t => {
    const { error, ...userDataSet } = userDataSets[key]

    // globalSdk throws error when request is malformed
    try {
      const regResponse = await globalSdk.register(userDataSet)
      t.fail(
        `Registration did not fail as expected. Response = ${JSON.stringify(
          regResponse
        )}`
      )
    } catch (e) {
      t.ok(e, 'Registration failed as expected')
      t.equal(e.message, error, 'Error message matches')
    }
  })
})
test.onFinish(() => process.exit(0))
