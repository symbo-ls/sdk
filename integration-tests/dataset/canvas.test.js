/* eslint-disable no-empty-function */
import test from 'tape'
import { createAndGetProject } from '../base.js'
import { pageDataSets } from '../data/content.objects.js'

const sdkInstance = Object.create(global.globalSdk)
sdkInstance.updateContext({ authToken: global.globalUser.token })
const project = await createAndGetProject()

sdkInstance.updateContext({
  appKey: project.key,
  state: {
    quietUpdate () {},
    getByPath () {},
    setPathCollection () {}
  }
})

test('should create a new canvas', async t => {
  const testDataObject = structuredClone(pageDataSets.canvasContent.addCanvas)
  const updateResponse = await sdkInstance.applyProjectChanges(
    project.id,
    testDataObject,
    {
      message: `Added canvas page ${testDataObject[0][2].title}`
    }
  )

  const getProjectDataResponse = await sdkInstance.getProjectData(project.id)

  t.ok(
    updateResponse.id && updateResponse.value,
    'applyProjectChanges id and value are present'
  )

  t.equal(
    updateResponse.value,
    '1.0.1',
    'Version updated to 1.0.1 by applyProjectChanges'
  )

  t.equal(
    getProjectDataResponse.version,
    updateResponse.value,
    'getProject data version matches 1.0.1'
  )

  t.equal(
    Object.keys(getProjectDataResponse.canvas.pages)[0],
    testDataObject[0][2].title,
    'Canvas title is correct'
  )
})

test.onFinish(() => process.exit(0))
