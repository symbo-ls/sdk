import { BaseService } from './BaseService.js'

// MailService wraps the main server's /core/mail/* routes — the built-in mail
// client (architecture/MAIL.md §5.2). It wraps ONLY the routes that are
// registered today (server/src/domains/mail/routes/mail.js):
//
//   GET    /mail/setup                        → getSetup           member · the §3.2a setup-gate contract
//   POST   /mail/setup/notify-admin           → setupNotifyAdmin   member · one Notification per org admin, 1/viewer/day → 429
//   POST   /mail/setup/link                   → setupLink          member · directory match on the org's tenant → a tenant mailbox
//   GET    /mail/accounts                     → listAccounts       member · ACL read, never tokens
//   POST   /mail/accounts/connect/:provider   → startConnect       member + policy · { authorizeUrl } for a personal OAuth
//   GET    /mail/accounts/:id                 → getAccount         ACL read
//   PATCH  /mail/accounts/:id                 → updateAccount      ACL write · displayName / signature / defaultSendAs / settings only
//   DELETE /mail/accounts/:id                 → disconnectAccount  ACL manage · tombstone (status 'disabled'), never a hard delete
//   POST   /mail/accounts/:id/reconnect       → reconnect          ACL manage · a fresh authorize URL bound to the row
//   POST   /mail/accounts/:id/sync            → syncNow            ACL read · 202, a delta pass now
//   GET    /mail/admin/accounts               → adminListAccounts  mail admin · health rows, no content
//   DELETE /mail/admin/accounts/:id           → adminDisconnect    mail admin · audited mail.account.force_disconnect
//   GET    /mail/admin/audit                  → adminAudit         mail admin · last 50 `mail.*` AdminActionLog rows
//
// NOT a method: GET /mail/oauth/callback/:provider. It is the browser's
// return leg from Google (public, state-JWT-guarded, answers a 302 to
// <shell>/mail?connected=<id> or ?mailError=<code>) — the shell opens the
// `authorizeUrl` from startConnect/reconnect and reads those params back.
//
// Gates. Member routes run requireAuth → attachUser → requireWorkspaceMember
// → requireMailWorkspaceInOrg (the org is derived FROM the workspace, never
// from a client-supplied orgId); admin routes add requireMailAdmin (org
// owner/co-owner/admin, or a role carrying `mail.admin`). A row the viewer
// cannot reach answers 404 — never 403 — so account ids cannot be probed
// (§5.11): treat a 404 from get/update/remove as "not visible to you", not
// as proof the row is gone.
//
// NOT here, on purpose: threads, message bodies, attachments, drafts, send,
// outbox, search, the SSE stream, the tenant surface and the provider
// webhooks. Those routes are not registered yet; each lands with its own
// server ticket and gains its SDK method there (MAIL-SERVER-SYNC-ENGINE-1 /
// the send + body tickets / the tenant ticket). A method here for a route
// that does not exist would answer 404 and read as a server fault.
//
// Workspace-scoped server-side (active-workspace claim fallback); an explicit
// `workspaceId` is threaded as a query param — a ROUTING param, never a body
// field — exactly like BookingService / PartyService.

