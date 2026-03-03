import test from 'tape'
import { createAndGetProject } from './base.js'
import { negativeDataSets } from './data/setProjectDomains.objects.js'

function setProjectDomainsTestNegative (dataSet) {
  test(`setProjectDomains ${dataSet.title}`, async tape => {
    try {
      await globalSdk.setProjectDomains(dataSet.projectId, dataSet.domains)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `setProjectDomains failed: ${dataSet.error}`
      )
    }
  })
}

function setProjectDomainsTestPositive () {
  test('setProjectDomains executed with success', async tape => {
    const project = await createAndGetProject()
    const response = await globalSdk.setProjectDomains(project.id, {})
    tape.ok(response, 'setProjectDomains executed successfully')
    tape.equal(response.success, true, 'setProjectDomains success is true')
  })
}

setProjectDomainsTestPositive()

Object.keys(negativeDataSets).forEach(key => {
  const dataSet = negativeDataSets[key]
  setProjectDomainsTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
