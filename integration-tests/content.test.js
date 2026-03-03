/* eslint-disable no-empty-function */
import test from 'tape'
import { initializeSdk } from './index.js'
import { createAndGetProject, destroySdk } from './base.js'
import { pageDataSets } from './data/content.objects.js'

const contentSdk = await initializeSdk(true)
contentSdk.updateContext({ authToken: globalUser.token })
const project = await createAndGetProject()

contentSdk.updateContext({
  appKey: project.key,
  state: {
    quietUpdate () {},
    getByPath () {},
    setPathCollection () {}
  }
})

function formatResponse (responseData) {
  delete responseData.version
  delete responseData.versions
  return responseData
}
function setExpectedResponse (responseData, pageData) {
  responseData.pages[pageData.key] = pageData.value
  responseData.schema.pages[pageData.key] = {
    key: pageData.key,
    schema: pageData.schema
  }
  return formatResponse(responseData)
}

Object.keys(pageDataSets).forEach(key => {
  test(`${key} page content`, async t => {
    const initialSate = await contentSdk.getData()
    t.equal(initialSate.key, project.key, 'getData key matches project key')
    const pageData = structuredClone(pageDataSets[key])
    await contentSdk.addItem('pages', pageData)

    if (key === 'add') {
      const response = await contentSdk.getData()
      t.deepEqual(
        formatResponse(response),
        setExpectedResponse(initialSate, pageData),
        'page added successfully'
      )
    } else if (key === 'update') {
      pageData.value.title += ' - Updated'
      await contentSdk.updateItem('pages', pageData)
      const response = await contentSdk.getData()
      t.deepEqual(
        formatResponse(response),
        setExpectedResponse(initialSate, pageData),
        'page content updated successfully'
      )
    } else if (key === 'delete') {
      await contentSdk.deleteItem('pages', pageData.key)
      const response = await contentSdk.getData()
      t.deepEqual(
        formatResponse(response),
        formatResponse(initialSate),
        'page content deleted successfully'
      )
    }
  })
})

Object.keys(pageDataSets).forEach(key => {
  test(`${key} page negative`, async t => {
    const pageData = structuredClone(pageDataSets.add)

    if (key === 'add') {
      pageData.key += performance.now()
      await contentSdk.addItem('pages', pageData, { quietUpdate: true })
      // Attempt to add same page again
      try {
        await contentSdk.addItem('pages', pageData, { quietUpdate: true })
      } catch (e) {
        t.equal(
          e.message,
          'Failed to add item: Failed to add data: [pages:add] Page already exists.',
          'Failed to add duplicate page as expected.'
        )
      }
    }

    if (key === 'update') {
      delete pageData.key

      try {
        await contentSdk.updateItem('pages', pageData, { quietUpdate: true })
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
      try {
        await contentSdk.deleteItem('pages', pageData.key)
      } catch (e) {
        t.equal(
          e.message,
          'Failed to delete item: Failed to delete data: [pages:delete] key not found.',
          'Page "key" that was never added cannot be removed as expected.'
        )
      }
    }
  })
})

test('Cannot Delete Old Data', async t => {
  await contentSdk.addItem('pages', pageDataSets.delete)
  contentSdk.updateContext({
    appKey: project.key,
    state: {
      isOld: true,
      quietUpdate () {},
      getByPath () {},
      setPathCollection () {}
    }
  })
  let response = await contentSdk.deleteItem('pages', pageDataSets.delete.key)
  response = await contentSdk.getData()
  const actualPageData = response.pages[pageDataSets.delete.key]
  t.deepEqual(
    actualPageData,
    pageDataSets.delete.value,
    'Did not delete a page with old data'
  )
})

test("should fail to get a project which doesn't exist", async t => {
  const testData = structuredClone(pageDataSets.add)

  contentSdk.updateContext({ appKey: `badAppKey${performance.now()}` })

  try {
    await contentSdk.getItem('', testData)
    t.fail('Retrieved a project with an invalid app key')
  } catch (err) {
    t.equal(
      err.message,
      'Failed to get item: Failed to get data: [projects:get] Project not found.',
      'Successfully failed to get a non-existant project.'
    )
  }
})

test('Destroy Content SDK', t => {
  destroySdk(contentSdk)
  t.end()
})

test.onFinish(() => process.exit(0))
