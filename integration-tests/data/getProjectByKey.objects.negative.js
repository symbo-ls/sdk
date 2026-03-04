export const dataSets = {
  projectIdRequired: {
    projectId: '',
    title: 'Failed to get project by key: Either projectId or key is required',
    error: 'Project key is required'
  },
  projectIdNull: {
    projectId: null,
    title: 'Failed to get project by key: projectId is null',
    error: 'Project key is required'
  },
  projectIdUndefined: {
    projectId: undefined,
    title: 'Failed to get project by key: projectId is undefined',
    error: 'Project key is required'
  },
  projectNotFound: {
    projectId: 'non-existent-id',
    title: 'Failed to get project by key: Project not found',
    error:
      'Failed to get project by key: Request failed: Project with specified identifier (non-existent-id) not found'
  },
  projectIdNumber: {
    projectId: 123456,
    title: 'Failed to get project by key: projectId is a number',
    error:
      'Failed to get project by key: Request failed: Project with specified identifier (123456) not found'
  },
  projectIdBoolean: {
    projectId: true,
    title: 'Failed to get project by key: projectId is a boolean',
    error:
      'Failed to get project by key: Request failed: Project with specified identifier (true) not found'
  },
  projectIdInvalidFormat: {
    projectId: '!!invalid_format!!',
    title: 'Failed to get project by key: projectId has invalid format',
    error:
      'Failed to get project by key: Request failed: Project with specified identifier (!!invalid_format!!) not found'
  },
  projectIdObject: {
    projectId: { id: 'abc' },
    title: 'Failed to get project by key: projectId is an object',
    error:
      'Failed to get project by key: Request failed: Project with specified identifier ([object Object]) not found'
  }
}
