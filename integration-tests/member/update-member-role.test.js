import test from 'tape'
import { createAndGetProject, createAndGetUser } from '../base.js'
import { dataSets } from '../data/updateMemberRole.objects.negative.js'
import { faker } from '@faker-js/faker'

test("Update project member's role", async tape => {
  const project = await createAndGetProject()
  const response = await globalSdk.updateMemberRole(
    project.id,
    project.members[0].id,
    'admin'
  )
  tape.equal('admin', response.role, 'new member of the project is an admin')
  const fullProject = await globalSdk.getProject(project.id)
  const newMemberRole = fullProject?.members[0].role
  tape.equal('admin', newMemberRole, 'new member of the project is an admin')
})

function updateMemberRoleTestNegative (dataSet) {
  test(`Update Member role: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.updateMemberRole(
        dataSet.projectId,
        dataSet.userId,
        dataSet.role
      )
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `updateMemberRole failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  updateMemberRoleTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
