/* eslint-disable require-atomic-updates */
import './setup-env.js'
import { getConfig } from '../src/config/environment.js'
import { SDK } from '../src/index.js'
import { faker } from '@faker-js/faker'
import { JSDOM } from 'jsdom'

async function initializeSdk(tempLocalInstance = false) {
  // Initialize sdk
  console.log('Initializing sdk...')
  const sdk = new SDK()

  await sdk.initialize({
    appKey: 'test-app'
  })

  // Check if globalSdk is ready
  const ready = sdk.isReady()
  if (!ready) {
    console.error('sdk not ready')
    process.exit(1)
  }

  if (tempLocalInstance) {
    return sdk
  }

  global.globalSdk = sdk
}

// Reusable function to create the default project.  Object is read only.
async function createDefaultProject() {
  console.log('Creating default project...')

  if (!global.globalUser?.tokens?.accessToken) {
    console.warn('Skipping default project creation: no auth token available')
    return
  }

  try {
    const createResponse = await global.globalSdk.createProject({
      // Server-side validator (validateExplicitProjectKey) requires the
      // explicit `key` to match [a-z0-9-]+ only — no dots, no underscores,
      // no uppercase. faker uuid is already lowercase hex+dashes.
      key: faker.string.uuid(),
      name: faker.company.name(),
      designTool: 'figma',
      access: 'public',
      isSharedLibrary: false,
      projectType: 'website'
    })

    global.globalSdk.updateContext({ appKey: createResponse?.key })
    global.globalProject = await global.globalSdk.getProject(createResponse?.id)
  } catch (error) {
    console.error('Error creating project', error)
  }
}

async function guestLogin() {
  console.log('Logging in as default user...')
  const auth = global.globalSdk.getService('auth')

  if (!process.env.GUEST_PASSWORD) {
    console.warn('Skipping guest login: GUEST_PASSWORD not configured')
    return
  }

  /**
   * Login a user
   * @param {string} email - User's email
   * @param {string} password - User's password
   */
  try {
    global.globalUser = await auth.login(
      process.env.GUEST_USER,
      process.env.GUEST_PASSWORD
    )
    // Set global object key values
    if (!global.globalUser.user.name) {
      global.globalUser.user.name = 'SDK Test Account'
      global.globalUser.user.email = 'allen+testaccount@symbols.app'
      global.globalUser.user.status = 'active'
    }

    global.globalSdk.updateContext({
      authToken: global.globalUser.tokens.accessToken
    })
  } catch (error) {
    console.error('Error logging in', error)
  }
}

const { window } = new JSDOM(
  '<!DOCTYPE html><html><head></head><body></body></html>',
  {
    url: 'https://sdk-integration.test'
  }
)
global.window = window
global.document = window.document
global.self = window
global.localStorage = window.localStorage
global.sessionStorage = window.sessionStorage

if (typeof global.addEventListener !== 'function') {
  global.addEventListener = window.addEventListener?.bind(window)
}

if (typeof global.removeEventListener !== 'function') {
  global.removeEventListener = window.removeEventListener?.bind(window)
}

if (typeof global.navigator === 'undefined') {
  global.navigator = window.navigator
}

if (typeof global.location === 'undefined') {
  global.location = window.location
}

if (typeof global.performance === 'undefined') {
  global.performance = window.performance
}

if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame =
    window.requestAnimationFrame?.bind(window) ?? (cb => setTimeout(cb, 0))
}

await initializeSdk()
await guestLogin()

export { initializeSdk, guestLogin }
