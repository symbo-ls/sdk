/* eslint-disable no-use-before-define */
import { faker } from '@faker-js/faker'
import { getConfig } from '../src/config/environment.js'

// Reusable function to create a new project.
async function createAndGetProject(
  isSharedLibrary = true,
  sdkInstance = global.globalSdk
) {
  // faker.seed(0)
  try {
    const response = await sdkInstance.createProject({
      // Server-side validator (normalizeProjectSlug) truncates to 48
      // chars and rejects input that isn't equal to the truncated form.
      // Plain faker uuid is 36 chars + [a-z0-9-] only — well within the
      // budget and collision-free across runs.
      key: faker.string.uuid(),
      name: faker.company.name(),
      designTool: 'figma',
      access: 'public',
      isSharedLibrary,
      projectType: 'website'
    })

    sdkInstance.updateContext({ appKey: response?.key })
    return await sdkInstance.getProject(response?.id)
  } catch (error) {
    console.error('Error creating project', error)
  }
}

async function authenticateUser(sdkInstance = global.globalSdk) {
  let accountEmail = process.env.GUEST_USER
  let accountPassword = process.env.GUEST_PASSWORD
  if (process.env.LOCAL_TEST_ENV === 'true') {
    accountEmail = process.env.LOCAL_EMAIL
    accountPassword = process.env.LOCAL_PASSWORD
  }

  const auth = sdkInstance.getService('auth')
  await auth.login(accountEmail, accountPassword)
  sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })
  return auth
}

// Reusable function to create a new user.
async function createAndGetUser({
  login = false,
  sdkInstance = global.globalSdk,
  role = 'guest'
} = {}) {
  try {
    const email = faker.internet.email().toLowerCase()
    const password = createRandomPassword()

    const user = {
      email,
      password,
      name: faker.person.firstName(),
      status: 'confirmed',
      globalRole: role
    }

    const auth = await authenticateUser(sdkInstance)
    await sdkInstance.register(user)

    if (!login && sdkInstance) {
      const getUserEmailResponse = await sdkInstance.getUserByEmail(email)
      user.id = getUserEmailResponse.id
    } else {
      const loginResponse = await auth.login(email, password)
      user.token = loginResponse.tokens.accessToken
      user.id = loginResponse.user.id
      sdkInstance.updateContext({ authToken: loginResponse.tokens.accessToken })
    }

    return user
  } catch (error) {
    console.error(error)
  }
}

function createRandomPassword(length = 8) {
  const generatePassword = () => {
    const uppercase = String.fromCharCode(Math.floor(Math.random() * 26) + 65)
    const lowercase = String.fromCharCode(Math.floor(Math.random() * 26) + 97)
    const number = String.fromCharCode(Math.floor(Math.random() * 10) + 48)
    const special = `${String.fromCharCode(
      Math.floor(Math.random() * 4) + 35
    )}%`
    const remaining = Array.from({ length }, () =>
      String.fromCharCode(Math.floor(Math.random() * 94) + 33)
    ).join('')
    return [uppercase, lowercase, number, special, ...remaining]
      .sort(() => 0.5 - Math.random())
      .join('')
  }
  return generatePassword()
}

async function destroySdk(instanceName) {
  await instanceName.destroy()

  const ready = instanceName.isReady()
  if (ready) {
    console.error('sdk not destroyed')
  }
}

async function getSdkStatus() {
  // Get detailed status
  const status = await global.globalSdk.getStatus()
  console.log(status)
}

// Determine env for conditional test execution. The SDK's `getConfig()`
// exposes `channel` (canonical channel name) plus boolean flags
// (`isDevelopment`, `isTest`, `isStaging`, `isPreview`, `isProduction`) — use
// those instead of the removed `basedEnv` field.
function isDevelopment() {
  return getConfig().channel === 'development' || getConfig().channel === 'local'
}

function isTesting() {
  return getConfig().isTest === true
}

function isStaging() {
  return getConfig().channel === 'staging'
}

function isProduction() {
  return getConfig().channel === 'production'
}

/**
 * Poll `predicate` every `interval` ms until it returns a truthy value or
 * `timeout` ms elapse. Resolves with the truthy value, or throws with a
 * descriptive timeout message (including the last seen error if any).
 *
 * Use instead of `await sleep(N); await fetchOnce()`. Tests pass faster
 * when conditions land early and fail with a meaningful message when
 * they don't.
 */
async function waitFor(predicate, { timeout = 20000, interval = 500, message } = {}) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    try {
      const result = await predicate()
      if (result) return result
    } catch (err) {
      lastError = err
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  const suffix = lastError ? ` (last error: ${lastError.message})` : ''
  throw new Error(
    `waitFor timed out after ${timeout}ms${message ? ': ' + message : ''}${suffix}`
  )
}

export {
  authenticateUser,
  createAndGetProject,
  createRandomPassword,
  createAndGetUser,
  destroySdk,
  getSdkStatus,
  isDevelopment,
  isTesting,
  isStaging,
  isProduction,
  waitFor
}
