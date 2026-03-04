import test from 'tape'
import fs from 'node:fs'
import { Blob } from 'node:buffer'
import { authenticateUser, createAndGetProject } from '../base.js'

// #region Setup
const sdkInstance = Object.create(global.globalSdk)
await authenticateUser(sdkInstance)
// #endregion

// #region Tests
test('uploadFile a file', async t => {
  const project = await createAndGetProject(true, sdkInstance)
  sdkInstance.updateContext({
    appKey: project.key,
    authToken: global.globalUser.tokens.accessToken
  })

  // Setup file for upload
  const buffer = fs.readFileSync('./integration-tests/data/test-icon.png')
  const file = new Blob([buffer], { type: 'image/png' })
  file.name = 'logo.png'

  const response = await sdkInstance.uploadFile(file, {
    projectId: project.id,
    tags: ['image', 'avatar'],
    visibility: 'public'
  })

  t.equal(response.mimeType, 'image/png', 'mimeType is correct')
  t.equal(response.bucket, 'smbls-api-test-media', 'upload bucket is correct')
  t.equal(response.category, 'image', 'file category is correct')
  t.equal(response.extension, 'png', 'correct image file type is present')

  t.ok(
    response.id && typeof response.id === 'string',
    'Id of the file is present and set'
  )
  t.ok(
    response.src && typeof response.src === 'string',
    'Url to the file is present and set'
  )
})

test('Upload file - negative: pass empty string for file path', async t => {
  try {
    await sdkInstance.uploadFile('')
  } catch (error) {
    t.equal(
      error.message,
      'File is required for upload',
      'uploadFile failed: File is required for upload'
    )
  }
})
// #endregion

// #region Exit
test.onFinish(() => process.exit(0))
// #endregion
