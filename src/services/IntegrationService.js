import { BaseService } from './BaseService.js'

export class IntegrationService extends BaseService {
  // ==================== INTEGRATION METHODS ====================

  /**
   * Programmatic auth sanity check (API key based).
   *
   * Mirrors: GET /integrations/whoami (requireApiKey)
   *
   * Assumption: backend reads API key from `x-api-key` header.
   * You can override via `options.headers`.
   */
  async integrationWhoami (apiKey, options = {}) {
    this._requireReady('integrationWhoami')
    if (!apiKey) {
      throw new Error('API key is required')
    }

    const headers = {
      'x-api-key': apiKey,
      ...(options.headers || {})
    }

    try {
      const response = await this._request('/integrations/whoami', {
        method: 'GET',
        headers,
        methodName: 'integrationWhoami'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to validate integration API key: ${error.message}`, { cause: error })
    }
  }

  /**
   * List integrations visible to the user.
   *
   * Mirrors: GET /integrations?orgId=&projectId=
   */
  async listIntegrations (options = {}) {
    this._requireReady('listIntegrations')

    const { orgId, projectId } = options || {}
    const queryParams = new URLSearchParams()
    if (orgId != null) { queryParams.append('orgId', String(orgId)) }
    if (projectId != null) { queryParams.append('projectId', String(projectId)) }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the analyzer matches /integrations.
      const response = queryString
        ? await this._request(`/integrations?${queryString}`, {
          method: 'GET',
          methodName: 'listIntegrations'
        })
        : await this._request('/integrations', {
          method: 'GET',
          methodName: 'listIntegrations'
        })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list integrations: ${error.message}`, { cause: error })
    }
  }

  /**
   * Create an integration.
   *
   * Mirrors: POST /integrations
   */
  async createIntegration (data = {}) {
    this._requireReady('createIntegration')
    if (!data || typeof data !== 'object') {
      throw new Error('Integration payload is required')
    }
    if (!data.name) {
      throw new Error('Integration name is required')
    }
    if (!data.ownerType) {
      throw new Error('ownerType is required')
    }

    try {
      const response = await this._request('/integrations', {
        method: 'POST',
        body: JSON.stringify(data),
        methodName: 'createIntegration'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create integration: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update an integration.
   *
   * Mirrors: PATCH /integrations/:integrationId
   */
  async updateIntegration (integrationId, update = {}) {
    this._requireReady('updateIntegration')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!update || typeof update !== 'object') {
      throw new Error('Update payload is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
        methodName: 'updateIntegration'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update integration: ${error.message}`, { cause: error })
    }
  }

  // ==================== INTEGRATION API KEY METHODS ====================

  /**
   * Create a new API key for an integration.
   *
   * Mirrors: POST /integrations/:integrationId/api-keys
   */
  async createIntegrationApiKey (integrationId, data = {}) {
    this._requireReady('createIntegrationApiKey')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!data || typeof data !== 'object') {
      throw new Error('API key payload is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify(data),
        methodName: 'createIntegrationApiKey'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create integration API key: ${error.message}`, { cause: error })
    }
  }

  /**
   * List API keys for an integration.
   *
   * Mirrors: GET /integrations/:integrationId/api-keys
   */
  async listIntegrationApiKeys (integrationId) {
    this._requireReady('listIntegrationApiKeys')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/api-keys`, {
        method: 'GET',
        methodName: 'listIntegrationApiKeys'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list integration API keys: ${error.message}`, { cause: error })
    }
  }

  /**
   * Revoke an API key for an integration.
   *
   * Mirrors: POST /integrations/:integrationId/api-keys/:keyId/revoke
   */
  async revokeIntegrationApiKey (integrationId, keyId) {
    this._requireReady('revokeIntegrationApiKey')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!keyId) {
      throw new Error('API key ID is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/api-keys/${keyId}/revoke`,
        {
          method: 'POST',
          methodName: 'revokeIntegrationApiKey'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to revoke integration API key: ${error.message}`, { cause: error })
    }
  }

  // ==================== WEBHOOK METHODS ====================

  /**
   * Create a webhook endpoint for an integration.
   *
   * Mirrors: POST /integrations/:integrationId/webhooks
   */
  async createIntegrationWebhook (integrationId, data = {}) {
    this._requireReady('createIntegrationWebhook')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Webhook payload is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify(data),
        methodName: 'createIntegrationWebhook'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create integration webhook: ${error.message}`, { cause: error })
    }
  }

  /**
   * List webhook endpoints for an integration.
   *
   * Mirrors: GET /integrations/:integrationId/webhooks
   */
  async listIntegrationWebhooks (integrationId) {
    this._requireReady('listIntegrationWebhooks')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/webhooks`, {
        method: 'GET',
        methodName: 'listIntegrationWebhooks'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list integration webhooks: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update a webhook endpoint for an integration.
   *
   * Mirrors: PATCH /integrations/:integrationId/webhooks/:webhookId
   */
  async updateIntegrationWebhook (integrationId, webhookId, update = {}) {
    this._requireReady('updateIntegrationWebhook')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!webhookId) {
      throw new Error('Webhook ID is required')
    }
    if (!update || typeof update !== 'object') {
      throw new Error('Update payload is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/webhooks/${webhookId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(update),
          methodName: 'updateIntegrationWebhook'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update integration webhook: ${error.message}`, { cause: error })
    }
  }

