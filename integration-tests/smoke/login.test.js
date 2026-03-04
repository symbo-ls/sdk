import test from 'tape'
import { dataSets } from '../data/login.objects.negative.js'

const loginSdk = Object.create(global.globalSdk)

test('Login Test', async tape => {
  tape.ok(
    Object.keys(global.globalUser.tokens).length !== 0,
    'Login successful: tokens object is not empty'
  )
  tape.ok(
    global.globalUser.user.id !== '' && global.globalUser.user.id.length > 0,
    'Login successful: UserId is not empty'
  )
})

function loginTestNegative (dataSet) {
  test(`Login ${dataSet.title}`, async tape => {
    try {
      await loginSdk.login(dataSet.email, dataSet.password)
    } catch (error) {
      tape.equal(error.message, dataSet.error, `Login failed: ${dataSet.error}`)
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  loginTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
