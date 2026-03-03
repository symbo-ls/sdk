/* eslint-disable no-await-in-loop */
import test from 'tape'
import { faker } from '@faker-js/faker'
import { duplicateProjectDataSets } from './data/duplicateProject.objects.negative.js'

test('duplicateProject executed with success', async tape => {
  const response = await globalSdk.duplicateProject(
    globalProject.id,
    faker.string.uuid(),
    `${faker.string.uuid()}.symbo.ls`
  )
  tape.equal(response.success, true, 'Project is successfully duplicated')
  tape.ok(response.project, 'Project is successfully set')
})

test('duplicateProject should throw an error when provided with invalid input => Bug created for this issue: https://github.com/symbo-ls/platform/issues/911', async tape => {
  for (const key of Object.keys(duplicateProjectDataSets)) {
    const { projectId, companyName, newKey, error } =
      duplicateProjectDataSets[key]

    try {
      const response = await globalSdk.duplicateProject(
        projectId,
        companyName,
        newKey
      )
      tape.fail(
        `Project duplication did not fail as expected. Response = ${JSON.stringify(
          response
        )}`
      )
    } catch (e) {
      tape.equal(e.message, error, `Error message matches for case: "${key}"`)
    }
  }
})

test.onFinish(() => process.exit(0))
