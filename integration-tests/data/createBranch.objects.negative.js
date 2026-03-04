import { faker } from '@faker-js/faker'

export const dataSets = {
  projectIdRequired: {
    id: '',
    branch: `${faker.string.alpha(10)}`,
    options: {},
    title: 'Failed to create branch: Project ID is required',
    error: 'Project ID is required'
  },
  branchRequired: {
    id: global.globalProject.id,
    branch: '',
    options: {},
    title: 'Failed to create branch: Branch name is required',
    error: 'Branch name is required'
  }
}
