import { BaseService } from './BaseService.js'
import environment from '../config/environment.js'

/**
 * KvService - Client for @symbo.ls/kv Cloudflare Worker REST API
 *
 * Manages key-value storage across project environments (development, staging, production).
 * Keys use `owner/project` format, e.g. `luka/xmas`.
 *
 * Auth: routes through `BaseService._requestExternal`, which attaches the
 * Symbols access token. The KV worker validates the bearer token server-side
 * and scopes operations to the caller's projects — never trust the URL alone.
 */
export class KvService extends BaseService {
  init ({ context }) {
    super.init({ context })
    const ctx = context || this._context
    this._kvUrl = ctx.kvUrl || this._options.kvUrl || environment.kvUrl
    if (!this._kvUrl) {
      throw new Error('KvService: kvUrl not configured (set context.kvUrl, options.kvUrl, or SYMBOLS_KV_URL)')
    }
  }

  _kvEndpoint (key, params = {}) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const tail = qs.toString() ? `?${qs}` : ''
    return key !== undefined && key !== null
      ? `${this._kvUrl}/kv/${encodeURIComponent(key)}${tail}`
      : `${this._kvUrl}/kv${tail}`
  }

  /**
   * Get a value by key
   * @param {string} key - KV key (e.g. 'luka/xmas')
   * @param {object} opts
   * @param {string} opts.env - Project env: 'development' | 'staging' | 'production'
   * @returns {Promise<{ key, value, metadata }>}
   */
  async get (key, { env = 'production' } = {}) {
    return this._requestExternal(this._kvEndpoint(key, { env }), {
      method: 'GET',
      methodName: 'kv.get'
    })
  }

  /**
   * Set a value by key
   * @param {string} key - KV key
   * @param {*} value - Value to store
   * @param {object} opts
   * @param {string} opts.env - Project env
   * @param {number} opts.expirationTtl - TTL in seconds
   * @param {object} opts.metadata - Optional metadata
   * @returns {Promise<{ ok, key }>}
   */
  async put (key, value, { env = 'production', expirationTtl, metadata } = {}) {
    const body = { value }
    if (expirationTtl) body.expirationTtl = expirationTtl
    if (metadata) body.metadata = metadata
    return this._requestExternal(this._kvEndpoint(key, { env }), {
      method: 'PUT',
      body: JSON.stringify(body),
      methodName: 'kv.put'
    })
  }

  /**
   * Delete a key
   * @param {string} key - KV key
   * @param {object} opts
   * @param {string} opts.env - Project env
   * @returns {Promise<{ ok, key }>}
   */
  async delete (key, { env = 'production' } = {}) {
    return this._requestExternal(this._kvEndpoint(key, { env }), {
      method: 'DELETE',
      methodName: 'kv.delete'
    })
  }

  /**
   * List keys
   * @param {object} opts
   * @param {string} opts.env - Project env
   * @param {string} opts.prefix - Key prefix filter
   * @param {number} opts.limit - Max results
   * @param {string} opts.cursor - Pagination cursor
   * @returns {Promise<{ keys, list_complete, cursor }>}
   */
  async list ({ env = 'production', prefix, limit, cursor } = {}) {
    return this._requestExternal(this._kvEndpoint(null, { env, prefix, limit, cursor }), {
      method: 'GET',
      methodName: 'kv.list'
    })
  }

  destroy () {
    super.destroy()
  }
}
