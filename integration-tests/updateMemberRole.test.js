import test from 'tape'
import { createAndGetProject, createAndGetUser } from './base.js'
import { dataSets } from './data/updateMemberRole.objects.negative.js'

test("Update project member's role", async tape => {
  const project = await createAndGetProject()
  const newMember = await createAndGetUser({ role: 'guest' })
  await globalSdk.setUserForced(newMember.id, {
    projectId: project.id,
    role: 'guest'
  })
  const response = await globalSdk.updateMemberRole(
    project.id,
    newMember.id,
    'admin'
  )
  tape.ok(response.success)
  const fullProject = await globalSdk.getProject(project.id)
  const newMemberRole = fullProject?.members[1].role
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
