import { BaseService } from './BaseService.js'
import environment from '../config/environment.js'

// AssistantsService — the site assistants of the projects the signed-in user
// owns or administers (the workspace app "Assistants", system/assistants-app).
// The backend is fly-control's admin API (the Fly repo, workers/control
// src/admin.ts), not the core API: it checks the Symbols access token against
// the Symbols API of the calling workspace's environment and the project role
// itself, and reaches each assistant Worker through a service binding.
//
// Base URL: `assistantsApiUrl` (config/environment.js; env override
// SYMBOLS_ASSISTANTS_API_URL), or `options.assistantsApiUrl` on the SDK.
// Every call sends the SDK's access token (TokenManager) via _requestExternal.
// Errors carry `.status` and `.cause` = { error: { code, message, fields? } }.
//
// Reached via sdk.execute('assistants', op, args) — ASSISTANTS_ENTITY_ROUTE —
// which the workspace shell's moduleData bridge forwards for a trusted module
// granted `capabilities.assistants`.
export class AssistantsService extends BaseService {
  _base () {
    const base =
      this._options?.assistantsApiUrl || environment.assistantsApiUrl || ''
    if (!base) {
      const err = new Error('[assistants] no assistantsApiUrl configured')
      err.code = 'not_configured'
      throw err
    }
    return String(base).replace(/\/+$/, '') + '/admin/assistants'
  }

  _id (id) {
    const s = String(id || '')
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) {
      const err = new Error('[assistants] id is an assistant id')
      err.code = 'invalid'
      throw err
    }
    return s
  }

  async _call (methodName, path, init = {}) {
    this._requireAuth()
    try {
      return await this._requestExternal(this._base() + path, {
        ...init,
        methodName,
        maxRetries: init.method && init.method !== 'GET' ? 0 : undefined
      })
    } catch (err) {
      // the admin API answers { error: { code, message } }: surface its message
      const e = err?.cause?.error
      if (e && typeof e === 'object' && e.message) err.message = e.message
      throw err
    }
  }

  /** @returns {Promise<{assistants: object[]}>} */
  async list () {
    return this._call('assistants.list', '')
  }

  /** @returns {Promise<{assistant, version, settings, edited, appliesWithinS}>} */
  async get ({ id } = {}) {
    return this._call('assistants.get', '/' + this._id(id))
  }

  /** { id, version, set, note? } → { version, revision, settings, appliesWithinS } */
  async update ({ id, version, set, note } = {}) {
    return this._call('assistants.update', '/' + this._id(id), {
      method: 'PATCH',
      body: { version, set, ...(note ? { note } : {}) }
    })
  }

  /** → { revisions: [{ id, at, by, note, changed, rollbackOf? }] } */
  async revisions ({ id } = {}) {
    return this._call('assistants.revisions', '/' + this._id(id) + '/revisions')
  }

  /** { id, revision, version } → as update() */
  async rollback ({ id, revision, version } = {}) {
    return this._call('assistants.rollback', '/' + this._id(id) + '/rollback', {
      method: 'POST',
      body: { revision, version }
    })
  }

  /** → { usage, usageScope, counters, ipKeys, at } */
  async usage ({ id } = {}) {
    return this._call('assistants.usage', '/' + this._id(id) + '/usage')
  }

  /** { id, kind, scope: 'tenant'|'ip', ip?, ipHash? } → { deleted } */
  async resetCounter ({ id, kind, scope, ip, ipHash } = {}) {
    return this._call(
      'assistants.resetCounter',
      '/' + this._id(id) + '/counters/reset',
      { method: 'POST', body: { kind, scope, ...(ip ? { ip } : {}), ...(ipHash ? { ipHash } : {}) } }
    )
  }

  /** { id, message, history?, mode?, lang? } → the desk's answer { reply, mode, … } */
  async testChat ({ id, message, history, mode, lang } = {}) {
    return this._call('assistants.testChat', '/' + this._id(id) + '/chat', {
      method: 'POST',
      body: { message, ...(history ? { history } : {}), ...(mode ? { mode } : {}), ...(lang ? { lang } : {}) }
    })
  }
}

// sdk.execute('assistants', op, args): every op takes one args object.
export const ASSISTANTS_ENTITY_ROUTE = Object.freeze({
  service: 'assistants',
  methods: Object.freeze({
    list: 'list',
    get: 'get',
    update: 'update',
    revisions: 'revisions',
    rollback: 'rollback',
    usage: 'usage',
    resetCounter: 'resetCounter',
    testChat: 'testChat'
  })
})
