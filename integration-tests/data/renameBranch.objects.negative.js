import { faker } from '@faker-js/faker'

export const dataSets = {
  branchRequired: {
    id: faker.string.alpha(10),
    branch: '',
    options: {},
    title: 'Failed to edit branch: Branch name is required',
    error: 'Current branch name is required'
  },
  branchNotFound: {
    id: faker.string.alpha(10),
    branch: `non-existing-branch-${faker.string.alpha(10)}`,
    title: 'Failed to edit branch: Branch does not exist',
    error: 'New branch name is required'
  },
  idRequired: {
    id: '',
    branch: `non-existing-branch-${faker.string.alpha(10)}`,
    title: 'Failed to edit branch: ID is required',
    error: 'Project ID is required'
  }
}
