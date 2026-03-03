import { createAndGetUser } from '../base.js'

const randomUser = await createAndGetUser()
const randomUserId = await globalSdk.getUserByEmail(randomUser.email)

export const dataSets = {
  projectIdRequired: {
    projectId: '',
    userId: globalUser.userId,
    title: 'Failed to remove member: Project ID is required',
    error: 'Project ID and user ID are required'
  },
  userIdRequired: {
    projectId: globalProject.id,
    userId: '',
    title: 'Failed to remove member: User ID is required',
    error: 'Project ID and user ID are required'
  },
  AuthorizeRejectedAccess: {
    projectId: globalProject.id,
    userId: randomUserId.id,
    title: 'Failed to remove member: Member not found in project',
    error:
      'Failed to remove member: [projects:remove-member] Member not found in project.'
  }
}
