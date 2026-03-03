import { SDK } from '../src/index.js'
import dotenv from 'dotenv'
import { faker } from '@faker-js/faker'
import { JSDOM } from 'jsdom'

dotenv.config()

async function initializeSdk (tempLocalInstance = false) {
  // Initialize sdk
  console.log('Initializing sdk...')
  const sdk = new SDK({
    useNewServices: true,
    socketUrl: 'https://test.api.symbols.app',
    apiUrl: 'https://test.api.symbols.app',
    basedEnv: 'testing',
    basedProject: 'platform-v2-sm',
    basedOrg: 'symbols'
  })

  await sdk.initialize({
    appKey: 'test-app',
    based: {
      env: 'testing',
      project: 'platform-v2-sm',
      org: 'symbols'
    }
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

//Reusable function to create the default project.  Object is read only.
async function createDefaultProject () {
  console.log('Creating default project...')
  try {
    const createResponse = await globalSdk.createProject({
      key: `${faker.string.uuid()}.symbo.ls`.toLowerCase(),
      name: faker.company.name(),
      designTool: 'figma',
      access: 'public',
      isSharedLibrary: false
    })

    globalSdk.updateContext({ appKey: createResponse?.key })
    global.globalProject = await globalSdk.getProject(createResponse?.id)
  } catch (error) {
    console.error('Error creating project', error)
  }
}

async function guestLogin () {
  console.log('Logging in as default user...')
  const auth = globalSdk.getService('auth')
  /**
   * Login a user
   * @param {string} email - User's email
   * @param {string} password - User's password
   */
  try {
    global.globalUser = await auth.login(
      'zajim@symbols.app',
      process.env.GUEST_PASSWORD
    )
    // Set global object key values
    if (!globalUser.name) {
      globalUser.name = 'RileyMedhurst'
      globalUser.email = 'zajim@symbols.app'
      globalUser.type = 'user'
    }

    globalSdk.updateContext({ authToken: globalUser.token })
  } catch (error) {
    console.error('Error logging in', error)
  }
}

const { window } = new JSDOM()
global.window = window
global.document = window.document
global.navigator = { userAgent: 'node.js' }

await initializeSdk()
await guestLogin()
await createDefaultProject()

export { initializeSdk }
