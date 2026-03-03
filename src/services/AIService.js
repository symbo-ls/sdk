import { BaseService } from './BaseService.js'

export class AIService extends BaseService {
  constructor (config) {
    super(config)
    this._client = null
    this._initialized = false
    this._defaultConfig = {
      apiUrl: 'https://api.openai.com/v1/engines/text-curie/completions',
      temperature: 0.0,
      maxTokens: 2000,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }

  init () {
    try {
      const { appKey, authToken } = this._context

      // Store masked configuration info
      this._info = {
        config: {
          appKey: appKey ? `${appKey.substr(0, 4)}...${appKey.substr(-4)}` : '',
          hasToken: Boolean(authToken)
        }
      }

      this._initialized = true
      this._setReady()
    } catch (error) {
      this._setError(error)
      throw error
    }
  }

  // Helper to check if method requires initialization
  _requiresInit (methodName) {
    const noInitMethods = new Set(['getConfig', 'validateConfig'])
    return !noInitMethods.has(methodName)
  }

  // Override _requireReady to be more flexible
  _requireReady (methodName) {
    if (this._requiresInit(methodName) && !this._initialized) {
      throw new Error('AI service not initialized')
    }
  }

  // Configuration methods
  getConfig () {
    return {
      ...this._defaultConfig,
      ...this._context.ai?.config
    }
  }

  validateConfig (config = {}) {
    const requiredFields = ['apiUrl', 'temperature', 'maxTokens']
    const missingFields = requiredFields.filter(field => !config[field])

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required configuration fields: ${missingFields.join(', ')}`
      )
    }

    return true
  }

  // AI Methods
  async prompt (query, opts = {}) {
    this._requireReady('prompt')

    try {
      const config = this.getConfig()
      const options = {
        method: 'POST',
        headers: {
          ...config.headers,
          Authorization: `Bearer ${this._context.ai?.authToken}`
        },
        body: JSON.stringify({
          prompt: query,
          temperature: opts.temperature || config.temperature,
          max_tokens: opts.maxTokens || config.maxTokens,
          ...opts
        })
      }

      const response = await this._request(config.apiUrl, options)
      return response
    } catch (error) {
      throw new Error(`AI prompt failed: ${error.message}`)
    }
  }

  // Helper methods
  async _request (url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this._defaultConfig.headers,
          ...options.headers
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Request failed')
      }

      return response.status === 204 ? null : response.json()
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`)
    }
  }

  // Context update methods
  updateAuth (authToken) {
    this.updateContext({
      ai: {
        ...this._context.ai,
        authToken
      }
    })
  }

  updateConfig (config) {
    this.validateConfig(config)
    this.updateContext({
      ai: {
        ...this._context.ai,
        config: {
          ...this._context.ai?.config,
          ...config
        }
      }
    })
  }

  // Cleanup
  destroy () {
    this._client = null
    this._initialized = false
    this._setReady(false)
  }
}
