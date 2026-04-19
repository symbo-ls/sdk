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
}
