import test from 'tape'
import { dataSets } from './data/login.objects.negative.js'
import { initializeSdk } from './index.js'
import { createAndGetUser, destroySdk } from './base.js'
import { faker } from '@faker-js/faker'

const loginSdk = await initializeSdk(true)

test('Login Test', async tape => {
  const response = await createAndGetUser({
    login: true,
    sdkInstance: loginSdk
  })

  tape.ok(
    response.token !== '' && response.token.length > 0,
    'Login successful: Token is not empty'
  )
  tape.ok(
    response.id !== '' && response.id.length > 0,
    'Login successful: UserId is not empty'
  )
})

function loginTestNegative (dataSet) {
  test(`Login ${dataSet.title}`, async tape => {
    try {
      await globalSdk.login(dataSet.email, dataSet.password)
    } catch (error) {
      tape.equal(error.message, dataSet.error, `Login failed: ${dataSet.error}`)
    }
  })
}

function loginTestEmailIsNotConfirmed () {
  test('Login failed: Email is not confirmed', async tape => {
    const createdUser = await globalSdk.setUser({
      email: faker.internet.email().toLowerCase(),
      password: 'Some-password12_#',
      name: faker.person.firstName()
    })

    try {
      await globalSdk.login(createdUser.email, 'Some-password12_#')
    } catch (error) {
      tape.equal(
        error.message,
        'Login failed: [users:login] Identifier and Password required.',
        'Login failed because email is not confirmed'
      )
    }
  })
}

loginTestEmailIsNotConfirmed()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  loginTestNegative(dataSet)
})

test('Destroy Login SDK', t => {
  destroySdk(loginSdk)
  t.end()
})

test.onFinish(() => process.exit(0))
