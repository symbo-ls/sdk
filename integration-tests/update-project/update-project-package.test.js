import test from 'tape'
import { createAndGetProject, authenticateUser } from '../base.js'
import { dataSets } from '../data/update-project-package.objects.negative.js'

test('Update package for a project', async tape => {
  const sdkInstance = Object.create(globalSdk)
  await authenticateUser(sdkInstance)
  const project = await createAndGetProject(true, sdkInstance)
  const previousProjectPackage = project.package

  if (!project.package) {
    project.package = 0
  }

  const response = await sdkInstance.updateProjectPackage(
    project.id,
    '3'
  )

  tape.equal(response.package, '3', 'Project package is successfully updated')

  const updatedProject = await sdkInstance.getProject(project.id)

  tape.notEqual(
    updatedProject.package,
    previousProjectPackage,
    `Updated package: ${updatedProject.package} is NOT equal to the original package: ${previousProjectPackage}`
  )
})

function updateProjectPackageTestNegative (dataSet) {
  test(`Update project package - negative: ${dataSet.title}`, async tape => {
    const sdkInstance = Object.create(globalSdk)
    await authenticateUser(sdkInstance)
    await createAndGetProject(true, sdkInstance)
    try {
      await sdkInstance.updateProjectPackage(dataSet.projectId, dataSet.package)
    } catch (error) {
      tape.equal(
        error.message,
        dataSet.error,
        `updateProjectPackage failed: ${dataSet.title}`
      )
    }
  })
}

Object.keys(dataSets).forEach(key => {
  const dataSet = dataSets[key]
  updateProjectPackageTestNegative(dataSet)
})

test.onFinish(() => process.exit(0))
