/* eslint-disable no-empty-function */
import test from 'tape'
import { authenticateUser, createAndGetProject } from '../base.js'
import { pageDataSets } from '../data/content.objects.js'

// #region Helpers
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
sdkInstance.updateContext({ authToken: global.globalUser.tokens.accessToken })

async function getTestProject (tempSdkInstance = sdkInstance) {
  const testProject = await createAndGetProject(true, tempSdkInstance)

  tempSdkInstance.updateContext({
    appKey: testProject.key,
    state: {
      quietUpdate () {},
      getByPath () {},
      setPathCollection () {}
    }
  })

  return testProject
}

function formatResponse (responseData) {
  delete responseData.version
  delete responseData.versions
  delete responseData.latestVersion
  delete responseData.__pending
  delete responseData.projectInfo.updatedAt
  delete responseData.versionscount
  delete responseData.updatedAt
  delete responseData.projectMeta.updatedAt
  return responseData
}
function setExpectedResponse (responseData, pageData) {
  responseData.pages[pageData.key] = pageData.value
  delete responseData.projectInfo.updatedAt
  responseData.schema.pages[pageData.key] = {
    key: pageData.key,
    schema: pageData.schema
  }
  return formatResponse(responseData)
}

function sleep (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
// #endregion

// #region Tests
Object.keys(pageDataSets.pageContent).forEach(key => {
  if (key !== 'delete') {
    test(`${key} page content`, async t => {
      const project = await getTestProject()
      const initialState = await sdkInstance.getProjectData(project.id)
      const pageData = structuredClone(pageDataSets.pageContent[key])

      const connectObject = {
        authToken: global.globalUser.tokens.accessToken,
        projectId: project.id,
        branch: project.publishedVersion.branch,
        pro: true
      }

      t.equal(
        initialState.projectInfo.key,
        project.key,
        'getProjectData key matches project key'
      )

      await sdkInstance.toggleLive(true) // Need to toggle the client to live to mitigate the DB wait
      await sdkInstance.connect(connectObject)
      await sdkInstance.addItem('pages', pageData)
      await sleep(5000) // Waiting for new version to populate

      if (key === 'add') {
        let response = await sdkInstance.getProjectData(project.id)
        if (Object.keys(response.pages).length === 0) {
          await sleep(5000)
          response = await sdkInstance.getProjectData(project.id)
        }

        t.deepEqual(
          formatResponse(response),
          setExpectedResponse(initialState, pageData),
          'page added successfully'
        )
      } else if (key === 'update') {
        pageData.value.title += ' - Updated'
        await sdkInstance.toggleLive(true)
        await sdkInstance.updateItem('pages', pageData)
        await sleep(5000) // Waiting for new version to populate
        let response = await sdkInstance.getProjectData(project.id)
        if (
          Object.keys(response.pages).length === 0 ||
          response.pages.title === pageDataSets.pageContent[key].value.title
        ) {
          await sleep(5000)
          response = await sdkInstance.getProjectData(project.id)
        }

        t.deepEqual(
          formatResponse(response),
          setExpectedResponse(initialState, pageData),
          'page content updated successfully'
        )
      }
    })
  }
})

Object.keys(pageDataSets.pageContent).forEach(key => {
  test(`${key} page negative test`, async t => {
    const pageData = structuredClone(pageDataSets.pageContent.add)
    const tempSdkInstance = Object.create(sdkInstance)
    const project = await getTestProject(tempSdkInstance)

    const connectObject = {
      authToken: global.globalUser.tokens.accessToken,
      projectId: project.id,
      branch: project.publishedVersion.branch,
      pro: true
    }
    await tempSdkInstance.toggleLive(true) // Need to toggle the client to live to mitigate the DB wait
    await tempSdkInstance.connect(connectObject)

    if (key === 'add') {
      pageData.key += performance.now()
      await tempSdkInstance.toggleLive(true)
      await tempSdkInstance.addItem('pages', pageData, { quietUpdate: true })

      // Attempt to add same page again
      const secondResponse = await tempSdkInstance.addItem('pages', pageData, {
        quietUpdate: true
      })
      t.ok(secondResponse.success, 'Second item successfully added')
    }

    if (key === 'update') {
      delete pageData.key

      try {
        await sdkInstance.toggleLive(true)
        await tempSdkInstance.updateItem('pages', pageData, {
          quietUpdate: true
        })
      } catch (e) {
        t.equal(
          e.message,
          'Failed to update item: Data must contain a key property',
          'Page content cannot be updated without passing "key" as expected.'
        )
      }
    }

    if (key === 'delete') {
      pageData.key += performance.now()

      // Attempt to delete page key that was never added.
      const deleteResponse = await tempSdkInstance.deleteItem(
        'pages',
        pageData.key
      )
      t.ok(deleteResponse.success, 'Item successfully deleted.')
    }
  })
})

test("should fail to get a project which doesn't exist", async t => {
  const tempSdkInstance = Object.create(sdkInstance)
  tempSdkInstance.updateContext({ appKey: `badAppKey${performance.now()}` })
  try {
    await tempSdkInstance.getProjectData('bad-project-id-1234')
    t.fail('Retrieved a project with an invalid app key')
  } catch (err) {
    t.equal(
      err.message,
      'Failed to get project data: Request failed: Cast to ObjectId failed for value "bad-project-id-1234" (type string) at path "_id" for model "Project"',
      'Successfully failed to get a non-existant project.'
    )
  }
})
// #endregion

test.onFinish(() => process.exit(0))
