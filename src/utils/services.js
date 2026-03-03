export const SERVICE_METHODS = {
  // Auth service methods (legacy - keeping for backward compatibility)
  auth: 'auth',
  login: 'auth',
  register: 'auth',
  googleAuth: 'auth',
  googleAuthCallback: 'auth',
  githubAuth: 'auth',
  confirmRegistration: 'auth',
  logout: 'auth',
  updateUserRole: 'auth',
  hasPermission: 'auth',
  hasGlobalPermission: 'auth',
  getProjectMembers: 'auth',
  inviteMember: 'auth',
  acceptInvite: 'auth',
  updateMemberRole: 'auth',
  removeMember: 'auth',
  updateProjectTier: 'auth',
  subscribeToAuthChanges: 'auth',
  getStoredAuthState: 'core',

  // Collab service methods
  connect: 'collab',
  disconnect: 'collab',
  isConnected: 'collab',
  updateData: 'collab',
  addItem: 'collab',
  addMultipleItems: 'collab',
  updateItem: 'collab',
  deleteItem: 'collab',
  undo: 'collab',
  redo: 'collab',
  checkpoint: 'collab',

  // Realtime collaboration helper methods
  sendCursor: 'collab',
  sendPresence: 'collab',
  toggleLive: 'collab',

  // Core service methods (new - replaces most based/auth functionality)
  // Auth methods
  register: 'core',
  login: 'core',
  logout: 'core',
  refreshToken: 'core',
  googleAuth: 'core',
  googleAuthCallback: 'core',
  githubAuth: 'core',
  requestPasswordReset: 'core',
  confirmPasswordReset: 'core',
  confirmRegistration: 'core',
  requestPasswordChange: 'core',
  confirmPasswordChange: 'core',
  getMe: 'core',

  // User methods
  getUserProfile: 'core',
  updateUserProfile: 'core',
  getUserProjects: 'core',
  getUser: 'core',
  getUserByEmail: 'core',

  // Project methods
  createProject: 'core',
  getProjects: 'core',
  getProject: 'core',
  getProjectByKey: 'core',
  getPublicProject: 'core',
  listPublicProjects: 'core',
  listProjects: 'core',
  updateProject: 'core',
  updateProjectComponents: 'core',
  updateProjectSettings: 'core',
  updateProjectName: 'core',
  updateProjectPackage: 'core',
  duplicateProject: 'core',
  removeProject: 'core',
  checkProjectKeyAvailability: 'core',

  // Project member methods
  getProjectMembers: 'core',
  inviteMember: 'core',
  acceptInvite: 'core',
  updateMemberRole: 'core',
  removeMember: 'core',

  // Project library methods
  getAvailableLibraries: 'core',
  getProjectLibraries: 'core',
  addProjectLibraries: 'core',
  removeProjectLibraries: 'core',

  // File methods
  uploadFile: 'core',
  updateProjectIcon: 'core',

  // Payment methods
  checkout: 'core',
  getSubscriptionStatus: 'core',

  // DNS methods
  createDnsRecord: 'core',
  getDnsRecord: 'core',
  removeDnsRecord: 'core',
  setProjectDomains: 'core',

  // Utility methods
  getHealthStatus: 'core',
  getTokenDebugInfo: 'core',

  // Project Data methods (Symstory replacement)
  applyProjectChanges: 'core',
  getProjectData: 'core',
  getProjectVersions: 'core',
  restoreProjectVersion: 'core',
  updateProjectItem: 'core',
  deleteProjectItem: 'core',
  setProjectValue: 'core',
  addProjectItems: 'core',
  getProjectItemByPath: 'core',

  // Pull Request methods
  createPullRequest: 'core',
  listPullRequests: 'core',
  getPullRequest: 'core',
  reviewPullRequest: 'core',
  addPullRequestComment: 'core',
  mergePullRequest: 'core',
  getPullRequestDiff: 'core',
  createPullRequestWithValidation: 'core',
  approvePullRequest: 'core',
  requestPullRequestChanges: 'core',
  getOpenPullRequests: 'core',
  getClosedPullRequests: 'core',
  getMergedPullRequests: 'core',
  isPullRequestMergeable: 'core',
  getPullRequestStatusSummary: 'core',

  // Branch Management methods
  listBranches: 'core',
  createBranch: 'core',
  deleteBranch: 'core',
  renameBranch: 'core',
  getBranchChanges: 'core',
  mergeBranch: 'core',
  resetBranch: 'core',
  publishVersion: 'core',
  createBranchWithValidation: 'core',
  branchExists: 'core',
  previewMerge: 'core',
  commitMerge: 'core',
  createFeatureBranch: 'core',
  createHotfixBranch: 'core',
  getBranchStatus: 'core',
  deleteBranchSafely: 'core',

  // Admin methods
  getAdminUsers: 'core',
  assignProjectsToUser: 'core',
  searchAdminUsers: 'core',
  getAdminUsersByEmails: 'core',
  getAdminUsersByIds: 'core',
  assignSpecificProjectsToUser: 'core',
  assignAllProjectsToUser: 'core'
}
