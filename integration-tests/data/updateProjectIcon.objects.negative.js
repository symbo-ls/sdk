export const projectIconDataSets = {
  nullValues: {
    title: 'null value',
    icon: null,
    error:
      "Failed to update project icon: Cannot read properties of null (reading 'id')"
  },
  invalidIntegerValue: {
    title: 'integer value',
    icon: 12345,
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  },
  invalidBooleanValue: {
    title: 'true boolean value',
    icon: true,
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  },
  invalidObjectValue: {
    title: 'empty object',
    icon: {},
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  },
  invalidArrayValue: {
    title: 'empty array',
    icon: [],
    src: 'test-icon.png',
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  },
  invalidStringValue: {
    title: 'string of special characters',
    icon: '@#$%^&*()',
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  },
  undefinedDataValue: {
    title: 'undefined icon',
    // eslint-disable-next-line no-undefined
    icon: undefined,
    error:
      "Failed to update project icon: Cannot read properties of undefined (reading 'id')"
  },
  emptyData: {
    title: 'empty string',
    icon: '',
    error:
      'Failed to update project icon: Function call failed: [projects:update] Type or $id or $alias required for nested single reference in icon, got: {}.'
  }
}
