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

  // ==================== ORG-INTEGRATION DISPATCH (EXTERNAL SUPABASE) ====================

  /**
   * Generic call against an org-connected external Supabase project
   * (OrgIntegration row, kind `supabase_project`) — one wire verb for the
   * whole external data plane. The server routes by kind, enforces the
   * per-table op allowlist (integration `config.tableAllowlist`) and the
   * per-op role policy (read = org member, write = owner/admin), and logs
   * every call (IntegrationCallLog).
   *
   * Mirrors: POST /org-integrations/:idOrSlug/call
   * Body: { op, table, filter, order, limit, values } — only defined fields.
   *
   * Reachable declaratively via
   * sdk.execute('orgIntegration.supabase', op, { slug, table, ... }).
   *
   * @param {object} args
   * @param {string} args.idOrSlug — OrgIntegration row id or slug (e.g. 'acme')
   * @param {'introspect'|'select'|'insert'|'update'|'delete'} args.op
   * @param {string} [args.table] — required by every op except introspect
   * @param {object} [args.filter] — column → value / operator-grammar match
   * @param {object|Array} [args.order] — e.g. { column, ascending }
   * @param {number} [args.limit]
   * @param {object|Array<object>} [args.values] — insert/update payload
   * @returns {Promise<*>} unwrapped `data` from the { success, data, message } envelope
   */
  supabaseProjectCall ({ idOrSlug, op, table, filter, order, limit, values } = {}) {
    if (!idOrSlug) throw new Error('idOrSlug is required')
    if (!op) throw new Error('op is required')

    const body = { op }
    if (table !== undefined) body.table = table
    if (filter !== undefined) body.filter = filter
    if (order !== undefined) body.order = order
    if (limit !== undefined) body.limit = limit
    if (values !== undefined) body.values = values

    return this._call(
      'supabaseProjectCall',
      `/org-integrations/${encodeURIComponent(idOrSlug)}/call`,
      { method: 'POST', body }
    )
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
}
