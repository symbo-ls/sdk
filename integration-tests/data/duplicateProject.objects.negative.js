import { faker } from '@faker-js/faker'

export const duplicateProjectDataSets = {
  nullValues: {
    projectId: null,
    companyName: null,
    key: null,
    error:
      'Project ID is required'
  },
  missingProjectId: {
    projectId: null,
    companyName: faker.company.name(),
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      'Project ID is required'
  },
  missingCompanyName: {
    projectId: 'fif7b9d409',
    companyName: null,
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      'Failed to duplicate project: Request failed: Cast to ObjectId failed for value "fif7b9d409" (type string) at path "_id" for model "Project"'
  },
  missingKey: {
    projectId: 'fif7b9d409',
    companyName: faker.company.name(),
    key: null,
    error:
      'Failed to duplicate project: Request failed: Cast to ObjectId failed for value "fif7b9d409" (type string) at path "_id" for model "Project"'
  },
  invalidProjectId: {
    projectId: 123,
    companyName: faker.company.name(),
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      'Failed to duplicate project: Request failed: Cast to ObjectId failed for value "123" (type string) at path "_id" for model "Project"'
  },
  invalidKeyFormat: {
    projectId: 'fif7b9d409',
    companyName: faker.company.name(),
    key: 'invalid-key',
    error:
      'Failed to duplicate project: Request failed: Cast to ObjectId failed for value "fif7b9d409" (type string) at path "_id" for model "Project"'
  }
}
