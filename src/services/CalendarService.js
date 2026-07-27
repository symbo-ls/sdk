import { BaseService } from './BaseService.js'

// CalendarService — wraps the core server's /core/calendar surface on the main
// API server. Mongo-backed: CALENDAR_STORE has defaulted to 'mongo' since the
// 2026-07-03 cutover (supabase/dual remain as rollback values).
//
// Routes (all authenticated):
//   GET    /core/calendar/events            → list within a window (any member tier)
//   GET    /core/calendar/events/:id        → get one (any member tier)
//   POST   /core/calendar/events            → create (owner/admin — spec §7)
//   PATCH  /core/calendar/events/:id        → update (owner/admin)
//   DELETE /core/calendar/events/:id        → soft delete (owner/admin)
//   POST   /core/calendar/sync              → external (Google) sync pass (owner/admin)
//   GET    /core/calendar/sync              → sync cursor status (any member tier)
//
// The owner/admin WRITE gate is enforced server-side via requireOrgRole; write
// callers MUST pass `organization` so the gate can resolve the caller's role.
//
// NOTE: the existing frontend calendar app reads/writes through the
// workspace-project worker entity `workspaceProject.calendar` (EntityDispatcher
// → worker surfaces/calendar.js), which is ALSO store-aware behind the same
// CALENDAR_STORE flag. This service is the direct /core surface (mirrors
// MeetService for /core/meet) for callers that want a flat SDK method.

export class CalendarService extends BaseService {
  /**
   * List calendar events within a UTC window, scoped to the active workspace
   * (or the explicit `workspaceId`) and the per-viewer cal_read visibility.
   *
   * @param {object} args
   * @param {string} [args.workspaceId]      - defaults to the caller's active workspace
   * @param {object} [args.window]           - { gte, lte } ISO start_at bounds
   * @param {boolean} [args.includeDeleted]  - include soft-deleted rows (default false)
   * @param {number} [args.limit]            - max rows (default 5000)
   * @returns {Promise<object[]>} wire-shaped calendar_events rows
   */
  calendarListEvents({ workspaceId, window, includeDeleted, limit } = {}) {
    const body = {}
    if (workspaceId) body.workspaceId = workspaceId
    if (window && (window.gte || window.lte)) body.start_at = window
    if (includeDeleted) body.includeDeleted = true
    if (limit != null) body.limit = limit
    return this._call('calendarListEvents', '/calendar/events', {
      method: 'POST',
      body
    })
  }

  /**
   * Get a single event by id, scoped to the workspace.
   *
   * @param {object} args
   * @param {string|number} args.id
   * @param {string} [args.workspaceId]
   * @returns {Promise<object>} wire-shaped calendar_events row
   */
  calendarGetEvent({ id, workspaceId } = {}) {
    if (id == null) throw new Error('id is required')
    const qs = workspaceId
      ? `?workspaceId=${encodeURIComponent(workspaceId)}`
      : ''
    return this._call(
      'calendarGetEvent',
      `/calendar/events/${encodeURIComponent(id)}${qs}`,
      {
        method: 'GET'
      }
    )
  }

  /**
   * Create an event. Owner/admin only (server gate) — pass `organization`.
   *
   * @param {object} args
   * @param {object} args.payload         - wire-shaped event columns (title, date, …)
   * @param {string} args.organization    - org id (required for the owner/admin gate)
   * @param {string} [args.workspaceId]
   * @returns {Promise<object[]>} the created row(s)
   */
  calendarCreateEvent({ payload, organization, workspaceId } = {}) {
    if (!payload || typeof payload !== 'object')
      throw new Error('payload is required')
    if (!organization)
      throw new Error('organization is required (owner/admin write gate)')
    return this._call('calendarCreateEvent', '/calendar/events', {
      method: 'POST',
      body: { payload, organization, ...(workspaceId ? { workspaceId } : {}) }
    })
  }

  /**
   * Update an event by id. Owner/admin only — pass `organization`.
   *
   * @param {object} args
   * @param {string|number} args.id
   * @param {object} args.payload
   * @param {string} args.organization
   * @param {string} [args.workspaceId]
   * @returns {Promise<object[]>} the updated row(s)
   */
  calendarUpdateEvent({ id, payload, organization, workspaceId } = {}) {
    if (id == null) throw new Error('id is required')
    if (!payload || typeof payload !== 'object')
      throw new Error('payload is required')
    if (!organization)
      throw new Error('organization is required (owner/admin write gate)')
    return this._call(
      'calendarUpdateEvent',
      `/calendar/events/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: { payload, organization, ...(workspaceId ? { workspaceId } : {}) }
      }
    )
  }

  /**
   * Soft-delete an event by id. Owner/admin only — pass `organization`.
   *
   * @param {object} args
   * @param {string|number} args.id
   * @param {string} args.organization
   * @param {string} [args.workspaceId]
   * @returns {Promise<object[]>}
   */
  calendarDeleteEvent({ id, organization, workspaceId } = {}) {
    if (id == null) throw new Error('id is required')
    if (!organization)
      throw new Error('organization is required (owner/admin write gate)')
    return this._call(
      'calendarDeleteEvent',
      `/calendar/events/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        body: { organization, ...(workspaceId ? { workspaceId } : {}) }
      }
    )
  }

  /**
   * Trigger an external (Google) sync pass for the workspace.
   *
   * Replaces the `calendar-sync` Supabase edge function, which was deleted with
   * that plane — the frontend was still POSTing at it behind a `.catch(() => {})`,
   * so a resync silently did nothing. The server enqueues one job per live
   * cursor and returns immediately; poll `calendarSyncStatus` for progress.
   *
   * Owner/admin only (a sync writes events) — pass `organization` so the gate
   * can resolve the caller's role.
   *
   * @param {object} args
   * @param {string} args.organization
   * @param {string} [args.workspaceId] - defaults to the caller's active workspace
   * @returns {Promise<object>} { enqueued, cursors }
   */
  calendarSync({ organization, workspaceId } = {}) {
    if (!organization)
      throw new Error('organization is required (owner/admin write gate)')
    return this._call('calendarSync', '/calendar/sync', {
      method: 'POST',
      body: { organization, ...(workspaceId ? { workspaceId } : {}) }
    })
  }

  /**
   * Read external-sync cursor status (last sync time, per-cursor state).
   * Readable by any member tier.
   *
   * `organization` goes in the QUERY, not a body: this is a GET, and
   * requireOrgRole resolves the org from `params.orgId || body.organization ||
   * body.orgId || query.orgId` — so a body-only org would 400 here.
   *
   * @param {object} args
   * @param {string} args.organization
   * @param {string} [args.workspaceId]
   * @returns {Promise<object>}
   */
  calendarSyncStatus({ organization, workspaceId } = {}) {
    if (!organization) throw new Error('organization is required')
    const params = new URLSearchParams({ orgId: organization })
    if (workspaceId) params.set('workspaceId', workspaceId)
    return this._call(
      'calendarSyncStatus',
      `/calendar/sync?${params.toString()}`,
      { method: 'GET' }
    )
  }
}
