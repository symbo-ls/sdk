/* eslint-disable no-unused-vars */
/* eslint-disable no-negated-condition */
/* eslint-disable no-empty-function */
import test from 'tape'
import { pageDataSets } from '../data/content.objects.js'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
// #endregion

// #region Test Definitions
function restoreProjectVersionTests (positiveTest) {
  const titlePreface = positiveTest
    ? 'restoreProjectVersion should'
    : 'restoreProjectVersion should not'
  test(`${titlePreface} succeed`, async t => {
    await createAndGetProject(true, sdkInstance)

    sdkInstance.updateContext({
      state: {
        quietUpdate () {},
        getByPath () {},
        setPathCollection () {}
      }
    })
    const testData = structuredClone(pageDataSets.pageContent.update)
    testData.key += performance.now()
    const { value, ...schema } = testData
    const type = 'pages'
    const initialTitle = testData.value.title
    let addDataResponse = null
    if (positiveTest) {
      addDataResponse = await sdkInstance.applyProjectChanges(
        global.globalProject.id,
        [
          ['update', [type, testData.key], value],
          ['update', ['schema', type, testData.key], schema]
        ]
      )
    }

    // #region Negative Test Steps
    if (!positiveTest) {
      try {
        await sdkInstance.restoreProjectVersion(
          global.globalProject.id,
          addDataResponse.value
        )
      } catch (err) {
        console.log('Passing null argument to restoreProject.')
      }

      const actualVersion = (
        await sdkInstance.getProjectData(global.globalProject.id)
      ).version
      t.equal(
        actualVersion,
        '1.0.0',
        `Actual version: ${actualVersion} remains unchanged.`
      )
      // #endregion
      // #region Positive Test Steps
    } else {
      testData.value.title += ' - Updated'

      // #region Update and Confirm
      await sdkInstance.applyProjectChanges(global.globalProject.id, [
        ['update', [type, testData.key], value],
        ['update', ['schema', type, testData.key], schema]
      ])
      const updatedData = await sdkInstance.getProjectData(
        global.globalProject.id
      )
      const actualUpdatedPage =
        updatedData.pages[Object.keys(updatedData.pages)[0]]
      const actualUpdatedTitle = actualUpdatedPage.title

      t.equal(
        updatedData.version,
        '1.0.2',
        `Actual updated version: ${updatedData.version} matches expected updated version 1.0.2`
      )
      t.equal(
        actualUpdatedTitle,
        testData.value.title,
        `Actual updated title: ${actualUpdatedTitle} matches Expected updated title: ${testData.value.title}`
      )
      // #endregion

      // #region Restore and Confirm
      await sdkInstance.restoreProjectVersion(
        global.globalProject.id,
        addDataResponse.value
      )

      const actualRestoredData = await sdkInstance.getProjectData(
        global.globalProject.id
      )
      const actualRestoredTitle =
        actualRestoredData.pages[Object.keys(actualRestoredData.pages)[0]].title

      t.equal(
        actualRestoredTitle,
        initialTitle,
        `Actual reverted title: ${actualRestoredTitle} matches Expected reverted title: ${initialTitle}`
      )

      t.equal(
        actualRestoredData.version,
        '1.0.3',
        `Actual version: ${actualRestoredData.version} matches expected version 1.0.3`
      )
      // #endregion
    }
    // #endregion

    t.end()
  })
}
// #endregion

// #region Tests
restoreProjectVersionTests(false)
restoreProjectVersionTests(true)
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
