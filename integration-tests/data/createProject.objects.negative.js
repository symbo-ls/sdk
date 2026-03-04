import { faker } from '@faker-js/faker'

export const dataSets = {
  keyRequired: {
    data: {
      projectType: 'web',
      name: 'Integration Test Project'
    },
    title: 'Failed to create project: Project key is required',
    error:
      'Failed to create project: Function call failed: [projects:create] Project key and name are required.'
  },
  projectTypeRequired: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
      name: 'Project Name'
    },
    title: 'Failed to create project: Project type is required',
    error:
      'Failed to create project: Request failed: Project type is required'
  },
  nameRequired: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
      projectType: 'web'
    },
    title: 'Failed to create project: Project name is required',
    error:
      'Failed to create project: Request failed: Name is required'
  },
  mustBeSymbols: {
    data: {
      key: `${faker.string.uuid()}`,
      projectType: 'web',
      name: 'Integration Test Project'
    },
    title: 'Failed to create project: Project key must end with .symbo.ls',
    error:
      'Failed to create project: Function call failed: [projects:create] Project key must end with .symbo.ls.'
  },
  designToolIncorrectPayload: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
      projectType: 'web',
      name: 'Integration Test Project'
    },
    title:
      'Failed to create project: Incorrect payload for designTool of type string: undefined',
    error:
      'Failed to create project: Function call failed: [projects:create] Incorrect payload for designTool of type string: undefined.'
  },
  accessIncorrectPayload: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
      name: 'Integration Test Project',
      projectType: 'web',
      designTool: 'figma'
    },
    title:
      'Failed to create project: Incorrect payload for access of type string: undefined',
    error:
      'Failed to create project: Function call failed: [projects:create] Incorrect payload for access of type string: undefined.'
  }
}
