import { faker } from '@faker-js/faker'

export const duplicateProjectDataSets = {
  nullValues: {
    projectId: null,
    companyName: null,
    key: null,
    error:
      'Failed to duplicate project: Function call failed: [projects:duplicate] Project ID is required.'
  },
  missingProjectId: {
    projectId: null,
    companyName: faker.company.name(),
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      'Failed to duplicate project: Function call failed: [projects:duplicate] Project ID is required.'
  },
  missingCompanyName: {
    projectId: 'fif7b9d409',
    companyName: null,
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      "Failed to duplicate project: Function call failed: [projects:duplicate] [TypeError] Cannot read properties of undefined (reading 'replace')."
  },
  missingKey: {
    projectId: 'fif7b9d409',
    companyName: faker.company.name(),
    key: null,
    error:
      "Failed to duplicate project: Function call failed: [projects:duplicate] [TypeError] Cannot read properties of undefined (reading 'replace')."
  },
  invalidProjectId: {
    projectId: 123,
    companyName: faker.company.name(),
    key: `${faker.string.uuid()}.symbo.ls`,
    error:
      'Failed to duplicate project: Function call failed: [projects:duplicate] [db] $id 123 should be a string or an array of strings..'
  },
  invalidKeyFormat: {
    projectId: 'fif7b9d409',
    companyName: faker.company.name(),
    key: 'invalid-key',
    error:
      "Failed to duplicate project: Function call failed: [projects:duplicate] [TypeError] Cannot read properties of undefined (reading 'replace')."
  }
}
