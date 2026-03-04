import test from 'tape'
import { dataSets } from '../data/acceptInvite.objects.negative.js'

function acceptInviteTestNegative (dataSet) {
  test(`acceptInvite ${dataSet.title}`, async tape => {
    try {
      await globalSdk.acceptInvite(dataSet.token)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `acceptInvite failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  acceptInviteTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
