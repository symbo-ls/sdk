import { BaseService } from './BaseService.js'
import { logger } from '../utils/logger.js'

export class OrganizationService extends BaseService {
  // ==================== ORGANIZATION CRUD ====================

  async createOrganization ({ name, slug }) {
    this._requireReady('createOrganization')
    if (!name || !slug) throw new Error('name and slug are required')

    const response = await this._request('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
      methodName: 'createOrganization'
    })
    if (response.success) {
      // Register slug.symbo.ls DNS records
      this._createSubdomainRecords(slug).catch(err => {
        logger.warn('Failed to create DNS records for organization:', err?.message || err)
      })
      return response.data
    }
    throw new Error(response.message)
  }

  async listOrganizations () {
    this._requireReady('listOrganizations')

    const response = await this._request('/organizations', {
      method: 'GET',
      methodName: 'listOrganizations'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getOrganization (orgId) {
    this._requireReady('getOrganization')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}`, {
      method: 'GET',
      methodName: 'getOrganization'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateOrganization (orgId, updates) {
    this._requireReady('updateOrganization')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
      methodName: 'updateOrganization'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async transferOrgOwnership (orgId, { userId }) {
    this._requireReady('transferOrgOwnership')
    if (!orgId) throw new Error('orgId is required')
    if (!userId) throw new Error('userId is required')

    const response = await this._request(`/organizations/${orgId}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
      methodName: 'transferOrgOwnership'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async deleteOrganization (orgId) {
    this._requireReady('deleteOrganization')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}`, {
      method: 'DELETE',
      methodName: 'deleteOrganization'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== MEMBERS ====================

  async listOrgMembers (orgId) {
    this._requireReady('listOrgMembers')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/members`, {
      method: 'GET',
      methodName: 'listOrgMembers'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async addOrgMember (orgId, { userId, role = 'member' }) {
    this._requireReady('addOrgMember')
    if (!orgId) throw new Error('orgId is required')
    if (!userId) throw new Error('userId is required')

    const response = await this._request(`/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
      methodName: 'addOrgMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateOrgMember (orgId, memberId, { role }) {
    this._requireReady('updateOrgMember')
    if (!orgId || !memberId) throw new Error('orgId and memberId are required')

    const response = await this._request(`/organizations/${orgId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
      methodName: 'updateOrgMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async removeOrgMember (orgId, memberId) {
    this._requireReady('removeOrgMember')
    if (!orgId || !memberId) throw new Error('orgId and memberId are required')

    const response = await this._request(`/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
      methodName: 'removeOrgMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== TEAMS ====================

  async createTeam (orgId, { name, slug, parentTeam }) {
    this._requireReady('createTeam')
    if (!orgId) throw new Error('orgId is required')
    if (!name) throw new Error('name is required')

    const response = await this._request(`/organizations/${orgId}/teams`, {
      method: 'POST',
      body: JSON.stringify({ name, slug, parentTeam }),
      methodName: 'createTeam'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async listTeams (orgId) {
    this._requireReady('listTeams')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/teams`, {
      method: 'GET',
      methodName: 'listTeams'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateTeam (orgId, teamId, updates) {
    this._requireReady('updateTeam')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
      methodName: 'updateTeam'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async deleteTeam (orgId, teamId) {
    this._requireReady('deleteTeam')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}`, {
      method: 'DELETE',
      methodName: 'deleteTeam'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== TEAM MEMBERS ====================

  async listTeamMembers (orgId, teamId) {
    this._requireReady('listTeamMembers')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/members`, {
      method: 'GET',
      methodName: 'listTeamMembers'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async addTeamMember (orgId, teamId, { userId, role = 'member' }) {
    this._requireReady('addTeamMember')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    if (!userId) throw new Error('userId is required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
      methodName: 'addTeamMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateTeamMember (orgId, teamId, teamMemberId, { role }) {
    this._requireReady('updateTeamMember')
    if (!orgId || !teamId || !teamMemberId) throw new Error('orgId, teamId and teamMemberId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/members/${teamMemberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
      methodName: 'updateTeamMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async removeTeamMember (orgId, teamId, teamMemberId) {
    this._requireReady('removeTeamMember')
    if (!orgId || !teamId || !teamMemberId) throw new Error('orgId, teamId and teamMemberId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/members/${teamMemberId}`, {
      method: 'DELETE',
      methodName: 'removeTeamMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== INVITATIONS ====================

  async createOrgInvitation (orgId, { email, role = 'member', teams }) {
    this._requireReady('createOrgInvitation')
    if (!orgId) throw new Error('orgId is required')
    if (!email) throw new Error('email is required')

    const response = await this._request(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, role, teams }),
      methodName: 'createOrgInvitation'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async listOrgInvitations (orgId) {
    this._requireReady('listOrgInvitations')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/invitations`, {
      method: 'GET',
      methodName: 'listOrgInvitations'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async revokeOrgInvitation (orgId, inviteId) {
    this._requireReady('revokeOrgInvitation')
    if (!orgId || !inviteId) throw new Error('orgId and inviteId are required')

    const response = await this._request(`/organizations/${orgId}/invitations/${inviteId}/revoke`, {
      method: 'POST',
      methodName: 'revokeOrgInvitation'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async acceptOrgInvitation ({ token }) {
    this._requireReady('acceptOrgInvitation')
    if (!token) throw new Error('token is required')

    const response = await this._request('/organizations/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token }),
      methodName: 'acceptOrgInvitation'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== PROJECT PERMISSIONS ====================

  async getOrgProjectPermissions (orgId) {
    this._requireReady('getOrgProjectPermissions')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/project-permissions`, {
      method: 'GET',
      methodName: 'getOrgProjectPermissions'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateOrgProjectPermissions (orgId, permissions) {
    this._requireReady('updateOrgProjectPermissions')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/project-permissions`, {
      method: 'PATCH',
      body: JSON.stringify(permissions),
      methodName: 'updateOrgProjectPermissions'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== TEAM PROJECT ACCESS ====================

  async listTeamAccess (orgId, teamId) {
    this._requireReady('listTeamAccess')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/access`, {
      method: 'GET',
      methodName: 'listTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async grantTeamAccess (orgId, teamId, { projectId, role = 'editor' }) {
    this._requireReady('grantTeamAccess')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    if (!projectId) throw new Error('projectId is required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/access`, {
      method: 'POST',
      body: JSON.stringify({ projectId, role }),
      methodName: 'grantTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateTeamAccess (orgId, teamId, accessId, { role }) {
    this._requireReady('updateTeamAccess')
    if (!orgId || !teamId || !accessId) throw new Error('orgId, teamId and accessId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/access/${accessId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
      methodName: 'updateTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async revokeTeamAccess (orgId, teamId, accessId) {
    this._requireReady('revokeTeamAccess')
    if (!orgId || !teamId || !accessId) throw new Error('orgId, teamId and accessId are required')

    const response = await this._request(`/organizations/${orgId}/teams/${teamId}/access/${accessId}`, {
      method: 'DELETE',
      methodName: 'revokeTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== ORG PROJECTS ====================

  async createOrgProject (orgId, projectData) {
    this._requireReady('createOrgProject')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify(projectData),
      methodName: 'createOrgProject'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== CREDIT POOL ====================

  async getCreditPool (orgId) {
    this._requireReady('getCreditPool')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/credit-pool`, {
      method: 'GET',
      methodName: 'getCreditPool'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateCreditPool (orgId, pooledCredits) {
    this._requireReady('updateCreditPool')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/credit-pool`, {
      method: 'PATCH',
      body: JSON.stringify({ pooledCredits }),
      methodName: 'updateCreditPool'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== SSO ====================

  async getSso (orgId) {
    this._requireReady('getSso')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/sso`, {
      method: 'GET',
      methodName: 'getSso'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateSso (orgId, sso) {
    this._requireReady('updateSso')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/sso`, {
      method: 'PATCH',
      body: JSON.stringify(sso || {}),
      methodName: 'updateSso'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== SCIM ====================

  async getScim (orgId) {
    this._requireReady('getScim')
    if (!orgId) throw new Error('orgId is required')

    const response = await this._request(`/organizations/${orgId}/scim`, {
      method: 'GET',
      methodName: 'getScim'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateScim (orgId, { enabled, rotateToken } = {}) {
    this._requireReady('updateScim')
    if (!orgId) throw new Error('orgId is required')

    const body = {}
    if (enabled !== undefined) body.enabled = enabled
    if (rotateToken !== undefined) body.rotateToken = rotateToken

    const response = await this._request(`/organizations/${orgId}/scim`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      methodName: 'updateScim'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== ADMIN ====================

  // ==================== CUSTOM ROLES (Phase C/D) ====================
  //
  // Per-org custom roles layered on top of the built-in tier (owner /
  // co-owner / admin / member). Each custom role declares a `baseTier`
  // (the fallback authority) + an optional `additionalPermissions`
  // list from the enum in constants/orgPermissions.js. Mutations are
  // gated to owner / co-owner / admin on the server.
  //
  // `effective-role` resolves any member to their final `{ role,
  // baseTier, permissions, isBuiltin, source }` — factoring in custom
  // role assignments. Listing is open to any org member.

  /**
   * List every role defined for an org — builtin tiers plus org-specific
   * custom roles. Open to any org member.
   * @param {string} orgId
   * @returns {Promise<object>} - server response envelope
   */
  async listOrgRoles (orgId) {
    this._requireReady('listOrgRoles')
    if (!orgId) throw new Error('orgId is required')
    const response = await this._request(`/organizations/${orgId}/roles`, {
      method: 'GET',
      methodName: 'listOrgRoles'
    })
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to list org roles')
  }

  /**
   * Create a custom role on an org. Server slugifies `key` and 409s on
   * collision with an existing role. `additionalPermissions` is optional.
   * @param {string} orgId
   * @param {{key: string, name: string, baseTier: string, description?: string, additionalPermissions?: Array<string>}} role
   */
  async createOrgRole (orgId, role = {}) {
    this._requireReady('createOrgRole')
    if (!orgId) throw new Error('orgId is required')
    if (!role.key) throw new Error('role.key is required')
    if (!role.name) throw new Error('role.name is required')
    if (!role.baseTier) throw new Error('role.baseTier is required')
    const response = await this._request(`/organizations/${orgId}/roles`, {
      method: 'POST',
      body: JSON.stringify(role),
      methodName: 'createOrgRole'
    })
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to create org role')
  }

  /**
   * Patch an existing custom role. Pass only the fields that should change.
   * @param {string} orgId
   * @param {string} roleKey
   * @param {{name?: string, description?: string, baseTier?: string, additionalPermissions?: Array<string>}} updates
   */
  async updateOrgRole (orgId, roleKey, updates = {}) {
    this._requireReady('updateOrgRole')
    if (!orgId) throw new Error('orgId is required')
    if (!roleKey) throw new Error('roleKey is required')
    const hasUpdates = Object.keys(updates).length > 0
    if (!hasUpdates) throw new Error('updates cannot be empty')
    const response = await this._request(
      `/organizations/${orgId}/roles/${encodeURIComponent(roleKey)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
        methodName: 'updateOrgRole'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to update org role')
  }

  /**
   * Delete a custom role. Every member currently holding it is
   * auto-reassigned to the role's `baseTier` on the server side.
   * Audit-logged.
   * @param {string} orgId
   * @param {string} roleKey
   */
  async deleteOrgRole (orgId, roleKey) {
    this._requireReady('deleteOrgRole')
    if (!orgId) throw new Error('orgId is required')
    if (!roleKey) throw new Error('roleKey is required')
    const response = await this._request(
      `/organizations/${orgId}/roles/${encodeURIComponent(roleKey)}`,
      {
        method: 'DELETE',
        methodName: 'deleteOrgRole'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to delete org role')
  }

  /**
   * Resolve a member's effective authority — baseTier + permissions after
   * folding in any custom role they hold. Read-only; open to any org
   * member for auditing.
   * @param {string} orgId
   * @param {string} memberId
   * @returns {Promise<{role: string, baseTier: string, permissions: Array<string>, isBuiltin: boolean, source: string}>}
   */
  async getMemberEffectiveRole (orgId, memberId) {
    this._requireReady('getMemberEffectiveRole')
    if (!orgId) throw new Error('orgId is required')
    if (!memberId) throw new Error('memberId is required')
    const response = await this._request(
      `/organizations/${orgId}/members/${memberId}/effective-role`,
      {
        method: 'GET',
        methodName: 'getMemberEffectiveRole'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to get effective role')
  }

  /**
   * List org-level Payment rows (Enterprise consolidated billing).
   * Server-side gate: owner / co-owner (BILLING_EXCLUSIVE tier);
   * admins do NOT see financial history by default.
   * @param {string} orgId
   * @returns {Promise<{payments: Array<object>, total?: number}>}
   */
  async listOrgPayments (orgId) {
    this._requireReady('listOrgPayments')
    if (!orgId) throw new Error('orgId is required')
    const response = await this._request(`/organizations/${orgId}/payments`, {
      method: 'GET',
      methodName: 'listOrgPayments'
    })
    if (response?.success) return response.data
    return { payments: [] }
  }

  // ==================== TEAM INVITATIONS (Phase B) ====================
  //
  // Email-based invitations scoped to a single team. Token carries the
  // (org, team, email, inviteId) tuple so the accept endpoint doesn't
  // need path params. All mutations gated to owner / co-owner / admin
  // on the server.

  /**
   * List pending invitations for a team.
   * @param {string} orgId
   * @param {string} teamId
   * @returns {Promise<{invitations: Array<object>}>}
   */
  async listTeamInvitations (orgId, teamId) {
    this._requireReady('listTeamInvitations')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/invitations`,
      { method: 'GET', methodName: 'listTeamInvitations' }
    )
    if (response?.success) return response.data
    return { invitations: [] }
  }

  /**
   * Send a team invitation by email. `recipientName` is optional; the
   * server generates a nanoid token + expiry.
   * @param {string} orgId
   * @param {string} teamId
   * @param {{email: string, recipientName?: string}} args
   */
  async createTeamInvitation (orgId, teamId, { email, recipientName } = {}) {
    this._requireReady('createTeamInvitation')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    if (!email) throw new Error('email is required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify({ email, ...(recipientName ? { recipientName } : {}) }),
        methodName: 'createTeamInvitation'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to create team invitation')
  }

  /**
   * Revoke a pending team invitation. 404 if already accepted/revoked.
   * @param {string} orgId
   * @param {string} teamId
   * @param {string} inviteId
   */
  async revokeTeamInvitation (orgId, teamId, inviteId) {
    this._requireReady('revokeTeamInvitation')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    if (!inviteId) throw new Error('inviteId is required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/invitations/${inviteId}/revoke`,
      { method: 'POST', methodName: 'revokeTeamInvitation' }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to revoke team invitation')
  }

  /**
   * Accept a team invitation. The signed token carries org / team /
   * email / inviteId — no path params needed.
   * @param {{token: string}} args
   */
  async acceptTeamInvitation ({ token } = {}) {
    this._requireReady('acceptTeamInvitation')
    if (!token) throw new Error('token is required')
    const response = await this._request('/organizations/accept-team-invitation', {
      method: 'POST',
      body: JSON.stringify({ token }),
      methodName: 'acceptTeamInvitation'
    })
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to accept team invitation')
  }

  // ==================== TEAM WORKSPACE ACCESS ====================
  //
  // Parallel to team-project access (see listTeamAccess / grantTeamAccess
  // above) but at the workspace level. Cross-tenant grants blocked
  // server-side — the team + workspace must share the same org.

  /**
   * List all workspace-level access grants for a team.
   * @param {string} orgId
   * @param {string} teamId
   * @returns {Promise<{grants: Array<object>}>}
   */
  async listTeamWorkspaceAccess (orgId, teamId) {
    this._requireReady('listTeamWorkspaceAccess')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/workspace-access`,
      { method: 'GET', methodName: 'listTeamWorkspaceAccess' }
    )
    if (response?.success) return response.data
    return { grants: [] }
  }

  /**
   * Grant a team access to a workspace. Idempotent upsert — same
   * (team, workspace) always maps to a single row; role updates
   * transparently.
   * @param {string} orgId
   * @param {string} teamId
   * @param {{workspaceId: string, role?: string}} args - role defaults to 'guest'
   */
  async grantTeamWorkspaceAccess (orgId, teamId, { workspaceId, role = 'guest' } = {}) {
    this._requireReady('grantTeamWorkspaceAccess')
    if (!orgId || !teamId) throw new Error('orgId and teamId are required')
    if (!workspaceId) throw new Error('workspaceId is required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/workspace-access`,
      {
        method: 'POST',
        body: JSON.stringify({ workspaceId, role }),
        methodName: 'grantTeamWorkspaceAccess'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to grant team workspace access')
  }

  /**
   * Change the role of an existing team-workspace grant.
   * @param {string} orgId
   * @param {string} teamId
   * @param {string} accessId
   * @param {{role: string}} updates
   */
  async updateTeamWorkspaceAccess (orgId, teamId, accessId, { role } = {}) {
    this._requireReady('updateTeamWorkspaceAccess')
    if (!orgId || !teamId || !accessId) {
      throw new Error('orgId, teamId and accessId are required')
    }
    if (!role) throw new Error('role is required')
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/workspace-access/${accessId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
        methodName: 'updateTeamWorkspaceAccess'
      }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to update team workspace access')
  }

  /**
   * Revoke a team-workspace access grant.
   * @param {string} orgId
   * @param {string} teamId
   * @param {string} accessId
   */
  async revokeTeamWorkspaceAccess (orgId, teamId, accessId) {
    this._requireReady('revokeTeamWorkspaceAccess')
    if (!orgId || !teamId || !accessId) {
      throw new Error('orgId, teamId and accessId are required')
    }
    const response = await this._request(
      `/organizations/${orgId}/teams/${teamId}/workspace-access/${accessId}`,
      { method: 'DELETE', methodName: 'revokeTeamWorkspaceAccess' }
    )
    if (response?.success) return response.data
    throw new Error(response?.message || 'Failed to revoke team workspace access')
  }

  async adminListOrganizations (params = {}) {
    this._requireReady('adminListOrganizations')

    const queryParams = new URLSearchParams()
    if (params.status) queryParams.append('status', params.status)
    if (params.page) queryParams.append('page', params.page.toString())
    if (params.limit) queryParams.append('limit', params.limit.toString())

    const queryString = queryParams.toString()
    const url = `/organizations/admin${queryString ? `?${queryString}` : ''}`

    const response = await this._request(url, {
      method: 'GET',
      methodName: 'adminListOrganizations'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }
}