// The helper is named `qs`, not `_qs`, on purpose. The route-drift analyzer
// (server/scripts/check-sdk-route-drift.mjs) drops a template hole whose text
// names a query builder (/\bqs\b/), so every path below normalizes to its
// exact server route. `_qs` has no word boundary before "qs", so the hole
// would survive as a `:id` path segment and each of these ten routes would
// report as drift on BOTH sides (server-only + client-only).
const qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class MailService extends BaseService {
  // GET /core/mail/setup — the compose setup gate (§3.2a). Answers
  // { state, policy, viewerIsAdmin, accounts: [{ id, address, kind, status,
  // canSend }], providers: [{ kind, integrationKind, label, connectable,
  // adminConnected, catalogued, steps }], workspace: { id, displayName } }.
  // `state` is one of off · ready · reauth · link · connect · ask-admin.
  // `providers[].steps` carries the org-specific tenant facts and is served
  // ONLY when viewerIsAdmin — for a member it is an empty array, which is
  // normal and never an error.
  getSetup ({ workspaceId } = {}) {
    return this._call('mail.getSetup', `/mail/setup${qs(workspaceId)}`)
  }

  // POST /core/mail/setup/notify-admin — one Notification per org admin, no
  // body. Rate-limited to one per viewer per day: a second call inside the
  // window throws with status 429 and a `retryAt` ISO stamp on the error
  // body. An admin asking to notify an admin gets 409 `viewer_is_admin`.
  // Answers { notified, recipients } on success.
  setupNotifyAdmin ({ workspaceId } = {}) {
    return this._call('mail.setupNotifyAdmin', `/mail/setup/notify-admin${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // POST /core/mail/setup/link — run the directory match for this viewer on
  // the org's connected tenant, no body. 200 { linked, created, account:
  // { id, address, kind: 'tenant', status, canSend } } · 404 no_tenant · 403
  // policy_forbids_link · 409 directory_mismatch (the error body carries
  // `expectedAddress`, the address the directory holds for the viewer's
  // local part on the tenant domain, or null) · 501 provider_not_available
  // (a Microsoft-only tenant until the Microsoft lane lands). Callers must
  // handle the throw, not assume a 200.
  setupLink ({ workspaceId } = {}) {
    return this._call('mail.setupLink', `/mail/setup/link${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // GET /core/mail/accounts — the accounts this viewer may read, each with
  // its folders, unread count, sync status and the viewer's access flags.
  // Never tokens.
  listAccounts (filter = {}, options = {}) {
    const ws = filter.workspaceId || options.workspaceId
    return this._call('mail.listAccounts', `/mail/accounts${qs(ws)}`)
  }

  // POST /core/mail/accounts/connect/:provider — start a personal OAuth
  // connection (policy-gated: allowPersonal + allowedDomains for the
  // viewer's address). Answers { provider, authorizeUrl, expiresIn: 600,
  // accountId: null }; the shell opens `authorizeUrl` (popup, fallback same
  // tab) and the callback redirects back to /mail?connected=<id>. 400
  // unknown_provider · 403 personal_not_allowed (+ `reason`) · 403
  // mail_disabled · 501 provider_not_available (microsoft, until its lane
  // lands) · 503 provider_not_configured (no Google OAuth client on the
  // platform).
  startConnect (provider, { workspaceId } = {}) {
    return this._call('mail.startConnect', `/mail/accounts/connect/${encodeURIComponent(provider)}${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // GET /core/mail/accounts/:id (ACL read; 404 when not visible).
  getAccount (id, { workspaceId } = {}) {
    return this._call('mail.getAccount', `/mail/accounts/${encodeURIComponent(id)}${qs(workspaceId)}`)
  }

  // PATCH /core/mail/accounts/:id (ACL write). The server allowlist is
  // displayName / signature { html, text } / defaultSendAs (must be one of
  // the account's send-as addresses) / settings — any other key is refused
  // with 400.
  updateAccount (id, payload = {}, { workspaceId } = {}) {
    return this._call('mail.updateAccount', `/mail/accounts/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/mail/accounts/:id (ACL manage) — the DISCONNECT: the row is
  // tombstoned (status 'disabled'), never hard-deleted, and the act is
  // audited when the caller is not the owner. Provider token revoke, watch
  // stop and the metadata purge ship with MAIL-SERVER-SYNC-ENGINE-1.
  disconnectAccount (id, { workspaceId } = {}) {
    return this._call('mail.disconnectAccount', `/mail/accounts/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // POST /core/mail/accounts/:id/reconnect (ACL manage, personal rows only)
  // — a fresh authorize URL whose state is bound to the row; the callback
  // then requires the SAME address (address_mismatch otherwise). Answers the
  // startConnect shape with `accountId` set. 404 when not visible · 409
  // not_reconnectable for tenant/shared rows (the org admin re-authorises
  // those).
  reconnect (id, { workspaceId } = {}) {
    return this._call('mail.reconnect', `/mail/accounts/${encodeURIComponent(id)}/reconnect${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // POST /core/mail/accounts/:id/sync (ACL read — owner or grantee) — ask
  // for a delta pass now. Always 202: { accountId, enqueued: true, jobId }
  // or { accountId, enqueued: false, pending: 'sync_engine_pending', owner }
  // while the sync engine's queue is not registered yet. 404 when not
  // visible · 409 account_disabled.
  syncNow (id, { workspaceId } = {}) {
    return this._call('mail.syncNow', `/mail/accounts/${encodeURIComponent(id)}/sync${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // GET /core/mail/admin/accounts (mail admin) — the health table for this
  // workspace: address, kind, provider, status, auth mode, last auth error,
  // sync state, grant count. Never content, never tokens.
  adminListAccounts (filter = {}, options = {}) {
    const ws = filter.workspaceId || options.workspaceId
    return this._call('mail.adminListAccounts', `/mail/admin/accounts${qs(ws)}`)
  }

  // DELETE /core/mail/admin/accounts/:id (mail admin) — force disconnect.
  // Same tombstone as disconnectAccount, always audited as
  // mail.account.force_disconnect with surface 'admin'.
  adminDisconnect (id, { workspaceId } = {}) {
    return this._call('mail.adminDisconnect', `/mail/admin/accounts/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // GET /core/mail/admin/audit?limit= (mail admin) — the newest `mail.*`
  // AdminActionLog rows for the org that owns this workspace. `limit`
  // defaults to 50 and the server clamps it to 1..200. It is read from
  // EITHER bag: the dispatcher's flat-args contract treats `limit` as a
  // pagination option and hoists it out of the filter into the options
  // positional, so a filter-only read would silently drop it.
  adminAudit (filter = {}, options = {}) {
    const extra = {}
    const limit = filter.limit ?? options.limit
    if (limit !== undefined) extra.limit = limit
    const ws = filter.workspaceId || options.workspaceId
    return this._call('mail.adminAudit', `/mail/admin/audit${qs(ws, extra)}`)
  }
}

export const createMailService = config => new MailService(config)
