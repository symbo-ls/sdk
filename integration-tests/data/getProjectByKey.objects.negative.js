export const dataSets = {
  projectIdRequired: {
    projectId: '',
    title: 'Failed to get project by key: Either projectId or key is required',
    error:
      /Failed to get project by key: Function call failed: [projects:get] Either projectId or key is required./
  },
  projectNotFound: {
    projectId: 'non-existent-id',
    title: 'Failed to get project by key: Project not found',
    error:
      /Failed to get project by key: Function call failed: [projects:get] Project not found./
  },
  projectIdNull: {
    projectId: null,
    title: 'Failed to get project by key: projectId is null',
    error:
      /filter should be provided and should be a string, number, boolean or an array of them, got null for filter in /
  },
  projectIdUndefined: {
    projectId: undefined,
    title: 'Failed to get project by key: projectId is undefined',
    error:
      /filter should be provided and should be a string, number, boolean or an array of them, got undefined for filter in /
  },
  projectIdNumber: {
    projectId: 123456,
    title: 'Failed to get project by key: projectId is a number',
    error:
      /Failed to get project by key: Function call failed: [projects:get] Invalid input type for projectId./
  },
  projectIdBoolean: {
    projectId: true,
    title: 'Failed to get project by key: projectId is a boolean',
    error:
      /filter should be provided and should be a string, number, boolean or an array of them, got boolean for filter in /
  },
  projectIdInvalidFormat: {
    projectId: '!!invalid_format!!',
    title: 'Failed to get project by key: projectId has invalid format',
    error:
      /Failed to get project by key: Function call failed: [projects:get] Invalid projectId format./
  },
  projectIdObject: {
    projectId: { id: 'abc' },
    title: 'Failed to get project by key: projectId is an object',
    error:
      /filter should be provided and should be a string, number, boolean or an array of them, got \[object Object\] for filter in /
  }
}
