import test from 'tape'
import { dataSets } from '../data/favoriteProjects.objects.js'

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  test('removeFavoriteProject executed with failure', async tape => {
    try {
      await globalSdk.removeFavoriteProject(dataSet.id)
    } catch (error) {
      tape.equal(error.message, dataSet.error, dataSet.error)
    }
  })
})

test.onFinish(() => process.exit(0))
