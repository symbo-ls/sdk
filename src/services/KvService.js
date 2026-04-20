/**
 * KvService - Client for @symbo.ls/kv Cloudflare Worker REST API
 *
 * Manages key-value storage across project environments (development, staging, production).
 * Keys use `owner/project` format, e.g. `luka/xmas`.
 */
export class KvService {
  constructor ({ context, options } = {}) {
    this._context = context || {}
    this._options = options || {}
    this._kvUrl = null
    this._ready = false
  }

  init ({ context }) {
    const ctx = context || this._context
    this._kvUrl = ctx.kvUrl || this._options.kvUrl
    this._ready = true
  }

  updateContext (context) {
    if (context && typeof context === 'object') {
      Object.assign(this._context, context)
    }
  }

  isReady () {
    return this._ready
  }

  /**
   * Get a value by key
   * @param {string} key - KV key (e.g. 'luka/xmas')
   * @param {object} opts
   * @param {string} opts.env - Project env: 'development' | 'staging' | 'production'
   * @returns {Promise<{ key, value, metadata }>}
   */
  async get (key, { env = 'production' } = {}) {
    const url = `${this._kvUrl}/kv/${encodeURIComponent(key)}?env=${env}`
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `KV GET failed (${res.status})`)
    }
    return res.json()
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
    const url = `${this._kvUrl}/kv/${encodeURIComponent(key)}?env=${env}`
    const body = { value }
    if (expirationTtl) body.expirationTtl = expirationTtl
    if (metadata) body.metadata = metadata
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `KV PUT failed (${res.status})`)
    }
    return res.json()
  }

  /**
   * Delete a key
   * @param {string} key - KV key
   * @param {object} opts
   * @param {string} opts.env - Project env
   * @returns {Promise<{ ok, key }>}
   */
  async delete (key, { env = 'production' } = {}) {
    const url = `${this._kvUrl}/kv/${encodeURIComponent(key)}?env=${env}`
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `KV DELETE failed (${res.status})`)
    }
    return res.json()
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
    const params = new URLSearchParams({ env })
    if (prefix) params.set('prefix', prefix)
    if (limit) params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const url = `${this._kvUrl}/kv?${params}`
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `KV LIST failed (${res.status})`)
    }
    return res.json()
  }

  destroy () {
    this._ready = false
  }
}
