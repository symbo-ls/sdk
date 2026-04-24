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
}
