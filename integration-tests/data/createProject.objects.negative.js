import { faker } from '@faker-js/faker'

export const dataSets = {
  keyRequired: {
    data: {
      key: '',
      name: 'Integration Test Project'
    },
    title: 'Failed to create project: Project key is required',
    error:
      'Failed to create project: Function call failed: [projects:create] Project key and name are required.'
  },
  nameRequired: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
      name: ''
    },
    title: 'Failed to create project: Project name is required',
    error:
      'Failed to create project: Function call failed: [projects:create] Project key and name are required.'
  },
  mustBeSymbols: {
    data: {
      key: 'wrong-key',
      name: 'Integration Test Project'
    },
    title: 'Failed to create project: Project key must end with .symbo.ls',
    error:
      'Failed to create project: Function call failed: [projects:create] Project key must end with .symbo.ls.'
  },
  designToolIncorrectPayload: {
    data: {
      key: `${faker.string.uuid()}.symbo.ls`,
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
      designTool: 'figma'
    },
    title:
      'Failed to create project: Incorrect payload for access of type string: undefined',
    error:
      'Failed to create project: Function call failed: [projects:create] Incorrect payload for access of type string: undefined.'
  }
}
