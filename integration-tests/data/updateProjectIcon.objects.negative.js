export const projectIconDataSets = {
  nullValues: {
    title: 'null value',
    icon: null,
    error:
      'Project ID and icon file are required'
  },
  invalidIntegerValue: {
    title: 'integer value',
    icon: 12345,
    error:
      'Failed to update project icon: Request failed: An image file is required for project icon'
  },
  invalidBooleanValue: {
    title: 'true boolean value',
    icon: true,
    error:
      'Failed to update project icon: Request failed: An image file is required for project icon'
  },
  invalidObjectValue: {
    title: 'empty object',
    icon: {},
    error:
      'Failed to update project icon: Request failed: An image file is required for project icon'
  },
  invalidArrayValue: {
    title: 'empty array',
    icon: [],
    src: 'test-icon.png',
    error:
      'Failed to update project icon: Request failed: An image file is required for project icon'
  },
  invalidStringValue: {
    title: 'string of special characters',
    icon: '@#$%^&*()',
    error:
      'Failed to update project icon: Request failed: An image file is required for project icon'
  },
  undefinedDataValue: {
    title: 'undefined icon',
    // eslint-disable-next-line no-undefined
    icon: undefined,
    error:
      'Project ID and icon file are required'
  },
  emptyData: {
    title: 'empty string',
    icon: '',
    error:
      'Project ID and icon file are required'
  }
}
