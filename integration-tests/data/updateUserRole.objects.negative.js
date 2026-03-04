export const dataSets = {
  userIdRequired: {
    userId: '',
    role: 'admin',
    title: 'Failed to update user role: User ID is required',
    error: 'User ID is required'
  },
  invalidRole: {
    userId: globalUser.user.id,
    role: 'invalid-role',
    title: 'Failed to update user role: Invalid role',
    error: 'Invalid role: invalid-role'
  }
}
