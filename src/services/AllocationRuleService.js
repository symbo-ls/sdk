import { BaseService } from './BaseService.js'

/**
 * Allocation rules govern how credits are distributed from an organization
 * credit pool to workspaces. Each rule pairs a policy (e.g. priority, weight,
 * cap) with a monthly allocation and a resolution priority.
 */
export class AllocationRuleService extends BaseService {
  // ==================== ALLOCATION RULES ====================

  async listRules (orgId) {
    this._requireReady('listRules')
    const qs = orgId ? `?organizationId=${encodeURIComponent(orgId)}` : ''
    const response = await this._request(`/allocation-rules${qs}`, {
      method: 'GET',
      methodName: 'listRules'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async getRule (ruleId) {
    this._requireReady('getRule')
    if (!ruleId) throw new Error('ruleId is required')

    const response = await this._request(`/allocation-rules/${ruleId}`, {
      method: 'GET',
      methodName: 'getRule'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async createRule ({ organizationId, workspaceId, policy, monthlyAllocation, priority }) {
    this._requireReady('createRule')
    if (!organizationId) throw new Error('organizationId is required')

    const response = await this._request('/allocation-rules', {
      method: 'POST',
      body: JSON.stringify({ organizationId, workspaceId, policy, monthlyAllocation, priority }),
      methodName: 'createRule'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async updateRule (ruleId, patch) {
    this._requireReady('updateRule')
    if (!ruleId) throw new Error('ruleId is required')

    const response = await this._request(`/allocation-rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch || {}),
      methodName: 'updateRule'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }

  async deleteRule (ruleId) {
    this._requireReady('deleteRule')
    if (!ruleId) throw new Error('ruleId is required')

    const response = await this._request(`/allocation-rules/${ruleId}`, {
      method: 'DELETE',
      methodName: 'deleteRule'
    })
    if (response.success) return response.data
    throw new Error(response.message)
  }
}
