/* eslint-disable no-empty-function */
import * as base from './base.js'
import test from 'tape'
import { pageDataSets } from './data/content.objects.js'

// #region Setup
const sdkInstance = Object.create(globalSdk)
await base.authenticateUser(sdkInstance)
// #endregion

sdkInstance.updateContext({
  state: {
    quietUpdate () {},
    getByPath () {},
    setPathCollection () {}
  }
})

// #region Tests
test('getData Test', async t => {
  const project = await base.createAndGetProject(true, sdkInstance)
  const testData = structuredClone(pageDataSets.add)
  testData.key += performance.now()

  const expectedDataObject = {
    key: sdkInstance._context.appKey,
    name: project.name,
    access: project.access,
    type: 'project',
    id: project.id,
    designTool: project.designTool
  }

  const getDataResponse = await sdkInstance.getData()

  const actualDataObject = {
    key: getDataResponse.key,
    name: getDataResponse.name,
    access: getDataResponse.access,
    type: getDataResponse.type,
    id: getDataResponse.id,
    designTool: getDataResponse.designTool
  }

  t.deepEqual(
    actualDataObject,
    expectedDataObject,
    'Actual response data matches expected response data'
  )

  t.end()
})

function updateDataIteratesVersionTest (positiveTest) {
  const titlePreface = positiveTest
    ? 'updateData should'
    : 'updateData should not'
  test(`${titlePreface} increase version number`, async t => {
    await base.createAndGetProject(true, sdkInstance)
    const testData = structuredClone(pageDataSets.update)
    testData.key += performance.now()
    const { value, ...schema } = testData
    const type = 'pages'
    const initialVersionNumber = '1.0.0'

    const addDataResponse = await sdkInstance.updateData([
      ['update', [type, testData.key], value],
      ['update', ['schema', type, testData.key], schema]
    ])

    t.equal(
      addDataResponse.value,
      initialVersionNumber,
      `Initial version number: ${addDataResponse.value} matches Expected version number: ${initialVersionNumber}`
    )

    if (positiveTest) {
      testData.value.title += ' - Updated'
    }

    const updateDataResponse = await sdkInstance.updateData([
      ['update', [type, testData.key], value],
      ['update', ['schema', type, testData.key], schema]
    ])

    const getDataResponse = await sdkInstance.getData()

    if (positiveTest) {
      t.equal(
        updateDataResponse.value,
        '1.0.1',
        `Updated version number: ${updateDataResponse.value} matches Expected version number: 1.0.1`
      )

      const actualTitle =
        getDataResponse.pages[Object.keys(getDataResponse.pages)[0]].title

      t.equal(
        actualTitle,
        testData.value.title,
        `Actual title: ${actualTitle} matches Expected title: ${testData.value.title}`
      )
    } else {
      t.equal(
        getDataResponse.version,
        initialVersionNumber,
        `Actual version number remains unchanged: ${getDataResponse.version}`
      )
      t.equal(
        updateDataResponse,
        null,
        `Actual updateData response: ${updateDataResponse} matches Expected response: null`
      )
    }

    t.end()
  })
}
// #endregion

updateDataIteratesVersionTest(true)
updateDataIteratesVersionTest(false)

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
