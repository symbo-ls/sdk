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
