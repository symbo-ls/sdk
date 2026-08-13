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

  // ==================== MEMBER RECORD SCOPE (LOCATION axis) ====================
  //
  // The caller side of the records-plane scope-field mechanism (server
  // f94da4cd/b8e05de5; HTTP path server a95cda9f "records: a real HTTP path
  // to read/assign WorkspaceMember.recordScope"; tickets/natali.md
  // "NAT-V1-02"). Mirrors GET/PATCH
  // /workspaces/:workspaceId/members/:userId/record-scope — a dedicated
  // sub-resource under the member (same relationship `updateWorkspace` has
  // to `updateWorkspaceSettings` above), never a key on the role PATCH, so
  // the self-assignment refusal lives on one verb.

  /**
   * Read a member's records-plane scope-field assignment — the
   * `recordScope` that NARROWS a `scoped` member's row set on every
   * records-plane request. Reads are laxer than writes: the server allows
   * a member to read their OWN scope (self === userId) as well as
   * owner/admin reading anyone's; every other combination 403s.
   *
   * @param {string} workspaceId
   * @param {string} userId
   * @returns {Promise<{ workspaceId: string, userId: string, role: string, recordScope: Record<string, Array<string>>|null, scopeFields: Array<string> }>}
   */
  async getWorkspaceMemberRecordScope (workspaceId, userId) {
    if (!workspaceId || !userId) throw new Error('workspaceId and userId are required')
    return this._call(
      'getWorkspaceMemberRecordScope',
      `/workspaces/${workspaceId}/members/${userId}/record-scope`
    )
  }

  /**
   * Assign (or clear, via `recordScope: null`) a member's records-plane
   * scope-field assignment. Owner/admin only — same gate as
   * `updateWorkspaceMemberRole`/`removeWorkspaceMember`. The server
   * refuses self-assignment UNCONDITIONALLY (not even an owner may set
   * their own scope), so `userId` must never be the caller's own id —
   * expect a 403 `forbidden_self_scope` if it is. Field names inside
   * `recordScope` are validated server-side against the workspace's OWN
   * declared grant `scopeField`s; an unknown field 400s (`err.cause`
   * carries `knownFields`) rather than silently fail-closing the member.
   *
   * `recordScope` must be explicitly provided (an object of
   * `{ scopeField: [values] }`, or `null` to clear) — omitting the key
   * entirely throws client-side before any request is sent, same as the
   * server's own `hasOwnProperty` guard.
   *
   * @param {string} workspaceId
   * @param {string} userId
   * @param {{ recordScope: Record<string, Array<string>> | null }} options
   * @returns {Promise<{ workspaceId: string, userId: string, role: string, recordScope: Record<string, Array<string>>|null, scopeFields: Array<string> }>}
   */
  async updateWorkspaceMemberRecordScope (workspaceId, userId, options = {}) {
    if (!workspaceId || !userId) throw new Error('workspaceId and userId are required')
    if (!Object.prototype.hasOwnProperty.call(options, 'recordScope')) {
      throw new Error(
        'recordScope is required (an object of { scopeField: [values] }, or null to clear)'
      )
    }
    return this._call(
      'updateWorkspaceMemberRecordScope',
      `/workspaces/${workspaceId}/members/${userId}/record-scope`,
      { method: 'PATCH', body: { recordScope: options.recordScope } }
    )
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
   * Workspace credit-meter usage rollup grouped by ACTOR instead of by
   * reason — "who spent the credits, and what the system spent on its
   * own". Sibling of `getWorkspaceUsage` (same period/from/to window),
   * grouped on `CreditLedger.actorType`/`createdBy`/`systemCause`/
   * `machineLabel` (server `b99f86b0`, tickets/fable.md CREDITS-ATTR-1)
   * instead of `reason`.
   *
   * CONTRACT, not yet verified live (tickets/sonnet.md CREDITS-ATTR-2 owns
   * `GET /workspaces/:workspaceId/usage/by-actor` — the server route,
   * final field names, and per-member cap enforcement). This wrapper
   * defines the agreed shape from the CREDITS-ATTR-1 actor model so the
   * CREDITS-ATTR-3 attribution page (workspace `admin/usage.js`) has a
   * real named method to call today. Until CREDITS-ATTR-2 ships the
   * route, this 404s — callers MUST treat that as an empty/missing state,
   * never a hard error (see `_loadAll` in `admin/usage.js`, which already
   * falls back to `{ error }` for every call in its `Promise.all`).
   *
   * Expected response shape:
   *   {
   *     period, from, to,
   *     totalCredits: number,
   *     members:  [{ userId, name, email, avatar, credits, eventCount }],
   *     system:   [{ cause, credits, eventCount }],   // cause ∈ SYSTEM_CAUSES
   *     machines: [{ machineLabel, credits, eventCount }],
   *     unattributed: { credits, eventCount, before: ISODateString|null }
   *   }
   *
   * `unattributed` is pre-feature history (`actorType` absent on the
   * ledger row) — its own bucket, permanently un-attributable to any
   * member. Never fold it into `members` (as someone's 0) or `system`.
   *
   * @param {string} workspaceId
   * @param {{ period?: 'day'|'month', from?: string|Date, to?: string|Date }} [options]
   * @returns {Promise<object>}
   */
  async getWorkspaceUsageByActor (workspaceId, { period, from, to } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const params = new URLSearchParams()
    if (period) params.set('period', String(period))
    if (from) params.set('from', from instanceof Date ? from.toISOString() : String(from))
    if (to) params.set('to', to instanceof Date ? to.toISOString() : String(to))
    const qs = params.toString() ? `?${params}` : ''
    return this._call('getWorkspaceUsageByActor', `/workspaces/${workspaceId}/usage/by-actor${qs}`)
  }

  /**
   * Start a Stripe Checkout session for a workspace credit top-up.
   * Mirrors POST /workspaces/:workspaceId/billing/topups/checkout
   * (WorkspaceController.createCreditTopupCheckout).
   *
   * Top-ups are FREEFORM: name an AMOUNT and the server derives the credits
   * at the flat retail rate. There are no packs — the fixed
   * 1,000/6,000/36,000 table was retired (server `475b2c6b`).
   *
   * `amountCents` is integer cents, minimum **2000** ($20). The floor and the
   * rate are also published on `GET /core/credits/rates`
   * (`topupMinCents`, `topupMaxCents`, `centsPerCredit`) — read them from
   * there rather than hardcoding, so a pricing change does not need an SDK
   * release.
   *
   * The client-side checks below are for INSTANT FEEDBACK ONLY. The server
   * re-validates and its 400 is the authority; never treat a passing local
   * check as permission to charge.
   *
   * Owner/admin only on the workspace.
   *
   * @param {string} workspaceId
   * @param {{ amountCents: number, successUrl?: string, cancelUrl?: string }} [options]
   * @returns {Promise<{ type: 'checkout_required', url: string, sessionId: string }>}
   */
  async createCreditTopupCheckout (workspaceId, { amountCents, successUrl, cancelUrl, credits } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')

    // Fail loudly on the retired `credits` argument instead of translating it.
    // Under the old pack table `credits: 6000` cost $100; mapping it onto the
    // flat rate would silently charge $120 for the same call. The server
    // rejects it too — this just turns a round-trip into an immediate,
    // actionable error.
    if (amountCents == null && credits != null) {
      throw new Error(
        'createCreditTopupCheckout: `credits` is no longer accepted — top-ups are freeform. ' +
        'Pass `amountCents` (integer cents, minimum 2000).'
      )
    }
    if (!Number.isInteger(Number(amountCents))) {
      throw new Error('createCreditTopupCheckout: `amountCents` must be an integer number of cents')
    }

    const body = { amountCents: Number(amountCents) }
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

  // ==================== APP INTERDEPENDENCIES (Manifest v2.1) ====================
  // spec-app-dependencies.md §6 — distinct from the whole-array
  // `updateWorkspaceSettings({workspaceApps})` writer above: this is the
  // atomic, dependency-aware install/uninstall surface — transitive
  // resolution, all-or-nothing multi-install, and an uninstall guard that
  // blocks removing an app a `required` dependent still needs.

  /**
   * Resolve one app's full transitive dependency tree against this
   * workspace's currently-installed apps. Any workspace member may read —
   * informational, needed before a non-admin member even proposes an
   * install.
   *
   * @param {string} workspaceId
   * @param {string} appId - `owner/key` (or `owner--key`)
   * @returns {Promise<{ resolved: Array<{ id, requirement:'required'|'optional', kind:string[], provides:string[], reason:string, status:'installed'|'missing', transitive:boolean }>, cycles: Array<{ path: string[] }> }>}
   */
  async getWorkspaceAppDependencies (workspaceId, appId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!appId) throw new Error('appId is required')
    // `raw: true` — this controller returns `{success, resolved, cycles}`
    // flat (no `data` envelope), unlike most workspace routes, so the plain
    // `_call` `.data` unwrap would silently resolve to `undefined`.
    const response = await this._call(
      'getWorkspaceAppDependencies',
      `/workspaces/${workspaceId}/apps/${encodeURIComponent(appId)}/dependencies`,
      { method: 'GET', raw: true },
    )
    return { resolved: response.resolved || [], cycles: response.cycles || [] }
  }

  /**
   * Install an app plus an explicitly-approved set of sibling dependencies
   * in ONE atomic write — every requested app installs, or none do. The
   * server refuses the whole request (400 `missing_required_dependencies`)
   * if a `required` dependency is neither already installed nor included in
   * `alsoInstall`. A concurrent install of the same app(s) by another caller
   * returns 409 `apps_install_conflict`.
   *
   * @param {string} workspaceId
   * @param {{ appId: string, alsoInstall?: string[] }} args
   * @returns {Promise<{ installed: string[], alreadyInstalled: string[], workspaceApps: object[] }>}
   */
  async installWorkspaceApps (workspaceId, { appId, alsoInstall } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!appId) throw new Error('appId is required')
    // Same flat-envelope note as getWorkspaceAppDependencies above — this
    // controller replies `{success, installed, alreadyInstalled,
    // workspaceApps}`, not `{success, data}`.
    const response = await this._call('installWorkspaceApps', `/workspaces/${workspaceId}/apps`, {
      method: 'POST',
      body: { appId, ...(alsoInstall ? { alsoInstall } : {}) },
      raw: true,
    })
    return {
      installed: response.installed || [],
      alreadyInstalled: response.alreadyInstalled || [],
      workspaceApps: response.workspaceApps || [],
    }
  }

  /**
   * Uninstall an app from a workspace. Returns 409 with a `dependents` list
   * (`{id, requirement}[]`) when an installed `required` dependent still
   * needs it — pass `force: true` to override (the UI must surface that
   * choice explicitly, never default to it).
   *
   * @param {string} workspaceId
   * @param {string} appId - `owner/key` (or `owner--key`)
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ uninstalled: string, dependents: Array<{id,requirement}>, forced: boolean }>}
   */
  // A 409 `app_has_dependents` response is a THROWN Error here (`_request`
  // throws on any non-2xx status) — never a resolved `{ok:false}` value.
  // `err.status === 409` and `err.cause` carries the parsed body
  // (`{error, dependents, message}`), so a caller does:
  //   try { await sdk.removeWorkspaceApp(wsId, appId) }
  //   catch (err) { if (err.status === 409) showDependentsDialog(err.cause.dependents) }
  async removeWorkspaceApp (workspaceId, appId, { force } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!appId) throw new Error('appId is required')
    const qs = force ? '?force=true' : ''
    const response = await this._call(
      'removeWorkspaceApp',
      `/workspaces/${workspaceId}/apps/${encodeURIComponent(appId)}${qs}`,
      { method: 'DELETE', raw: true },
    )
    return {
      uninstalled: response.uninstalled,
      dependents: response.dependents || [],
      forced: !!response.forced,
    }
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
