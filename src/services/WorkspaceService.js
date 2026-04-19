import { BaseService } from './BaseService.js'
import { WORKSPACE_MEMBER_ROLES, TEAM_GRANT_ROLES } from '../constants/roles.js'

export class WorkspaceService extends BaseService {
  // ==================== WORKSPACE CRUD ====================

  async createWorkspace ({ organization, displayName, slug }) {
    this._requireReady('createWorkspace')
    if (!organization) throw new Error('organization is required')
    if (!displayName) throw new Error('displayName is required')

    const response = await this._request('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ organization, displayName, slug }),
      methodName: 'createWorkspace'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async listWorkspaces ({ organization } = {}) {
    this._requireReady('listWorkspaces')
    const qs = organization ? `?organization=${encodeURIComponent(organization)}` : ''
    const response = await this._request(`/workspaces${qs}`, {
      method: 'GET',
      methodName: 'listWorkspaces'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getWorkspace (workspaceId) {
    this._requireReady('getWorkspace')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}`, {
      method: 'GET',
      methodName: 'getWorkspace'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateWorkspace (workspaceId, updates) {
    this._requireReady('updateWorkspace')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
      methodName: 'updateWorkspace'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async deleteWorkspace (workspaceId) {
    this._requireReady('deleteWorkspace')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}`, {
      method: 'DELETE',
      methodName: 'deleteWorkspace'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== MEMBERS ====================

  async listWorkspaceMembers (workspaceId) {
    this._requireReady('listWorkspaceMembers')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}/members`, {
      method: 'GET',
      methodName: 'listWorkspaceMembers'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async addWorkspaceMember (workspaceId, { userId, role = 'editor' }) {
    this._requireReady('addWorkspaceMember')
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!userId) throw new Error('userId is required')
    if (!WORKSPACE_MEMBER_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${WORKSPACE_MEMBER_ROLES.join(', ')}`)
    }

    const response = await this._request(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
      methodName: 'addWorkspaceMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateWorkspaceMemberRole (workspaceId, userId, { role }) {
    this._requireReady('updateWorkspaceMemberRole')
    if (!workspaceId || !userId || !role) {
      throw new Error('workspaceId, userId, role are required')
    }
    if (!WORKSPACE_MEMBER_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${WORKSPACE_MEMBER_ROLES.join(', ')}`)
    }

    const response = await this._request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
      methodName: 'updateWorkspaceMemberRole'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async removeWorkspaceMember (workspaceId, userId) {
    this._requireReady('removeWorkspaceMember')
    if (!workspaceId || !userId) throw new Error('workspaceId and userId are required')

    const response = await this._request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
      methodName: 'removeWorkspaceMember'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== TEAM GRANTS (TeamWorkspaceAccess) ====================

  async grantWorkspaceTeamAccess (workspaceId, { teamId, role = 'guest' }) {
    this._requireReady('grantWorkspaceTeamAccess')
    if (!workspaceId || !teamId) throw new Error('workspaceId and teamId are required')
    if (!TEAM_GRANT_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${TEAM_GRANT_ROLES.join(', ')}`)
    }

    const response = await this._request(`/workspaces/${workspaceId}/team-access`, {
      method: 'POST',
      body: JSON.stringify({ teamId, role }),
      methodName: 'grantWorkspaceTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async revokeWorkspaceTeamAccess (workspaceId, teamId) {
    this._requireReady('revokeWorkspaceTeamAccess')
    if (!workspaceId || !teamId) throw new Error('workspaceId and teamId are required')

    const response = await this._request(`/workspaces/${workspaceId}/team-access/${teamId}`, {
      method: 'DELETE',
      methodName: 'revokeWorkspaceTeamAccess'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== BILLING + CREDITS ====================

  async getBilling (workspaceId) {
    this._requireReady('getBilling')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}/billing`, {
      method: 'GET',
      methodName: 'getBilling'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getCreditBalance (workspaceId) {
    this._requireReady('getCreditBalance')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}/credits/balance`, {
      method: 'GET',
      methodName: 'getCreditBalance'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getCreditLedger (workspaceId, { limit, before, reason } = {}) {
    this._requireReady('getCreditLedger')
    if (!workspaceId) throw new Error('workspaceId is required')

    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (before) params.set('before', String(before))
    if (reason) params.set('reason', String(reason))
    const qs = params.toString() ? `?${params}` : ''

    const response = await this._request(`/workspaces/${workspaceId}/credits/ledger${qs}`, {
      method: 'GET',
      methodName: 'getCreditLedger'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  // ==================== SPEND CONTROLS ====================

  async getSpendControls (workspaceId) {
    this._requireReady('getSpendControls')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}/spend-controls`, {
      method: 'GET',
      methodName: 'getSpendControls'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateSpendControls (workspaceId, controls) {
    this._requireReady('updateSpendControls')
    if (!workspaceId) throw new Error('workspaceId is required')

    const response = await this._request(`/workspaces/${workspaceId}/spend-controls`, {
      method: 'PATCH',
      body: JSON.stringify(controls),
      methodName: 'updateSpendControls'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }
}
