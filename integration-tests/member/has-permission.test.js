import test from 'tape'
import { createAndGetUser } from '../base.js'
import { pageDataSets } from '../data/hasPermission.objects.js'

const hasPermissionSdk = Object.create(globalSdk)

async function setup (globalRoleSetting, projectRoleSetting) {
  hasPermissionSdk.updateContext({
    state: {
      userId: globalUser.id,
      globalRole: globalRoleSetting,
      projectRole: projectRoleSetting
    }
  })
}

Object.keys(pageDataSets).forEach(key => {
  test(`test ${key} permissions`, async tape => {
    await setup(key, key)
    Object.values(pageDataSets[key].allowed).forEach(async value => {
      const response = await hasPermissionSdk.hasPermission(value)
      tape.true(response, `Permission ${value} for ${key} is allowed`)
    })
    Object.values(pageDataSets[key].denied).forEach(async value => {
      const response = await hasPermissionSdk.hasPermission(value)
      tape.false(response, `Permission ${value} for ${key} is denied`)
    })
  })
})

test.onFinish(() => process.exit(0))
