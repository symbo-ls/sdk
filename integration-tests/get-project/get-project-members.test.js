import test from 'tape'
import { dataSets } from '../data/getProjectMembers.objects.negative.js'

function getProjectMembersTestPositive () {
  test('getProjectMembers executed with success', async tape => {
    const response = await globalSdk.getProjectMembers(globalProject.id)
    tape.ok(response)
    tape.equal(response[0].project, globalProject.id)
  })
}

function getProjectMembersTestNegative (dataSet) {
  test(`getProjectMembers: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.getProjectMembers(dataSet.projectId)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `getProjectMembers failed: ${dataSet.title}`
      )
    }
  })
}

getProjectMembersTestPositive()

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  getProjectMembersTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
