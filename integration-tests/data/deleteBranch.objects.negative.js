import { faker } from '@faker-js/faker'

export const dataSets = {
  idRequired: {
    id: '',
    branch: `${faker.string.alpha(10)}`,
    options: {},
    title: 'Failed to delete branch: ID is required',
    error: 'Project ID is required'
  },
  branchRequired: {
    id: `${faker.string.alpha(10)}`,
    branch: '',
    options: {},
    title: 'Failed to delete branch: Branch name is required',
    error: 'Branch name is required'
  },
  badIDAndBranch: {
    id: 'badId1234',
    branch: 'non-existing-branch',
    title: 'Failed to delete branch: ID and branch does not exist',
    error:
      'Failed to delete branch: Request failed: Cast to ObjectId failed for value "badId1234" (type string) at path "_id" for model "Project"'
  }
}
