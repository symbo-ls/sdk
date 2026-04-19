// Shared role / access enums consumed by WorkspaceService, ProjectService, and
// future OrgMember / Team services. Single source so validation messages and
// allow-lists don't drift.

export const WORKSPACE_MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer', 'guest']
export const PROJECT_MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer', 'guest']

// Team grants never include 'owner' — resource ownership always flows through
// direct membership.
export const TEAM_GRANT_ROLES = ['admin', 'editor', 'guest', 'viewer']

export const PROJECT_SOURCE_ACCESS = ['public', 'org', 'workspace', 'restricted']
