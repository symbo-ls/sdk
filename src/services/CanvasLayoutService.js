import { BaseService } from './BaseService.js'
import { io as socketIoClient } from 'socket.io-client'
import { logger } from '../utils/logger.js'

// CanvasLayoutService wraps /workspaces/:wsId/canvas-layout on the main server
// (Mongo-backed). Peer service to AnalyzedService, TicketService, DocService.
//
// Routes:
//   GET  /workspaces/:wsId/canvas-layout
//     → { positions, groups, version, updatedAt }
//   PATCH /workspaces/:wsId/canvas-layout
//     body: { positions?, groups?, expectedVersion? }
//     → { version, updatedAt }   409 on version mismatch
//
// Socket: 'canvas-layout-changed' on the workspace channel after a successful
// PATCH. subscribeWorkspaceCanvasLayout wraps the socket.io user-channel
// transport (same socket path as subscribeUserEvents) and fans the event
// through to the caller's handler, with auto-reconnect.

export class CanvasLayoutService extends BaseService {
  /**
   * Fetch the current canvas layout for a workspace.
   *
   * @param {string} workspaceId
   * @returns {Promise<{ positions: Record<string, {x: number, y: number, w?: number, h?: number}>, groups: Record<string, {key: string, name?: string}>, version: number, updatedAt: string }>}
   */
  getCanvasLayout (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'canvasLayout.get',
      `/workspaces/${encodeURIComponent(workspaceId)}/canvas-layout`
    )
  }

  /**
   * Optimistically patch the canvas layout for a workspace.
   *
   * Supply `expectedVersion` for optimistic-concurrency control — the server
   * returns HTTP 409 when the stored version does not match (concurrent edit).
   *
   * @param {string} workspaceId
   * @param {{ positions?: Record<string, {x: number, y: number}>, groups?: Record<string, {key: string|null, name?: string|null}>, expectedVersion?: number }} partial
   * @returns {Promise<{ version: number, updatedAt: string }>}
   */
  patchCanvasLayout (workspaceId, partial = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'canvasLayout.patch',
      `/workspaces/${encodeURIComponent(workspaceId)}/canvas-layout`,
      { method: 'PATCH', body: partial }
    )
  }

  /**
   * Subscribe to workspace-level canvas layout changes broadcast by the server
   * after a successful PATCH.
   *
   * Mirrors the subscribeUserEvents pattern in AuthService: opens a socket.io
   * connection to the server's `/user-socket` namespace and fans
   * `canvas-layout-changed` events (scoped to the given workspaceId) through
   * to `handler`. Auto-reconnects with exponential back-off.
   *
   * Returns an unsubscribe function that closes the socket and stops delivery.
   *
   * Fail-soft: if the token or baseUrl is missing the function still returns a
   * no-op unsubscribe so call sites don't need guard clauses.
   *
   * @param {string} workspaceId
   * @param {(payload: { positions: Record<string, object>, groups: Record<string, object>, version: number }) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribeWorkspaceCanvasLayout (workspaceId, handler) {
    if (!workspaceId || typeof handler !== 'function') return () => {}
    if (!this._tokenManager) return () => {}
    const token = this._tokenManager.getAccessToken?.()
    if (!token) return () => {}
    const baseUrl = this._apiUrl
    if (!baseUrl) return () => {}

    let socket
    try {
      socket = socketIoClient(baseUrl, {
        path: '/user-socket',
        transports: ['websocket', 'polling'],
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000
      })
    } catch (err) {
      logger.warn('[sdk.subscribeWorkspaceCanvasLayout] socket init failed:', err?.message || err)
      return () => {}
    }

    let _loggedAuthFail = false
    socket.on('connect_error', (err) => {
      if (err?.message && !_loggedAuthFail) {
        _loggedAuthFail = true
        logger.warn('[sdk.subscribeWorkspaceCanvasLayout] connect_error:', err.message)
      }
    })

    // The server broadcasts 'canvas-layout-changed' with
    // { workspaceId, positions, groups, version }.
    // We only forward events that match the requested workspaceId.
    socket.on('canvas-layout-changed', (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== workspaceId) return
      try {
        handler({
          positions: payload?.positions ?? {},
          groups: payload?.groups ?? {},
          version: payload?.version
        })
      } catch (err) {
        logger.warn('[sdk.subscribeWorkspaceCanvasLayout] handler threw:', err?.message || err)
      }
    })

    return () => {
      try { socket.removeAllListeners() } catch (_) {}
      try { socket.disconnect() } catch (_) {}
    }
  }

  /**
   * Live /files desktop sync. Same socket transport/lifecycle as
   * subscribeWorkspaceCanvasLayout, but fans `file-canvas-changed` events —
   * broadcast by the server after every successful file_canvas mutation
   * through the /sb proxy (the table's single write path).
   *
   * Handler receives { type: 'INSERT'|'UPDATE'|'DELETE', rows, ids, patch }:
   * `rows` are full PostgREST rows when the response carried a
   * representation; otherwise `ids` (+ `patch` for UPDATEs) lets the client
   * merge without a refetch.
   *
   * @param {string} workspaceId
   * @param {(payload: { type: string, rows: object[], ids: string[], patch: object|null }) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribeWorkspaceFileCanvas (workspaceId, handler) {
    if (!workspaceId || typeof handler !== 'function') return () => {}
    if (!this._tokenManager) return () => {}
    const token = this._tokenManager.getAccessToken?.()
    if (!token) return () => {}
    const baseUrl = this._apiUrl
    if (!baseUrl) return () => {}

    let socket
    try {
      socket = socketIoClient(baseUrl, {
        path: '/user-socket',
        transports: ['websocket', 'polling'],
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000
      })
    } catch (err) {
      logger.warn('[sdk.subscribeWorkspaceFileCanvas] socket init failed:', err?.message || err)
      return () => {}
    }

    let _loggedAuthFail = false
    socket.on('connect_error', (err) => {
      if (err?.message && !_loggedAuthFail) {
        _loggedAuthFail = true
        logger.warn('[sdk.subscribeWorkspaceFileCanvas] connect_error:', err.message)
      }
    })

    socket.on('file-canvas-changed', (payload) => {
      if (payload?.workspaceId && payload.workspaceId !== workspaceId) return
      try {
        handler({
          type: payload?.type || 'UPDATE',
          rows: Array.isArray(payload?.rows) ? payload.rows : [],
          ids: Array.isArray(payload?.ids) ? payload.ids : [],
          patch: payload?.patch || null
        })
      } catch (err) {
        logger.warn('[sdk.subscribeWorkspaceFileCanvas] handler threw:', err?.message || err)
      }
    })

    return () => {
      try { socket.removeAllListeners() } catch (_) {}
      try { socket.disconnect() } catch (_) {}
    }
  }
}
