import { BaseService } from './BaseService.js'
import { WORKSPACE_MEMBER_ROLES, TEAM_GRANT_ROLES } from '../constants/roles.js'

export class WorkspaceService extends BaseService {
  // ==================== WORKSPACE CRUD ====================

  async createWorkspace ({ organization, displayName, slug }) {
    if (!organization) throw new Error('organization is required')
    if (!displayName) throw new Error('displayName is required')
    return this._call('createWorkspace', '/workspaces', {
      method: 'POST',
      body: { organization, displayName, slug },
    })
  }

  async listWorkspaces ({ organization, page, limit } = {}) {
    const params = new URLSearchParams()
    if (organization) params.set('organization', organization)
    if (page) params.set('page', String(page))
    if (limit) params.set('limit', String(limit))
    const qs = params.toString() ? `?${params}` : ''
    return this._call('listWorkspaces', `/workspaces${qs}`)
  }

  async getWorkspace (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('getWorkspace', `/workspaces/${workspaceId}`)
  }

  async updateWorkspace (workspaceId, updates) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('updateWorkspace', `/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: updates,
    })
  }

  async deleteWorkspace (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('deleteWorkspace', `/workspaces/${workspaceId}`, { method: 'DELETE' })
  }

  // ==================== MEMBERS ====================

  async listWorkspaceMembers (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('listWorkspaceMembers', `/workspaces/${workspaceId}/members`)
  }

  async addWorkspaceMember (workspaceId, { userId, role = 'editor' }) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!userId) throw new Error('userId is required')
    if (!WORKSPACE_MEMBER_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${WORKSPACE_MEMBER_ROLES.join(', ')}`)
    }
    return this._call('addWorkspaceMember', `/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: { userId, role },
    })
  }

  async updateWorkspaceMemberRole (workspaceId, userId, { role }) {
    if (!workspaceId || !userId || !role) throw new Error('workspaceId, userId, role are required')
    if (!WORKSPACE_MEMBER_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${WORKSPACE_MEMBER_ROLES.join(', ')}`)
    }
    return this._call('updateWorkspaceMemberRole', `/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    })
  }

  async removeWorkspaceMember (workspaceId, userId) {
    if (!workspaceId || !userId) throw new Error('workspaceId and userId are required')
    return this._call('removeWorkspaceMember', `/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    })
  }

  // ==================== TEAM GRANTS (TeamWorkspaceAccess) ====================

  async grantWorkspaceTeamAccess (workspaceId, { teamId, role = 'guest' }) {
    if (!workspaceId || !teamId) throw new Error('workspaceId and teamId are required')
    if (!TEAM_GRANT_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${TEAM_GRANT_ROLES.join(', ')}`)
    }
    return this._call('grantWorkspaceTeamAccess', `/workspaces/${workspaceId}/team-access`, {
      method: 'POST',
      body: { teamId, role },
    })
  }

  async revokeWorkspaceTeamAccess (workspaceId, teamId) {
    if (!workspaceId || !teamId) throw new Error('workspaceId and teamId are required')
    return this._call(
      'revokeWorkspaceTeamAccess',
      `/workspaces/${workspaceId}/team-access/${teamId}`,
      { method: 'DELETE' },
    )
  }

  // ==================== BILLING + CREDITS ====================

  async getBilling (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('getBilling', `/workspaces/${workspaceId}/billing`)
  }

  async getCreditBalance (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('getCreditBalance', `/workspaces/${workspaceId}/credits/balance`)
  }

  async getCreditLedger (workspaceId, { limit, before, reason } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (before) params.set('before', String(before))
    if (reason) params.set('reason', String(reason))
    const qs = params.toString() ? `?${params}` : ''
    return this._call('getCreditLedger', `/workspaces/${workspaceId}/credits/ledger${qs}`)
  }

  // ==================== SPEND CONTROLS ====================

  async getSpendControls (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('getSpendControls', `/workspaces/${workspaceId}/spend-controls`)
  }

  async updateSpendControls (workspaceId, controls) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('updateSpendControls', `/workspaces/${workspaceId}/spend-controls`, {
      method: 'PATCH',
      body: controls,
    })
  }

  // ==================== PERMISSIONS ====================

  /**
   * Return the caller's resolved workspace permissions — source-of-truth
   * for UI gating (edit/invite/billing/etc.). Open to any workspace
   * member.
   * @param {string} workspaceId
   */
  async getWorkspacePermissions (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getWorkspacePermissions',
      `/workspaces/${workspaceId}/permissions`
    )
  }

  // ==================== WORKSPACE-SCOPED PROJECTS ====================

  /**
   * Create a project scoped to a workspace. Server aliases this to
   * `POST /projects` with the workspace FK pre-populated — owner is the
   * calling user, workspace is the path param.
   * @param {string} workspaceId
   * @param {object} projectData - same shape as `projectService.createProject`
   */
  async createWorkspaceProject (workspaceId, projectData) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call('createWorkspaceProject', `/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: projectData,
    })
  }

  // ==================== INVITATIONS ====================
  //
  // Email-based invites scoped to a workspace. Owner/admin-gated for
  // create + revoke; listing returns only the caller's pending invites
  // for non-admin members. Accept is public (authenticated) — the token
  // carries the workspaceId + inviteId.

  /**
   * List pending workspace invitations. Owner/admin see all; regular
   * members see only their own.
   * @param {string} workspaceId
   */
  async listWorkspaceInvitations (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'listWorkspaceInvitations',
      `/workspaces/${workspaceId}/invitations`
    )
  }

  /**
   * Send a workspace invitation by email.
   * @param {string} workspaceId
   * @param {{email: string, role?: string, recipientName?: string}} args - role defaults to 'editor'
   */
  async createWorkspaceInvitation (workspaceId, { email, role = 'editor', recipientName } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!email) throw new Error('email is required')
    return this._call(
      'createWorkspaceInvitation',
      `/workspaces/${workspaceId}/invitations`,
      {
        method: 'POST',
        body: { email, role, ...(recipientName ? { recipientName } : {}) },
      }
    )
  }

  /**
   * Revoke a pending workspace invitation. 404 if already accepted or
   * revoked.
   * @param {string} workspaceId
   * @param {string} inviteId
   */
  async revokeWorkspaceInvitation (workspaceId, inviteId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!inviteId) throw new Error('inviteId is required')
    return this._call(
      'revokeWorkspaceInvitation',
      `/workspaces/${workspaceId}/invitations/${inviteId}/revoke`,
      { method: 'POST' }
    )
  }

  /**
   * Accept a workspace invitation. The signed token carries
   * workspaceId + inviteId + invited email — no path params. Idempotent:
   * double-click on the same invite returns 200 without creating
   * duplicate memberships.
   * @param {{token: string}} args
   */
  async acceptWorkspaceInvitation ({ token } = {}) {
    if (!token) throw new Error('token is required')
    return this._call(
      'acceptWorkspaceInvitation',
      '/workspaces/accept-invitation',
      { method: 'POST', body: { token } }
    )
  }
}
