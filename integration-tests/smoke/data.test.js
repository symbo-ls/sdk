/* eslint-disable no-empty-function */
import * as base from '../base.js'
import test from 'tape'
import { pageDataSets } from '../data/content.objects.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
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
test('getProjectData Test', async t => {
  const project = await base.createAndGetProject(true, sdkInstance)
  const testData = structuredClone(pageDataSets.pageContent.add)
  testData.key += performance.now()

  const expectedDataObject = {
    key: sdkInstance._context.appKey,
    name: project.name,
    id: project.id
  }

  const getProjectDataResponse = await sdkInstance.getProjectData(project.id)

  const actualDataObject = {
    key: getProjectDataResponse.projectInfo.key,
    name: getProjectDataResponse.projectInfo.name,
    id: getProjectDataResponse.projectInfo.id
  }

  t.deepEqual(
    actualDataObject,
    expectedDataObject,
    'Actual response data matches expected response data'
  )

  t.end()
})

function applyProjectChangesIteratesVersionTest (positiveTest) {
  const titlePreface = positiveTest
    ? 'applyProjectChanges should'
    : 'applyProjectChanges should not'
  test(`${titlePreface} increase version number`, async t => {
    const project = await base.createAndGetProject(true, sdkInstance)
    const testData = structuredClone(pageDataSets.pageContent.update)
    testData.key += performance.now()
    const { value, ...schema } = testData
    const type = 'pages'
    const initialVersionNumber = '1.0.0'

    t.equal(
      project.version,
      initialVersionNumber,
      `Initial version number: ${project.version} matches Expected version number: ${initialVersionNumber}`
    )

    const addDataResponse = await sdkInstance.applyProjectChanges(project.id, [
      ['update', [type, testData.key], value],
      ['update', ['schema', type, testData.key], schema]
    ])

    t.equal(
      addDataResponse.value,
      '1.0.1',
      `Version number: ${addDataResponse.value} matches Expected version number: 1.0.1`
    )

    let applyProjectChangesResponse = null
    let changes = null
    if (positiveTest) {
      testData.value.title += ' - Updated'
      changes = [
        ['update', [type, testData.key], value],
        ['update', ['schema', type, testData.key], schema]
      ]
    }

    try {
      applyProjectChangesResponse = await sdkInstance.applyProjectChanges(
        project.id,
        changes
      )
    } catch (err) {
      if (positiveTest) {
        throw new Error(err, { cause: err })
      }
    }

    const getProjectDataResponse = await sdkInstance.getProjectData(project.id)

    if (positiveTest) {
      t.equal(
        applyProjectChangesResponse.value,
        '1.0.2',
        `Updated version number: ${applyProjectChangesResponse.value} matches Expected version number: 1.0.2`
      )

      const actualUpdatedPage =
        getProjectDataResponse.pages[
          Object.keys(getProjectDataResponse.pages)[0]
        ]

      const actualTitle = actualUpdatedPage.title

      t.equal(
        actualTitle,
        testData.value.title,
        `Actual title: ${actualTitle} matches Expected title: ${testData.value.title}`
      )
    } else {
      t.equal(
        getProjectDataResponse.version,
        '1.0.1',
        `Actual version number remains unchanged: ${getProjectDataResponse.version}`
      )
      t.equal(
        applyProjectChangesResponse,
        null,
        `Actual applyProjectChanges response: ${applyProjectChangesResponse} matches Expected response: null`
      )
    }

    t.end()
  })
}
// #endregion

applyProjectChangesIteratesVersionTest(true)
applyProjectChangesIteratesVersionTest(false)

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
