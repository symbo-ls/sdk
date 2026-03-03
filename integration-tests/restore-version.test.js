/* eslint-disable no-negated-condition */
/* eslint-disable no-empty-function */
import test from 'tape'
import { pageDataSets } from './data/content.objects.js'
import * as base from './base.js'

// #region Setup
const sdkInstance = Object.create(globalSdk)
await base.authenticateUser(sdkInstance)
// #endregion

/**
 * Bug Submitted: https://github.com/symbo-ls/platform/issues/1103
 * Description: restoreVersion is not iterating the version number
 */
// #region Test Definitions
function restoreVersionTests (positiveTest) {
  const titlePreface = positiveTest
    ? 'restoreVersion should'
    : 'restoreVersion should not'
  test(`${titlePreface} succeed`, async t => {
    await base.createAndGetProject(true, sdkInstance)

    sdkInstance.updateContext({
      state: {
        quietUpdate () {},
        getByPath () {},
        setPathCollection () {}
      }
    })
    const testData = structuredClone(pageDataSets.update)
    testData.key += performance.now()
    const { value, ...schema } = testData
    const type = 'pages'
    const initialTitle = testData.value.title

    const addDataResponse = await sdkInstance.updateData([
      ['update', [type, testData.key], value],
      ['update', ['schema', type, testData.key], schema]
    ])

    // #region Negative Test Steps
    if (!positiveTest) {
      const actualVersion = (await sdkInstance.getData()).version
      const negativeRestoreResponse = await sdkInstance.restoreVersion(
        addDataResponse.value
      )
      t.equal(
        actualVersion,
        '1.0.0',
        `Actual version: ${actualVersion} remains unchanged.`
      )
      t.equal(
        negativeRestoreResponse,
        null,
        `Actual restore response: ${negativeRestoreResponse} matches Expected response: null`
      )
      // #endregion
      // #region Positive Test Steps
    } else {
      testData.value.title += ' - Updated'

      // #region Update and Confirm
      await sdkInstance.updateData([
        ['update', [type, testData.key], value],
        ['update', ['schema', type, testData.key], schema]
      ])

      const updatedData = await sdkInstance.getData()
      const actualUpdatedTitle =
        updatedData.pages[Object.keys(updatedData.pages)[0]].title

      t.equal(
        updatedData.version,
        '1.0.1',
        `Actual updated version: ${updatedData.version} matches expected updated version 1.0.1`
      )
      t.equal(
        actualUpdatedTitle,
        testData.value.title,
        `Actual updated title: ${actualUpdatedTitle} matches Expected updated title: ${testData.value.title}`
      )
      // #endregion

      // #region Restore and Confirm
      const positiveRestoreResponse = await sdkInstance.restoreVersion(
        addDataResponse.value
      )

      const actualRestoredTitle =
        positiveRestoreResponse.pages[
          Object.keys(positiveRestoreResponse.pages)[0]
        ].title

      const restoredData = await sdkInstance.getData()

      t.equal(
        actualRestoredTitle,
        initialTitle,
        `Actual reverted title: ${actualRestoredTitle} matches Expected reverted title: ${initialTitle}`
      )

      t.equal(
        restoredData.version,
        '1.0.2',
        `Actual version: ${updatedData.version} matches expected version 1.0.2`
      )
      // #endregion
    }
    // #endregion

    t.end()
  })
}
// #endregion

// #region Tests
restoreVersionTests(true)
restoreVersionTests(false)
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
