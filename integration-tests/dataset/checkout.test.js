import test from 'tape'
import { authenticateUser, createAndGetProject } from '../base.js'
import { dataSets } from '../data/checkout.objects.negative.js'

const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
const project = await createAndGetProject(true, sdkInstance)

function checkoutTestNegative (dataSet) {
  test(`Checkout test - negative: ${dataSet.title}`, async tape => {
    if (dataSet.title === 'Invalid request') {
      dataSet.request.projectId = project.id
    }
    try {
      await sdkInstance.checkout(dataSet.request)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `checkout failed: ${dataSet.title}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  checkoutTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
