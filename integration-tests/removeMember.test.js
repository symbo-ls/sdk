import test from 'tape'
import { dataSets } from './data/removeMember.objects.negative.js'

function removeMemberTestNegative (dataSet) {
  test(`removeMember: ${dataSet.title}`, async tape => {
    try {
      await globalSdk.removeMember(dataSet.projectId, dataSet.userId)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `removeMember failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  removeMemberTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
