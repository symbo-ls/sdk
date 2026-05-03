import { faker } from '@faker-js/faker'

// Negative-test cases for createProject. Each entry asserts that the
// server REJECTS the request and the surfaced error contains a key
// phrase. Substring matching (not exact-equal) so harmless wording
// tweaks on the server don't break the suite.
//
// Cases removed (server contract changed on upcoming):
//   - keyRequired:   key is no longer required; server auto-allocates.
//   - mustBeSymbols: `.symbo.ls` suffix requirement was dropped — bare
//                    `[a-z0-9-]+` slugs are now valid.
//   - designTool / access "incorrect payload": server silently drops
//                    invalid enum values instead of rejecting.

export const dataSets = {
  projectTypeRequired: {
    data: {
      key: faker.string.uuid(),
      name: 'Integration Test Project'
    },
    title: 'Project type is required',
    errorContains: 'Project type is required'
  },
  nameRequired: {
    data: {
      key: faker.string.uuid(),
      projectType: 'website'
    },
    title: 'Project name is required',
    errorContains: 'Name is required'
  },
  invalidProjectType: {
    data: {
      key: faker.string.uuid(),
      name: 'Integration Test Project',
      projectType: 'not-a-real-type'
    },
    title: 'Invalid project type rejected',
    errorContains: 'projectType must be one of'
  },
  invalidProjectKey: {
    data: {
      key: 'NOT a valid key — has spaces and uppercase!',
      name: 'Integration Test Project',
      projectType: 'website'
    },
    title: 'Invalid project key rejected (spaces/uppercase/punctuation)',
    errorContains: 'lowercase letters, numbers, and hyphens'
  }
}
