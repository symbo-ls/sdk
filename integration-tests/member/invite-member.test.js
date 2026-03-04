import test from 'tape'
import { dataSets } from '../data/inviteMember.objects.negative.js'
import { createAndGetProject } from '../base.js'
import { faker } from '@faker-js/faker'

function inviteMemberTestPositive () {
  test('inviteMember executed with success', async tape => {
    const project = await createAndGetProject()

    const response = await globalSdk.inviteMember(
      project.id,
      faker.internet.email().toLowerCase(),
      'admin',
      globalUser.name,
      { url: 'test.com' }
    )
    tape.equal(response.role, 'admin')
    tape.equal(response.projectId, project.id)
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
