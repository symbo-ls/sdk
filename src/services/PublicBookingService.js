import { BaseService } from './BaseService.js'

// PublicBookingService (service name `publicBookings`) wraps the main
// server's ANONYMOUS public booking intake (SITES-4):
//   GET  /core/bookings/public/services?workspace=<_id | ws_ key>
//   POST /core/bookings/public/request
//
// A workspace opts in through `settings.publicBookings` (owner/admin, through
// WorkspaceService.updateWorkspaceSettings — or the workspace AI's
// setup_public_booking tool): which booking kinds and meeting modes a public
// page may ask for, and which site hosts may send (`origins`). A visitor of
// such a site — signed out — lists the workspace's services and files a
// booking REQUEST (status 'requested'; a member confirms it later). The
// request lands as a Booking in Scheduling and a lead in the CRM.
//
// `workspace` is the workspace's `ws_` key (or its Mongo `_id`) — never a
// slug: slugs repeat across organizations and the server refuses them.
//
// Both methods are in BaseService._requiresInit's no-init set: a published
// site's visitor has no account, and a member who opens the site in a
// signed-in browser is still an anonymous visitor here — attaching that
// session's bearer token would make the page behave differently for the one
// browser that happens to be logged in.
//
// Refusals arrive as `{ error: '<code>' }`; `_request` throws them as
// `Error(<code>)` with `.status` and the body as `.cause`, so a site's form
// shows one message per code: 400 name_required, contact_required,
// email_invalid, phone_invalid, kind_invalid, start_invalid, mode_invalid,
// service_invalid, captcha_failed; 403 origin_forbidden; 404 not_found
// (unknown, inactive or not opted in — one answer, no enumeration); 503
// services_unavailable, captcha_unavailable, booking_unavailable; 429 from
// the server's rate limiter.
//
// `requestPublicBooking` is a POST that files a booking: it is NOT in
// BaseService's RETRY_SAFE_METHOD_NAMES and must never be — a resend after a
// network failure could file a second booking.

const _enc = encodeURIComponent

const _needWorkspace = (workspace) => {
  if (workspace === undefined || workspace === null) throw new Error('workspace is required')
  if (typeof workspace !== 'string') {
    throw new Error('workspace must be a string (the ws_ key or the _id)')
  }
  if (!workspace.trim()) throw new Error('workspace is required')
}

export class PublicBookingService extends BaseService {
  // GET /core/bookings/public/services?workspace=<_id | ws_ key>
  // The services a public page of the workspace may offer (Scheduling's
  // booking_services rows of the workspace's public kinds).
  // Resolves { services: [{ id, name, kind, durationMinutes, price, currency }] }
  // — `price` and `currency` are both null for a service without a price.
  listPublicBookingServices (workspace) {
    _needWorkspace(workspace)
    return this._call(
      'listPublicBookingServices',
      `/bookings/public/services?workspace=${_enc(workspace)}`
    )
  }

  // POST /core/bookings/public/request
  // `payload` is the request body, sent exactly as the caller built it (the
  // server validates every field and drops what it does not know):
  //   workspace (required) · name (required) · email and/or phone, or one
  //   `contact` · kind (when no service) · service (a booking_services id) ·
  //   mode ('office' | 'online') · startAt (ISO / epoch ms) or window
  //   ('morning' | 'afternoon' | 'evening') · message · unit · context
  //   ({ page, lang, from, site, intent, utm }) · website (the honeypot — a
  //   field humans leave empty) · captchaToken (when the workspace asks).
  // Resolves { number, meeting? } — `number` is the BKG- number (null when
  // the honeypot was filled: nothing was stored); `meeting` is
  // { kind: 'office', label } | { kind: 'online', url } | { kind: 'online', error }.
  requestPublicBooking (payload = {}) {
    _needWorkspace(payload?.workspace)
    return this._call('requestPublicBooking', '/bookings/public/request', {
      method: 'POST',
      body: payload
    })
  }
}

export const createPublicBookingService = config => new PublicBookingService(config)
