import test from 'tape'
import { authenticateUser } from './base.js'

const sdkInstance = Object.create(globalSdk)
await authenticateUser(sdkInstance)

test('uploadFile a file', async tape => {
  const response = await sdkInstance.uploadFile('test-file.png')
  tape.ok(response, 'File is uploaded with success')
  tape.ok(typeof response.id === 'string', 'Id of the file is set')
  tape.ok(typeof response.src === 'string', 'Url to the file is set')
})

test('Upload file - negative: pass empty string for file path', async tape => {
  try {
    await sdkInstance.uploadFile('')
  } catch (error) {
    tape.equal(
      error.message,
      'File is required for upload',
      'uploadFile failed: File is required for upload'
    )
  }
})

test.onFinish(() => process.exit(0))
