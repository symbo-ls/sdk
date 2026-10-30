import { BaseService } from './BaseService.js'

// POB — the import core (server: /core/workspaces/:workspaceId/imports/*,
// PLAN "Import core" + §7b-3a). One core for the S10 onboarding imports and
// the L6 import centre: upload one private file, preview ONE capped snapshot
// (≤ 5000 rows, 24 h), map its columns onto an installed app's collection,
// run as a job, read its progress, undo it (≤ 7 days). Owner / admin of the
// workspace in the path only.
//
// Answers are the server's `data` (the `{ success, data }` envelope is
// unwrapped). A refusal throws the HTTP error as it is: `.status` = the HTTP
// status, `.cause` = the server's JSON body (`{ error, message, details? }`),
// and `.code` = that `error` — clients branch on the code, never on the
// message text. Codes: 400 `unsupported_file` / `invalid_input` /
// `invalid_target` / `invalid_mapping` / `unknown_connector`, 404
// `object_not_found` / `preview_not_found` / `import_not_found`, 409
// `connector_not_available` / `import_running` / `already_undone` /
// `undo_window_closed`, 413 `too_large`, 422 `no_table_found`.

const withCode = (error) => {
  const body = error?.cause && typeof error.cause === 'object' ? error.cause : null
  if (body && !error.code) error.code = body.error || body.code || null
  return error
}

const unwrap = (response) =>
  response && typeof response === 'object' && 'success' in response && 'data' in response
    ? response.data
    : response

const need = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`)
  return encodeURIComponent(String(value))
}

export class ImportsService extends BaseService {
  async _imports (methodName, run) {
    this._requireReady(methodName)
    try {
      return unwrap(await run())
    } catch (error) {
      throw withCode(error)
    }
  }

  // GET …/imports/sources → `{ sources: [{ id, kind, name: { en, ka },
  // status: live|planned|missing, auth }] }` — the import connectors.
  async listImportSources (workspaceId) {
    const ws = need(workspaceId, 'workspaceId')
    return this._imports('listImportSources', () =>
      this._request(`/workspaces/${ws}/imports/sources`, {
        method: 'GET',
        methodName: 'listImportSources'
      })
    )
  }

  // GET …/imports/targets → `[{ app, collection, label: { en, ka }, fields:
  // [{ key, label, type, required }] }]` — installed apps only.
  async listImportTargets (workspaceId) {
    const ws = need(workspaceId, 'workspaceId')
    return this._imports('listImportTargets', () =>
      this._request(`/workspaces/${ws}/imports/targets`, {
        method: 'GET',
        methodName: 'listImportTargets'
      })
    )
  }

  // POST …/imports/upload (multipart `file`; pdf / csv / xlsx, ≤ 10 MB) →
  // `{ fileId, name, size, kind }`. The file is stored privately and lives
  // 24 h, or until a run of it ends.
  async uploadImportFile (workspaceId, file) {
    const ws = need(workspaceId, 'workspaceId')
    if (!file) throw new Error('file is required')
    const form = new FormData()
    form.append('file', file)
    return this._imports('uploadImportFile', () =>
      this._request(`/workspaces/${ws}/imports/upload`, {
        method: 'POST',
        body: form,
        methodName: 'uploadImportFile'
      })
    )
  }

  // POST …/imports/preview `{ fileId }` | `{ sourceId, connectionId?, object? }`
  // → `{ previewId, status, columns: [{ key, label, sample }], rows (first 5),
  // total, suggestedTarget: { app, collection } | null, suggestedMapping,
  // expiresAt }`.
  async previewImport (workspaceId, source = {}) {
    const ws = need(workspaceId, 'workspaceId')
    if (!source || typeof source !== 'object' || (!source.fileId && !source.sourceId)) {
      throw new Error('fileId or sourceId is required')
    }
    return this._imports('previewImport', () =>
      this._request(`/workspaces/${ws}/imports/preview`, {
        method: 'POST',
        body: JSON.stringify(source),
        methodName: 'previewImport'
      })
    )
  }

  // POST …/imports/run `{ previewId, target: { app, collection }, mapping:
  // { <column key>: <field key> } }` → 202 `{ importId }`.
  async runImport (workspaceId, { previewId, target, mapping } = {}) {
    const ws = need(workspaceId, 'workspaceId')
    if (!previewId) throw new Error('previewId is required')
    if (!target || typeof target !== 'object') throw new Error('target is required')
    return this._imports('runImport', () =>
      this._request(`/workspaces/${ws}/imports/run`, {
        method: 'POST',
        body: JSON.stringify({ previewId, target, mapping: mapping || {} }),
        methodName: 'runImport'
      })
    )
  }

  // GET …/imports/:importId → `{ importId, status: running|done|failed|undone,
  // target, total, counts: { created, skipped, failed }, errors: [{ row, code,
  // field? }], fetchedAt, finishedAt, undoUntil, undoneAt }`.
  async getImport (workspaceId, importId) {
    const ws = need(workspaceId, 'workspaceId')
    const id = need(importId, 'importId')
    return this._imports('getImport', () =>
      this._request(`/workspaces/${ws}/imports/${id}`, {
        method: 'GET',
        methodName: 'getImport'
      })
    )
  }

  // DELETE …/imports/:importId — undo (≤ 7 days): removes exactly the rows
  // that import created → the status answer with `removed`.
  async undoImport (workspaceId, importId) {
    const ws = need(workspaceId, 'workspaceId')
    const id = need(importId, 'importId')
    return this._imports('undoImport', () =>
      this._request(`/workspaces/${ws}/imports/${id}`, {
        method: 'DELETE',
        methodName: 'undoImport'
      })
    )
  }
}