  /**
   * Delete a webhook endpoint for an integration.
   *
   * Mirrors: DELETE /integrations/:integrationId/webhooks/:webhookId
   */
  async deleteIntegrationWebhook (integrationId, webhookId) {
    this._requireReady('deleteIntegrationWebhook')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!webhookId) {
      throw new Error('Webhook ID is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/webhooks/${webhookId}`,
        {
          method: 'DELETE',
          methodName: 'deleteIntegrationWebhook'
        }
      )
      if (response && response.success) {
        return response.data
      }
      // Some endpoints may return 204; BaseService returns null then.
      if (response == null) {
        return null
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete integration webhook: ${error.message}`, { cause: error })
    }
  }

  /**
   * List webhook deliveries for an integration webhook.
   *
   * Mirrors: GET /integrations/:integrationId/webhooks/:webhookId/deliveries
   */
  async listIntegrationWebhookDeliveries (integrationId, webhookId, options = {}) {
    this._requireReady('listIntegrationWebhookDeliveries')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!webhookId) {
      throw new Error('Webhook ID is required')
    }

    const { page, limit, status, includePayload } = options || {}
    const queryParams = new URLSearchParams()
    if (page != null) { queryParams.append('page', String(page)) }
    if (limit != null) { queryParams.append('limit', String(limit)) }
    if (status != null) { queryParams.append('status', String(status)) }
    if (includePayload != null) { queryParams.append('includePayload', String(includePayload)) }

    const queryString = queryParams.toString()

    try {
      // Inline both branches so the analyzer matches
      // /integrations/:id/webhooks/:id/deliveries.
      const response = queryString
        ? await this._request(
          `/integrations/${integrationId}/webhooks/${webhookId}/deliveries?${queryString}`,
          { method: 'GET', methodName: 'listIntegrationWebhookDeliveries' }
        )
        : await this._request(
          `/integrations/${integrationId}/webhooks/${webhookId}/deliveries`,
          { method: 'GET', methodName: 'listIntegrationWebhookDeliveries' }
        )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list webhook deliveries: ${error.message}`, { cause: error })
    }
  }

  /**
   * Replay a webhook delivery.
   *
   * Mirrors: POST /integrations/:integrationId/webhooks/:webhookId/replay
   * Body: { deliveryId }
   */
  async replayIntegrationWebhookDelivery (integrationId, webhookId, deliveryId) {
    this._requireReady('replayIntegrationWebhookDelivery')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!webhookId) {
      throw new Error('Webhook ID is required')
    }
    if (!deliveryId) {
      throw new Error('deliveryId is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/webhooks/${webhookId}/replay`,
        {
          method: 'POST',
          body: JSON.stringify({ deliveryId }),
          methodName: 'replayIntegrationWebhookDelivery'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to replay webhook delivery: ${error.message}`, { cause: error })
    }
  }

  // ==================== CONNECTOR METHODS (GITHUB) ====================

  /**
   * List GitHub connectors for an integration.
   *
   * Mirrors: GET /integrations/:integrationId/connectors/github
   */
  async listGitHubConnectors (integrationId) {
    this._requireReady('listGitHubConnectors')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/connectors/github`, {
        method: 'GET',
        methodName: 'listGitHubConnectors'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list GitHub connectors: ${error.message}`, { cause: error })
    }
  }

  /**
   * Create a GitHub connector for an integration.
   *
   * Mirrors: POST /integrations/:integrationId/connectors/github
   */
  async createGitHubConnector (integrationId, data = {}) {
    this._requireReady('createGitHubConnector')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Connector payload is required')
    }
    if (!data.projectId) {
      throw new Error('projectId is required')
    }
    if (!data.repository) {
      throw new Error('repository is required')
    }

    try {
      const response = await this._request(`/integrations/${integrationId}/connectors/github`, {
        method: 'POST',
        body: JSON.stringify(data),
        methodName: 'createGitHubConnector'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create GitHub connector: ${error.message}`, { cause: error })
    }
  }

  /**
   * Update a GitHub connector.
   *
   * Mirrors: PATCH /integrations/:integrationId/connectors/github/:connectorId
   */
  async updateGitHubConnector (integrationId, connectorId, update = {}) {
    this._requireReady('updateGitHubConnector')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!connectorId) {
      throw new Error('Connector ID is required')
    }
    if (!update || typeof update !== 'object') {
      throw new Error('Update payload is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/connectors/github/${connectorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(update),
          methodName: 'updateGitHubConnector'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update GitHub connector: ${error.message}`, { cause: error })
    }
  }

  /**
   * Delete a GitHub connector.
   *
   * Mirrors: DELETE /integrations/:integrationId/connectors/github/:connectorId
   */
  async deleteGitHubConnector (integrationId, connectorId) {
    this._requireReady('deleteGitHubConnector')
    if (!integrationId) {
      throw new Error('Integration ID is required')
    }
    if (!connectorId) {
      throw new Error('Connector ID is required')
    }

    try {
      const response = await this._request(
        `/integrations/${integrationId}/connectors/github/${connectorId}`,
        {
          method: 'DELETE',
          methodName: 'deleteGitHubConnector'
        }
      )
      if (response && response.success) {
        return response.data
      }
      if (response == null) {
        return null
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to delete GitHub connector: ${error.message}`, { cause: error })
    }
  }

  // ==================== GITHUB REPO METHODS ====================

  /**
   * Get a single GitHub repository by owner + repo name.
   *
   * Mirrors: GET /core/integrations/github/repo?owner=<owner>&repo=<repo>
   *
   * Returns { ok, repo } from the server envelope.
   */
  async getGitHubRepo ({ owner, repo } = {}) {
    this._requireReady('getGitHubRepo')
    if (!owner) {
      throw new Error('owner is required')
    }
    if (!repo) {
      throw new Error('repo is required')
    }

    const queryParams = new URLSearchParams()
    queryParams.append('owner', String(owner))
    queryParams.append('repo', String(repo))

    try {
      const response = await this._request(
        `/integrations/github/repo?${queryParams.toString()}`,
        {
          method: 'GET',
          methodName: 'getGitHubRepo'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get GitHub repo: ${error.message}`, { cause: error })
    }
  }

  /**
   * List GitHub repositories accessible to the authenticated user / org.
   *
   * Mirrors: GET /core/integrations/github/repos?orgId=<orgId>
   *
   * Returns { ok, repos } from the server envelope.
   */
  async listGitHubRepos ({ orgId } = {}) {
    this._requireReady('listGitHubRepos')
    if (!orgId) {
      throw new Error('orgId is required')
    }

    const queryParams = new URLSearchParams()
    queryParams.append('orgId', String(orgId))

    try {
      const response = await this._request(
        `/integrations/github/repos?${queryParams.toString()}`,
        {
          method: 'GET',
          methodName: 'listGitHubRepos'
        }
      )
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to list GitHub repos: ${error.message}`, { cause: error })
    }
  }

  // ==================== ORG-INTEGRATION CRUD (/org-integrations/*) ==============
  //
  // Org-scoped integration rows (OrgIntegration model) — the connect / grant /
  // scope / order lifecycle. Distinct from the /integrations/* OAuth-app
  // surface above. These mirror the shared
  // integrations facade (workspace/packages/shared/integrations/index.js), moved
  // into the SDK proper so UI callers obey the SDK-only-transport rule.
  //
  // Server gating (server/src/domains/integrations/routes/orgIntegrations.js):
  //   GET  /org-integrations        — any org member  (ALL_ORG_TIERS)
  //   GET  /org-integrations/kinds  — any authenticated user (pre-org onboarding)
  //   POST/DELETE + assign-scope/reorder — owner/admin only
  //
  // These routes emit BARE payloads (`{ items }`, `{ kinds }`, `{ ok, ... }`),
  // not the `{ success, data, message }` envelope. `_call` tolerates both —
  // it returns a bare payload verbatim and only unwraps `data` when a
  // `success` key is present — so every method below returns the server JSON
  // as-is.

  /**
   * List an org's configured integration rows, with optional scope
   * inheritance (project ⊇ workspace ⊇ org). Undefined params are omitted
   * from the query string.
   *
   * Mirrors: GET /org-integrations?orgId=&scopeType=&scopeId=&includeParents=
   *
   * @param {object} [args]
   * @param {string} args.orgId — required; org ObjectId
   * @param {'org'|'workspace'|'project'} [args.scopeType]
   * @param {string} [args.scopeId] — required by the server when scopeType is workspace|project
   * @param {boolean} [args.includeParents] — server default true
   * @returns {Promise<{ items: object[] }>}
   */
  listOrgIntegrations ({ orgId, scopeType, scopeId, includeParents } = {}) {
    if (!orgId) throw new Error('orgId is required')
    const params = new URLSearchParams()
    params.set('orgId', String(orgId))
    if (scopeType !== undefined) params.set('scopeType', String(scopeType))
    if (scopeId !== undefined) params.set('scopeId', String(scopeId))
    if (includeParents !== undefined) params.set('includeParents', String(includeParents))
    return this._call('listOrgIntegrations', `/org-integrations?${params.toString()}`)
  }

  /**
   * Upsert an org integration row by its natural key
   * (org, scopeType, scope, kind, slug). A `secret` (e.g. an API
   * key) is written to the server-side secret store and NEVER returned.
   * `config` carries the per-table op grants (`config.tableAllowlist` +
   * optional `config.writeRoles`) the data plane enforces.
   * `payload` is sent VERBATIM.
   *
   * Mirrors: POST /org-integrations
   *
   * @param {object} payload
   * @param {string} payload.orgId
   * @param {string} payload.kind — e.g. 'n8n', 'custom_http'
   * @param {string} [payload.slug] — server default 'default'
   * @param {'org'|'workspace'|'project'} [payload.scopeType] — server default 'org'
   * @param {string} [payload.scopeId] — required when scopeType is workspace|project
   * @param {string} [payload.displayName]
   * @param {string} [payload.secret] — write-only; → server secret store, never echoed
   * @param {object} [payload.config] — e.g. { tableAllowlist, writeRoles }
   * @param {boolean} [payload.enabled]
   * @returns {Promise<{ ok: boolean, kind: string, slug: string, scopeType: string, scopeId: string|null, hasSecret: boolean, wroteSecret: boolean }>}
   */
  upsertOrgIntegration (payload = {}) {
    if (!payload.orgId) throw new Error('orgId is required')
    if (!payload.kind) throw new Error('kind is required')
    return this._call('upsertOrgIntegration', '/org-integrations', {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Delete an org integration row. Must match the row's scope EXACTLY (no
   * inheritance on delete); the server also deletes its stored secret
   * (best-effort). The identifying fields ride in the request BODY (not the
   * path) — only defined fields are sent.
   *
   * Mirrors: DELETE /org-integrations
   *
   * @param {object} args
   * @param {string} args.orgId
   * @param {string} args.kind
   * @param {string} [args.slug] — server default 'default'
   * @param {'org'|'workspace'|'project'} [args.scopeType] — server default 'org'
   * @param {string} [args.scopeId]
   * @returns {Promise<{ ok: boolean, kind: string, slug: string, scopeType: string, scopeId: string|null }>}
   */
  deleteOrgIntegration ({ orgId, kind, slug, scopeType, scopeId } = {}) {
    if (!orgId) throw new Error('orgId is required')
    if (!kind) throw new Error('kind is required')
    const body = { orgId, kind }
    if (slug !== undefined) body.slug = slug
    if (scopeType !== undefined) body.scopeType = scopeType
    if (scopeId !== undefined) body.scopeId = scopeId
    return this._call('deleteOrgIntegration', '/org-integrations', {
      method: 'DELETE',
      body,
    })
  }

  /**
   * Move an integration row from one scope to another. The row keeps its id
   * (and therefore its stored secret). `payload` is sent VERBATIM.
   *
   * Mirrors: POST /org-integrations/assign-scope
   *
   * @param {object} payload
   * @param {string} payload.orgId
   * @param {string} payload.kind
   * @param {string} [payload.slug] — server default 'default'
   * @param {'org'|'workspace'|'project'} [payload.fromScopeType] — server default 'org'
   * @param {string} [payload.fromScopeId]
   * @param {'org'|'workspace'|'project'} payload.toScopeType
   * @param {string} [payload.toScopeId] — required when toScopeType is workspace|project
   * @returns {Promise<object>}
   */
  assignOrgIntegrationScope (payload = {}) {
    if (!payload.orgId) throw new Error('orgId is required')
    if (!payload.kind) throw new Error('kind is required')
    return this._call('assignOrgIntegrationScope', '/org-integrations/assign-scope', {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Persist a drag-and-drop reorder of an org's integration instances
   * (§I12). `slugs` is the new ordered array for the given
   * (orgId, kind, scopeType, scopeId); each slug at index i gets position=i,
   * so the list endpoint returns them in order. `payload` is sent VERBATIM.
   *
   * Mirrors: POST /org-integrations/reorder
   *
   * @param {object} payload
   * @param {string} payload.orgId
   * @param {string} payload.kind
   * @param {string[]} payload.slugs
   * @param {'org'|'workspace'|'project'} [payload.scopeType] — server default 'org'
   * @param {string} [payload.scopeId]
   * @returns {Promise<{ ok: boolean, kind: string, slugs: string[] }>}
   */
  reorderOrgIntegrations (payload = {}) {
    if (!payload.orgId) throw new Error('orgId is required')
    if (!payload.kind) throw new Error('kind is required')
    return this._call('reorderOrgIntegrations', '/org-integrations/reorder', {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Read the integration-kinds catalogue. Any authenticated user — no org
   * membership required (onboarding renders this pre-org).
   *
   * Mirrors: GET /org-integrations/kinds
   *
   * @returns {Promise<{ kinds: object[] }>}
   */
  listOrgIntegrationKinds () {
    return this._call('listOrgIntegrationKinds', '/org-integrations/kinds')
  }

  // ── Capability dispatch (data plane) ──────────────────────────────────
  // The CRUD above manages OrgIntegration rows; this is the per-kind call
  // surface that actually reaches the connected integration. Two server
  // routes cover it — row-addressed (idOrSlug known) and body-addressed
  // (kind + scope known) — see callOrgIntegrationCapability below.

  /**
   * Invoke a capability on an org integration — the per-kind data-plane
   * dispatcher behind the CRUD above. Routes to the row-addressed endpoint
   * when `idOrSlug` is given (a Mongo id or slug; `kind` then only
   * disambiguates an ambiguous slug), else the body-addressed endpoint
   * keyed on (orgId, kind, scopeType, scopeId, slug).
   *
   * `workspaceId` is REQUIRED for a paid kind whose row is not itself
   * workspace-scoped — the server 400s `workspace_required` without it (it
   * needs a workspace to resolve the row's WorkspaceMarketplaceEntitlement
   * against). Always safe to pass when known.
   *
   * Mirrors: POST /org-integrations/:idOrSlug/call — idOrSlug given
   *          POST /org-integrations/call           — idOrSlug omitted
   *
   * @param {object} args
   * @param {string} args.orgId — required; org ObjectId
   * @param {string} [args.idOrSlug] — Mongo id or slug of the row; when given, uses the row-addressed route
   * @param {string} [args.kind] — required when idOrSlug is omitted; optional slug-disambiguator otherwise
   * @param {string} args.capability — required; must be in the kind's catalogue `capabilities`
   * @param {object} [args.args] — capability-specific arguments; server default {}
   * @param {string} [args.workspaceId] — required for paid kinds not already workspace-scoped
   * @param {string} [args.slug] — body-addressed route only; server default 'default'
   * @param {'org'|'workspace'|'project'} [args.scopeType] — body-addressed route only; server default 'org'
   * @param {string} [args.scopeId] — body-addressed route only; required when scopeType is workspace|project
   * @returns {Promise<{ ok: boolean, status: number, result: any, entitlementId?: string }>}
   */
  callOrgIntegrationCapability ({
    orgId,
    idOrSlug,
    kind,
    capability,
    args,
    workspaceId,
    slug,
    scopeType,
    scopeId,
  } = {}) {
    if (!orgId) throw new Error('orgId is required')
    if (!capability) throw new Error('capability is required')

    const body = { orgId, capability }
    if (args !== undefined) body.args = args
    if (workspaceId !== undefined) body.workspaceId = workspaceId

    if (idOrSlug) {
      if (kind !== undefined) body.kind = kind
      return this._call('callOrgIntegrationCapability', `/org-integrations/${idOrSlug}/call`, {
        method: 'POST',
        body,
      })
    }

    if (!kind) throw new Error('kind is required when idOrSlug is not provided')
    body.kind = kind
    if (slug !== undefined) body.slug = slug
    if (scopeType !== undefined) body.scopeType = scopeType
    if (scopeId !== undefined) body.scopeId = scopeId
    return this._call('callOrgIntegrationCapability', '/org-integrations/call', {
      method: 'POST',
      body,
    })
  }

  /**
   * Trigger a manual "Pull now" sync for an org's GitHub Projects v2 board.
   *
   * Mirrors: POST /core/integrations/github/sync
   * Body: { orgId, slug, scopeType, scopeId }
   *
   * Returns { ok, summary } from the server envelope.
   */
  async syncGitHubIntegration ({ orgId, slug = 'default', scopeType = 'org', scopeId = null } = {}) {
    this._requireReady('syncGitHubIntegration')
    if (!orgId) {
      throw new Error('orgId is required')
    }

    try {
      const response = await this._request('/integrations/github/sync', {
        method: 'POST',
        body: JSON.stringify({ orgId, slug, scopeType, scopeId }),
        methodName: 'syncGitHubIntegration'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to sync GitHub integration: ${error.message}`, { cause: error })
    }
  }

  // ==================== MARKETPLACE INTEGRATIONS (/marketplace/integrations/*) ==
  //
  // Install / uninstall / entitlement lifecycle for the integrations
  // marketplace (CU-INT §180). Distinct from the /org-integrations/* CRUD
  // above: these routes own the paid-kind Stripe Checkout branch and the
  // WorkspaceMarketplaceEntitlement rows that gate a paid kind's capability
  // calls (see callOrgIntegrationCapability's `workspace_required` /
  // `no_active_entitlement` errors above).
  //
  // Server gating (server/src/domains/billing/routes/marketplaceIntegrations.js):
  //   GET  /marketplace/integrations/entitlements       — any org member
  //   GET  /marketplace/integrations/entitlement-check  — any org member
  //   POST /marketplace/integrations/install            — owner/admin only
  //   POST /marketplace/integrations/uninstall          — owner/admin only
  //
  // These routes emit BARE payloads (`{ items }`, `{ active, entitlement }`,
  // `{ ok, ... }`), not the `{ success, data, message }` envelope — `_call`
  // returns them verbatim, same contract as the org-integration CRUD block.

  /**
   * List a workspace's marketplace entitlements.
   *
   * Mirrors: GET /marketplace/integrations/entitlements?workspaceId=&status=
   *
   * @param {string} workspaceId — required; Workspace ObjectId
   * @param {object} [options]
   * @param {string} [options.status] — comma-separated status list; server default 'active,trialing'
   * @returns {Promise<{ items: object[] }>}
   */
  listMarketplaceEntitlements (workspaceId, { status } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    const params = new URLSearchParams()
    params.set('workspaceId', String(workspaceId))
    if (status !== undefined) params.set('status', String(status))
    return this._call('listMarketplaceEntitlements', `/marketplace/integrations/entitlements?${params.toString()}`)
  }

  /**
   * Check whether a workspace holds an active entitlement for a marketplace
   * integration kind — used to decide "Install" vs "Manage" in the UI.
   *
   * Mirrors: GET /marketplace/integrations/entitlement-check?workspaceId=&kind=
   *
   * @param {object} args
   * @param {string} args.workspaceId — required
   * @param {string} args.kind — required
   * @returns {Promise<{ active: boolean, entitlement: object|null }>}
   */
  checkMarketplaceEntitlement ({ workspaceId, kind } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!kind) throw new Error('kind is required')
    const params = new URLSearchParams()
    params.set('workspaceId', String(workspaceId))
    params.set('kind', String(kind))
    return this._call('checkMarketplaceEntitlement', `/marketplace/integrations/entitlement-check?${params.toString()}`)
  }

  /**
   * Install a marketplace integration into a workspace. Free kinds create
   * the OrgIntegration row immediately (`installed: 'free'`); paid kinds
   * with an existing active entitlement do the same
   * (`installed: 'paid_existing_entitlement'`); paid kinds without one
   * return a Stripe Checkout URL to redirect the user to
   * (`installed: 'checkout_required'`).
   *
   * Mirrors: POST /marketplace/integrations/install
   *
   * @param {object} payload
   * @param {string} payload.orgId — required
   * @param {string} payload.workspaceId — required
   * @param {string} payload.kind — required
   * @param {string} [payload.slug] — server default 'default'
   * @param {'org'|'workspace'|'project'} [payload.scopeType] — server default 'workspace'
   * @param {string} [payload.scopeId] — required when scopeType is 'project'; defaults to workspaceId when scopeType is 'workspace'
   * @param {string} [payload.displayName]
   * @param {object} [payload.config]
   * @param {string} [payload.secret] — write-only; → server secret store, never echoed
   * @param {string} [payload.successUrl] — paid path Stripe Checkout redirect
   * @param {string} [payload.cancelUrl] — paid path Stripe Checkout redirect
   * @returns {Promise<{ ok: boolean, installed: 'free'|'paid_existing_entitlement'|'checkout_required', orgIntegrationId: string, entitlementId?: string, checkoutUrl?: string, sessionId?: string }>}
   */
  installMarketplaceIntegration (payload = {}) {
    if (!payload.orgId) throw new Error('orgId is required')
    if (!payload.workspaceId) throw new Error('workspaceId is required')
    if (!payload.kind) throw new Error('kind is required')
    return this._call('installMarketplaceIntegration', '/marketplace/integrations/install', {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Uninstall a marketplace integration from a workspace. Deletes the
   * OrgIntegration row + its secret, and (by default) cancels the backing
   * Stripe subscription for paid kinds — the resulting webhook flips the
   * entitlement to status='canceled'.
   *
   * Mirrors: POST /marketplace/integrations/uninstall
   *
   * @param {object} payload
   * @param {string} payload.orgId — required
   * @param {string} payload.workspaceId — required
   * @param {string} payload.kind — required
   * @param {string} [payload.slug] — server default 'default'
   * @param {'org'|'workspace'|'project'} [payload.scopeType] — server default 'workspace'
   * @param {string} [payload.scopeId]
   * @param {boolean} [payload.cancelSubscription] — server default true
   * @returns {Promise<{ ok: boolean, uninstalled: boolean, canceledSubscription: boolean, entitlementId: string|null }>}
   */
  uninstallMarketplaceIntegration (payload = {}) {
    if (!payload.orgId) throw new Error('orgId is required')
    if (!payload.workspaceId) throw new Error('workspaceId is required')
    if (!payload.kind) throw new Error('kind is required')
    return this._call('uninstallMarketplaceIntegration', '/marketplace/integrations/uninstall', {
      method: 'POST',
      body: payload,
    })
  }
}
