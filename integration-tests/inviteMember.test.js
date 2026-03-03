import test from 'tape'
import { dataSets } from './data/inviteMember.objects.negative.js'
import { createAndGetProject, createAndGetUser } from './base.js'

function inviteMemberTestPositive () {
  test('inviteMember executed with success', async tape => {
    const project = await createAndGetProject()
    const user = await createAndGetUser()

    const response = await globalSdk.inviteMember(
      project.id,
      user.email,
      'admin',
      user.name,
      { url: 'test.com' }
    )
    tape.ok(response.success, response.message)
  })
}

function inviteMemberTestNegative (dataSet) {
  test(`inviteMember: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.inviteMember(
        dataSet.projectId,
        dataSet.email,
        dataSet.role,
        dataSet.name,
        dataSet.callbackUrl
      )
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `getProjectMembers failed: ${dataSet.error}`
      )
    }
  })
}

inviteMemberTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  inviteMemberTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
