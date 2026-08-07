import { BaseService } from './BaseService.js'
import { WORKSPACE_MEMBER_ROLES, TEAM_GRANT_ROLES } from '../constants/roles.js'

const workspaceEnvironment = (options = {}) =>
  options.environment || options.environmentKey || options.envKey || options.env

const environmentQuery = (environment) =>
  `?environment=${encodeURIComponent(environment)}`

const canonicalWorkspaceEnvironmentInput = (input = {}) => {
  const { environmentKey: _environmentKey, envKey: _envKey, env: _env, ...canonical } = input
  return { ...canonical, environment: workspaceEnvironment(input) }
}

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

  /**
   * Merge-safe partial write of a workspace's `settings` bag. Mirrors
   * PATCH /workspaces/:id/settings
   * (WorkspaceController.updateWorkspaceSettings) — the server deep-merges
   * each provided key into `Workspace.settings` via a per-key `$set`
   * (`settings.<key>`), so a UI write of ONE key never clobbers its
   * siblings the way `updateWorkspace` (whole-doc PATCH /workspaces/:id →
   * `$set` REPLACE of the whole `settings` object) would.
   *
   * `partialSettings` is a FLAT object of settings keys — only the keys you
   * pass are touched. Server whitelist:
   * `navbar`, `apps`, `home_default_panels`, `designSystem`,
   * `workspaceModule`, `language`, `layoutDirection`, `modules`
   * (unknown keys are rejected). Owner/admin gated server-side (same
   * `requireWorkspaceRole(['owner','admin'])` as `updateWorkspace`). When
   * `workspaceModule` is present the server validates the module reference
   * (project resolves, is `metadata.workspaceModule`, org-readable) and
   * clamps its `tier` before persisting.
   *
   * @param {string} workspaceId
   * @param {{ navbar?: any, apps?: any, home_default_panels?: any, designSystem?: any, workspaceModule?: any, language?: any, layoutDirection?: any, modules?: any }} partialSettings
   * @returns {Promise<{ settings: object }>} unwrapped server data (server sends `{ settings }`)
   */
  async updateWorkspaceSettings (workspaceId, partialSettings) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!partialSettings || typeof partialSettings !== 'object' || Array.isArray(partialSettings)) {
      throw new Error('partialSettings object is required')
    }
    return this._call('updateWorkspaceSettings', `/workspaces/${workspaceId}/settings`, {
      method: 'PATCH',
      body: partialSettings,
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

  /**
   * Workspace credit-meter usage rollup. Mirrors
   * `GET /workspaces/:workspaceId/usage` (UsageController.workspaceSummary,
   * server PR #349). Server aggregates UsageMeterEvent → UsageRollup rows
   * by reason for the requested period (`day` | `month` | explicit
   * `from`/`to`). Returns totals per reason + ratedCredits + eventCount.
   * Workspace member access required server-side.
   *
   * @param {string} workspaceId
   * @param {{ period?: 'day'|'month', from?: string|Date, to?: string|Date, reason?: string }} [options]
   * @returns {Promise<object>}
   */
  async getWorkspaceUsage (workspaceId, { period, from, to, reason } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const params = new URLSearchParams()
    if (period) params.set('period', String(period))
    if (from) params.set('from', from instanceof Date ? from.toISOString() : String(from))
    if (to) params.set('to', to instanceof Date ? to.toISOString() : String(to))
    if (reason) params.set('reason', String(reason))
    const qs = params.toString() ? `?${params}` : ''
    return this._call('getWorkspaceUsage', `/workspaces/${workspaceId}/usage${qs}`)
  }

  /**
   * Start a Stripe Checkout session for a workspace-level credit top-up
   * pack. Mirrors POST /workspaces/:workspaceId/billing/topups/checkout
   * (WorkspaceController.createCreditTopupCheckout, server PR #349).
   * Server validates that `credits` equals the configured TOPUP_PACK_SIZE
   * (1000 by default); other quantities are rejected.
   *
   * Owner/admin only on the workspace.
   *
   * @param {string} workspaceId
   * @param {{ successUrl?: string, cancelUrl?: string, credits?: number }} [options]
   * @returns {Promise<{ type: 'checkout_required', url: string, sessionId: string }>}
   */
  async createCreditTopupCheckout (workspaceId, { successUrl, cancelUrl, credits } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const body = {}
    if (credits != null) body.credits = credits
    if (successUrl) body.successUrl = successUrl
    if (cancelUrl) body.cancelUrl = cancelUrl
    return this._call(
      'createCreditTopupCheckout',
      `/workspaces/${workspaceId}/billing/topups/checkout`,
      { method: 'POST', body }
    )
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

  // ==================== CONFIG + SECRETS ====================

  /**
   * List public configuration for one workspace environment. Available to
   * every workspace member; values returned by this route are explicitly
   * classified as safe for frontend use.
   *
   * @param {string} workspaceId
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string }} options
   * @returns {Promise<{ environment: string, config: Record<string, string> }>}
   */
  async getWorkspacePublicConfig (workspaceId, options = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const environment = workspaceEnvironment(options)
    if (!environment) throw new Error('environment is required')
    return this._call(
      'getWorkspacePublicConfig',
      `/workspaces/${encodeURIComponent(workspaceId)}/config/public${environmentQuery(environment)}`
    )
  }

  /**
   * Create or replace a public config value. The server restricts this to
   * workspace admins and owners and rejects secret-shaped public keys.
   *
   * @param {string} workspaceId
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string, key: string, value: unknown, description?: string }} input
   * @returns {Promise<object>}
   */
  async upsertWorkspacePublicConfig (workspaceId, input = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!workspaceEnvironment(input)) throw new Error('environment is required')
    if (!input.key) throw new Error('key is required')
    if (input.value === undefined || input.value === null) throw new Error('value is required')
    return this._call(
      'upsertWorkspacePublicConfig',
      `/workspaces/${encodeURIComponent(workspaceId)}/config/public`,
      { method: 'POST', body: canonicalWorkspaceEnvironmentInput(input) }
    )
  }

  /**
   * Delete a public config value from one workspace environment.
   *
   * @param {string} workspaceId
   * @param {string} key
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string }} options
   * @returns {Promise<{ deleted: boolean }>}
   */
  async deleteWorkspacePublicConfig (workspaceId, key, options = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!key) throw new Error('key is required')
    const environment = workspaceEnvironment(options)
    if (!environment) throw new Error('environment is required')
    return this._call(
      'deleteWorkspacePublicConfig',
      `/workspaces/${encodeURIComponent(workspaceId)}/config/public/${encodeURIComponent(key)}${environmentQuery(environment)}`,
      { method: 'DELETE' }
    )
  }

  /**
   * List private-secret metadata for an environment. This method never
   * returns plaintext values or provider references.
   *
   * @param {string} workspaceId
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string }} options
   * @returns {Promise<{ environment: string, secrets: Array<object> }>}
   */
  async listWorkspaceSecrets (workspaceId, options = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const environment = workspaceEnvironment(options)
    if (!environment) throw new Error('environment is required')
    return this._call(
      'listWorkspaceSecrets',
      `/workspaces/${encodeURIComponent(workspaceId)}/secrets${environmentQuery(environment)}`
    )
  }

  /**
   * Create or rotate a write-only workspace secret. The response contains
   * metadata only; the supplied value is never readable through this SDK.
   *
   * @param {string} workspaceId
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string, key: string, value: string, description?: string, allowedConsumers: Array<{ type: 'backend_service'|'integration_job'|'function'|'workspace_backend', id: string }> }} input
   * @returns {Promise<object>}
   */
  async upsertWorkspaceSecret (workspaceId, input = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!workspaceEnvironment(input)) throw new Error('environment is required')
    if (!input.key) throw new Error('key is required')
    if (input.value === undefined || input.value === null || input.value === '') {
      throw new Error('value is required')
    }
    if (!Array.isArray(input.allowedConsumers) || input.allowedConsumers.length === 0) {
      throw new Error('allowedConsumers are required')
    }
    return this._call(
      'upsertWorkspaceSecret',
      `/workspaces/${encodeURIComponent(workspaceId)}/secrets`,
      { method: 'POST', body: canonicalWorkspaceEnvironmentInput(input) }
    )
  }

  /**
   * Delete a private secret from one workspace environment.
   *
   * @param {string} workspaceId
   * @param {string} key
   * @param {{ environment?: string, environmentKey?: string, envKey?: string, env?: string }} options
   * @returns {Promise<{ deleted: boolean }>}
   */
  async deleteWorkspaceSecret (workspaceId, key, options = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!key) throw new Error('key is required')
    const environment = workspaceEnvironment(options)
    if (!environment) throw new Error('environment is required')
    return this._call(
      'deleteWorkspaceSecret',
      `/workspaces/${encodeURIComponent(workspaceId)}/secrets/${encodeURIComponent(key)}${environmentQuery(environment)}`,
      { method: 'DELETE' }
    )
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
   * @param {{email: string, role?: string, recipientName?: string, teams?: string[]}} args
   *   role defaults to 'editor'; `teams` (GA-W2.1) is an optional list of
   *   platform Team slugs or ids — resolved server-side against the
   *   workspace's OWN org and attached on accept; unknown entries reject
   *   the invite with `invalid_teams`.
   */
  async createWorkspaceInvitation (
    workspaceId,
    { email, role = 'editor', recipientName, teams } = {}
  ) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!email) throw new Error('email is required')
    return this._call(
      'createWorkspaceInvitation',
      `/workspaces/${workspaceId}/invitations`,
      {
        method: 'POST',
        body: {
          email,
          role,
          ...(recipientName ? { recipientName } : {}),
          ...(Array.isArray(teams) && teams.length ? { teams } : {})
        },
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
