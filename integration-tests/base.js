import { faker } from '@faker-js/faker'
import { SDK } from '../src/index.js'
import { getConfig } from '../src/config/environment.js'

// Reusable function to create a new project.
async function createAndGetProject (
  isSharedLibrary = true,
  sdkInstance = globalSdk
) {
  try {
    const response = await sdkInstance.createProject({
      key: `${faker.string.uuid()}.symbo.ls`.toLowerCase(),
      name: faker.company.name(),
      designTool: 'figma',
      access: 'public',
      isSharedLibrary
    })

    sdkInstance.updateContext({ appKey: response?.key })
    return await sdkInstance.getProject(response?.id)
  } catch (error) {
    console.error('Error creating project', error)
  }
}

async function authenticateUser (sdkInstance = globalSdk) {
  let accountEmail = 'zajim@symbols.app'
  let accountPassword = process.env.GUEST_PASSWORD
  if (process.env.LOCAL_TEST_ENV === 'true') {
    accountEmail = process.env.LOCAL_EMAIL
    accountPassword = process.env.LOCAL_PASSWORD
  }

  const auth = sdkInstance.getService('auth')
  await auth.login(accountEmail, accountPassword)
  sdkInstance.updateContext({ authToken: globalUser.token })
  return auth
}

// Reusable function to create a new user.
async function createAndGetUser ({
  login = false,
  sdkInstance = globalSdk,
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
    await sdkInstance.setUser(user)

    if (!login && !sdkInstance) {
      await globalSdk.setUser(user)
    } else if (!login && sdkInstance) {
      await authenticateUser()
      await sdkInstance.setUser(user)
      const getUserEmailResponse = await sdkInstance.getUserByEmail(email)
      user.id = getUserEmailResponse.id
    } else {
      await authenticateUser()
      await sdkInstance.setUser(user)
      const loginResponse = await auth.login(email, password)
      user.token = loginResponse.token
      user.id = loginResponse.userId
      sdkInstance.updateContext({ authToken: loginResponse.token })
    }

    return user
  } catch (error) {
    console.error(error)
  }
}

function createRandomPassword (length = 8) {
  const generatePassword = () => {
    const uppercase = String.fromCharCode(Math.floor(Math.random() * 26) + 65)
    const lowercase = String.fromCharCode(Math.floor(Math.random() * 26) + 97)
    const number = String.fromCharCode(Math.floor(Math.random() * 10) + 48)
    const special = String.fromCharCode(Math.floor(Math.random() * 15) + 33)
    const remaining = Array.from({ length }, () =>
      String.fromCharCode(Math.floor(Math.random() * 94) + 33)
    ).join('')
    return [uppercase, lowercase, number, special, ...remaining]
      .sort(() => 0.5 - Math.random())
      .join('')
  }
  return generatePassword()
}

async function destroySdk (instanceName) {
  await instanceName.destroy()

  const ready = instanceName.isReady()
  if (ready) {
    console.error('sdk not destroyed')
  }
}

async function getSdkStatus () {
  // Get detailed status
  const status = await globalSdk.getStatus()
  console.log(status)
}

export {
  authenticateUser,
  createAndGetProject,
  createRandomPassword,
  createAndGetUser,
  destroySdk,
  getSdkStatus
}
