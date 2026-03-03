import test from 'tape'
import { dataSets } from './data/githubAuth.objects.negative.js'

// TODO: Test success case

function githubAuthTestNegative (dataSet) {
  test(`Github Auth ${dataSet.title}`, async tape => {
    try {
      await globalSdk.githubAuth(dataSet.token)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `Github Auth failed: ${dataSet.error}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  githubAuthTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
