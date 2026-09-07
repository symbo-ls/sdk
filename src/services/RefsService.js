import { BaseService } from './BaseService.js'

// RefsService wraps the main server's entity-reference surface,
// `/core/workspaces/:workspaceId/refs/*` plus the workspace search route
// beside it:
//
//   GET /core/workspaces/:wsId/refs/resolve?ref=<ref>
//     → { ref, type, id, title, content }  — the entity's readable content
//   GET /core/workspaces/:wsId/refs/relations?ref=<ref>&depth=1
//     → { ref, depth, neighbors: [{ ref, type, relation, direction, title }] }
//   GET /core/workspaces/:wsId/search?q=&surfaces=&limit=
//     → { q, count, results: [{ ref, title, snippet, surface }] }
//
// An ENTITY REF is one string that addresses anything in a workspace:
// `ref:<type>:<id>` where type ∈ record | doc | mail | ticket | file | event |
// channel | canvas. A record id is `<collectionKey>/<recordId>`, a mail id is
// `<threadId>` or `<threadId>#<messageId>`, a canvas id is
// `<projectId>/<boardPageId>`. The parser/formatter live in
// `workspace/packages/shared/functions/entityRef.js` client-side and
// `server/src/core/utils/entityRef.js` server-side — this service just carries
// the string.
//
// Every route is MEMBER-gated server-side and re-applies each surface's OWN
// fence (per-collection record grants, mail ACL, private-event and
// private-channel rules, Files private scope). A ref is an address, never an
// authorization: holding one grants nothing.
//
// The active workspace is attached automatically unless the caller names one —
// same defaulter FleetService/TicketService use.
export class RefsService extends BaseService {
  /**
   * Active-workspace scope: live SDK context first, then the persisted
   * `activeWorkspace` storage key.
   * @returns {string|null|undefined}
   */
  _workspaceScope (explicit) {
    return this._resolveWorkspaceId(explicit, { fallbackToStorage: true })
  }

  _requireWorkspace (methodName, explicit) {
    const wid = this._workspaceScope(explicit)
    if (!wid) throw new Error(`${methodName} requires a workspaceId`)
    return String(wid)
  }

  /**
   * Resolve one ref to the entity's content.
   *
   * @param {{ ref: string, workspaceId?: string }} args
   * @returns {Promise<{ ref: string, type: string, id: string, title: string|null, content: object }>}
   */
  resolve ({ ref, workspaceId } = {}) {
    if (!ref) throw new Error('refs.resolve requires a ref')
    const wid = this._requireWorkspace('refs.resolve', workspaceId)
    // The drift analyzer reads the LITERAL template string at this call site —
    // never hoist this into a `const url`, or the route becomes invisible to
    // `bun run check-drift`.
    return this._call(
      'refs.resolve',
      `/workspaces/${encodeURIComponent(wid)}/refs/resolve?ref=${encodeURIComponent(ref)}`
    )
  }

  /**
   * The neighbours of one ref — records' `data.links`, mail thread structure,
   * ticket/doc/event cross-references, and platform attachments.
   *
   * @param {{ ref: string, depth?: number, workspaceId?: string }} args
   * @returns {Promise<{ ref: string, depth: number, neighbors: Array<object> }>}
   */
  relations ({ ref, depth = 1, workspaceId } = {}) {
    if (!ref) throw new Error('refs.relations requires a ref')
    const wid = this._requireWorkspace('refs.relations', workspaceId)
    const d = Number(depth) > 1 ? 2 : 1
    return this._call(
      'refs.relations',
      `/workspaces/${encodeURIComponent(wid)}/refs/relations?ref=${encodeURIComponent(ref)}&depth=${d}`
    )
  }

  /**
   * Search every workspace surface at once; every hit carries a `ref` that
   * `resolve` can open.
   *
   * @param {{ query?: string, q?: string, surfaces?: string[], limit?: number,
   *           workspaceId?: string }} args
   * @returns {Promise<{ q: string, count: number, results: Array<{ref,title,snippet,surface}> }>}
   */
  searchWorkspace ({ query, q, surfaces, limit, workspaceId } = {}) {
    const term = String(query ?? q ?? '').trim()
    const wid = this._requireWorkspace('refs.searchWorkspace', workspaceId)
    const params = new URLSearchParams({ q: term })
    if (Array.isArray(surfaces) && surfaces.length) {
      params.set('surfaces', surfaces.join(','))
    }
    if (Number.isFinite(Number(limit))) params.set('limit', String(Math.trunc(Number(limit))))
    return this._call(
      'refs.searchWorkspace',
      `/workspaces/${encodeURIComponent(wid)}/search?${params.toString()}`
    )
  }
}

export const createRefsService = (config) => new RefsService(config)

export default RefsService
