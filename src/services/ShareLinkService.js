import { BaseService } from './BaseService.js'

// ShareLinkService — public, revocable share links for ONE file or ONE note
// (PUBLIC-SHARE-LINKS-1). Wraps two SERVER planes that only look like one:
//
//   OWNER  — `/core/share-links/*`, authenticated. Mint a link, list the
//            links a resource already has out, revoke one.
//   PUBLIC — `/core/share/:token`, UNAUTHENTICATED. The recipient's read.
//            Registered in BaseService._requiresInit's no-auth set alongside
//            the storefront/meet-guest flows: a recipient has no account, and
//            attaching the SHARER's bearer token to a recipient read would
//            make the viewer appear to work while the link is broken.
//
// ⚠️ THE TOKEN COMES BACK EXACTLY ONCE
// `create` is the only call that ever returns the raw token — the server
// stores only its sha256. If the caller loses it, the link is unrecoverable
// (mint a new one and revoke the old). Do not log it, and do not stash it in
// any state the app persists.
//
// ⚠️ THE APP OWNS THE ORIGIN
// The server returns a PATH (`/s/<token>`), never an absolute URL: the
// origin belongs to whichever app renders the viewer, and baking one into
// the API would hardcode a deployment identity. `shareUrl()` composes the
// absolute link from an origin the CALLER supplies.
//
// Defaults that are product decisions, not implementation details (answered
// by Nika 2026-08-20): a link resolves the LIVE document, and it expires
// after 30 DAYS unless the caller explicitly asks for never. `expiresInDays`
// is therefore TRI-STATE on the wire — omitted means "server default",
// `null` means never — so this service must not coalesce the two.

export const SHARE_DEFAULT_EXPIRY_DAYS = 30

export class ShareLinkService extends BaseService {
  /**
   * Mint a share link. Returns the row PLUS `token` and `path` — the only
   * time the raw token is ever available.
   *
   * @param {Object} args
   * @param {'file'|'note'} args.targetType
   * @param {string} args.targetId
   * @param {number|null} [args.expiresInDays] omit for the 30-day default,
   *        pass `null` for a link that never expires
   */
  createShareLink ({ targetType, targetId, expiresInDays } = {}) {
    if (!targetType) throw new Error('targetType is required')
    if (!targetId) throw new Error('targetId is required')
    const body = { targetType, targetId }
    // Only forward the key when the caller actually named it — sending
    // `expiresInDays: undefined` would be indistinguishable from `null`
    // after JSON serialization and would silently turn the safe 30-day
    // default into a link that never expires.
    if (expiresInDays !== undefined) body.expiresInDays = expiresInDays
    return this._call('createShareLink', '/share-links', { method: 'POST', body })
  }

  /**
   * The links a resource currently has out, newest first. Each row carries
   * `live` (neither revoked nor expired), `expiresAt`, `accessCount` and
   * `lastAccessedAt` — enough for an owner to judge a revoke. The token is
   * NOT in this payload and cannot be recovered from it.
   */
  listShareLinks ({ targetType, targetId } = {}) {
    if (!targetType) throw new Error('targetType is required')
    if (!targetId) throw new Error('targetId is required')
    const qs = new URLSearchParams({ targetType, targetId }).toString()
    return this._call('listShareLinks', `/share-links?${qs}`)
  }

  /**
   * Revoke one link. Takes effect on the recipient's very next request —
   * the row is re-read on every public fetch. The row is kept (not deleted):
   * it is the record that this share happened and was recalled.
   */
  revokeShareLink (id) {
    if (!id) throw new Error('id is required')
    return this._call('revokeShareLink', `/share-links/${encodeURIComponent(id)}/revoke`, {
      method: 'POST'
    })
  }

  /**
   * PUBLIC — the recipient's read. No bearer token is attached.
   * Returns `{ targetType, expiresAt, … }` plus `title`+`body` for a note,
   * or `name`+`mimeType`+`size` for a file. A missing, revoked or expired
   * link answers 404 — deliberately indistinguishable from a token that
   * never existed, so callers must not try to tell those cases apart.
   */
  getSharedResource (token) {
    if (!token) throw new Error('token is required')
    return this._call('getSharedResource', `/share/${encodeURIComponent(token)}`)
  }

  /**
   * PUBLIC — the absolute URL of a shared FILE's bytes, proxied through the
   * API (never a storage URL). Suitable as an `href` or an `<img>` src.
   * A note has no byte stream.
   */
  getSharedResourceContentUrl (token) {
    if (!token) throw new Error('token is required')
    return `${this._apiUrl}/core/share/${encodeURIComponent(token)}/content`
  }

  /**
   * Compose the absolute link a person pastes into a message, from the
   * server-returned `path` and an origin the CALLER owns (in a browser:
   * `window.location.origin`). Kept here so every surface builds the same
   * URL instead of each concatenating its own.
   */
  shareUrl (pathOrToken, origin) {
    if (!pathOrToken) throw new Error('path or token is required')
    const path = String(pathOrToken).startsWith('/s/')
      ? String(pathOrToken)
      : `/s/${pathOrToken}`
    if (!origin) return path
    return `${String(origin).replace(/\/+$/, '')}${path}`
  }
}

export const createShareLinkService = config => new ShareLinkService(config)
