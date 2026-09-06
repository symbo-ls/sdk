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
// Read path (MAIL-SERVER-THREAD-READ-ROUTES-1, §5.2 threads · §5.6 bodies):
//   GET    /mail/threads                      → listThreads        member · readable accounts only; accountId|all, folder, label, unread, starred, attachments, from, q, cursor, limit≤100 → { rows, cursor, exhausted, limit }
//   GET    /mail/threads/:id                  → getThread          ACL read · { thread, messages[] } — each envelope carries bodyState
//   PATCH  /mail/threads/:id                  → updateThread       ACL write · read / starred / muted / snoozedUntil / folder / addLabels / removeLabels
//   POST   /mail/threads/batch                → batchThreads       ACL write on every id · { ids, ...the same flags }, all-or-nothing, ≤100 ids
//   GET    /mail/messages/:id/body            → getBody            ACL read · sanitised { html, text, blockedImages } (cache, fetch-on-miss)
//   GET    /mail/messages/:id/attachments/:aid → attachmentUrl     ACL read · { url, path, expiresAt, filename, mime, size, inline } — a 10-minute signed URL
//
// NOT a method: GET /mail/messages/:id/attachments/:aid/content?sig=. It is
// the BROWSER's leg (a download tab, an <img> inside the sandboxed body
// iframe) — public, verified by the purpose-bound token the member route
// minted; `attachmentUrl` answers the URL to open.
//
// Send path (MAIL-SERVER-SEND-OUTBOX-1, §5.7):
//   POST   /mail/drafts                       → createDraft        owner · account needs ACL write
//   PATCH  /mail/drafts/:id                   → updateDraft        owner · `attachments` = keep-list of storagePaths
//   DELETE /mail/drafts/:id                   → deleteDraft        owner · staged blobs dropped
//   POST   /mail/drafts/:id/attachments       → uploadDraftAttachment  owner · multipart, 25MB per file
//   POST   /mail/send                         → send               owner + send ACL · 202 outbox row
//   GET    /mail/outbox                       → listOutbox         owner · undo / scheduled / recent list
//   POST   /mail/outbox/:id/cancel            → cancelSend         owner · queued only; the draft is restored
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
// NOT here, on purpose: the provider-scope search (GET /search), thread
// links + rsvp, attachment save-to-Files, the image proxy, the tenant
// surface and the provider webhooks. Those routes are not registered yet;
// each lands with its own server ticket and gains its SDK method there. A
// method here for a route that does not exist would answer 404 and read as
// a server fault.
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

  // ── Read path (§5.2 threads) ──────────────────────────────────────────────

  // GET /core/mail/threads — one page of thread rows across the accounts the
  // viewer may read (or one account: `accountId`; 'all' and absent both mean
  // every readable one — an accountId the viewer cannot read is a 404, never
  // a 403). Filters: folder (inbox|sent|drafts|archive|spam|trash), label
  // (a provider label id), unread / starred / attachments / snoozed
  // (booleans), from (name or address, substring), q (local text search).
  // Paging: `cursor` from the previous answer + `limit` (default 50, server
  // clamps to 100). Answers { rows, cursor, exhausted, limit } — `cursor` is
  // null and `exhausted` true on the last page. `limit` and `cursor` are read
  // from EITHER bag: the dispatcher's flat-args contract hoists `limit` into
  // the options positional.
  listThreads (filter = {}, options = {}) {
    const extra = {}
    const keys = ['accountId', 'folder', 'label', 'unread', 'starred', 'attachments', 'snoozed', 'from', 'q', 'cursor', 'limit']
    for (const k of keys) {
      const v = filter[k] ?? options[k]
      if (v !== undefined && v !== null && v !== '') extra[k] = v
    }
    const ws = filter.workspaceId || options.workspaceId
    return this._call('mail.listThreads', `/mail/threads${qs(ws, extra)}`)
  }

  // GET /core/mail/threads/:id (ACL read; 404 when not visible) →
  // { thread, messages } — the envelopes oldest-first, each with `bodyState`
  // ('none' | 'cached' | 'stale') and `attachments[].id` (the provider
  // attachment id `attachmentUrl` takes).
  getThread (id, { workspaceId } = {}) {
    return this._call('mail.getThread', `/mail/threads/${encodeURIComponent(id)}${qs(workspaceId)}`)
  }

  // PATCH /core/mail/threads/:id (ACL write; 404 when not writable). Body
  // allowlist: read / starred / muted (booleans), snoozedUntil (ISO string
  // or null — local-only), folder ('inbox' | 'archive' | 'trash' | 'spam';
  // sent/drafts are never a move target → 400), addLabels / removeLabels
  // (provider label ids, ≤ 20). The server writes the local rows at once and
  // queues the provider modify; answers { thread, jobs }. A refusal (400 /
  // 404) leaves nothing written — roll the optimistic row back.
  updateThread (id, payload = {}, { workspaceId } = {}) {
    return this._call('mail.updateThread', `/mail/threads/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // POST /core/mail/threads/batch — { ids: [≤100], ...the same flags }.
  // All-or-nothing: one id the viewer cannot write is a 404 for the whole
  // batch and nothing changes. Answers { count, threads, jobs }.
  batchThreads (payload = {}, { workspaceId } = {}) {
    return this._call('mail.batchThreads', `/mail/threads/batch${qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // ── Read path (§5.6 bodies + attachments) ────────────────────────────────

  // GET /core/mail/messages/:id/body (ACL read) → { html, text,
  // blockedImages, bodyState, fetchedAt, expiresAt }. `html` is the
  // server-sanitised document (scripts/handlers gone, remote images swapped
  // into `data-mail-src` + counted in blockedImages, inline cid: images
  // already pointing at signed content URLs for THIS viewer). Render it in
  // the sandboxed iframe only; never sanitise client-side. 409
  // account_disabled / account_reauth_required · 429 provider_rate_limited
  // (+ retryAfterMs) · 502 provider_error when the provider fetch fails.
  getBody (id, { workspaceId } = {}) {
    return this._call('mail.getBody', `/mail/messages/${encodeURIComponent(id)}/body${qs(workspaceId)}`)
  }

  // GET /core/mail/messages/:id/attachments/:aid (ACL read) → { url, path,
  // expiresAt, filename, mime, size, inline }. `url` is what the browser
  // opens (window.open / an <a href>) — a signed, 10-minute, viewer-bound
  // URL onto the public content route; no header, no session token in it.
  // The server names its own `path`; this client re-bases it on the API
  // origin it actually reaches (a local proxy or tunnel differs from the
  // channel default the server assumes) and keeps the server's `url` as the
  // fallback when no base is configured. 404 for an unknown aid or a message
  // the viewer cannot read.
  async attachmentUrl (id, aid, { workspaceId } = {}) {
    const r = await this._call('mail.attachmentUrl', `/mail/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(aid)}${qs(workspaceId)}`)
    if (r && typeof r === 'object' && typeof r.path === 'string' && this._apiUrl) {
      return { ...r, url: `${this._apiUrl}${r.path}` }
    }
    return r
  }

  // POST /core/mail/drafts — composer autosave birth. Body allowlist:
  // account (required, needs ACL write on it — 404 when not writable) / to /
  // cc / bcc ([{ name?, email }]) / subject / html / text /
  // inReplyToMessage / thread. 201 with the serialized draft; `attachments`
  // enter only through uploadDraftAttachment (server-minted storagePaths).
  createDraft (payload = {}, { workspaceId } = {}) {
    return this._call('mail.createDraft', `/mail/drafts${qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/mail/drafts/:id (owner only — any other viewer's id answers
  // 404). Same field allowlist as create; an `attachments` array is the
  // KEEP-LIST: pass the storagePaths to keep, the dropped refs' staged
  // blobs are deleted.
  updateDraft (id, payload = {}, { workspaceId } = {}) {
    return this._call('mail.updateDraft', `/mail/drafts/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/mail/drafts/:id — drops the draft AND its staged blobs.
  deleteDraft (id, { workspaceId } = {}) {
    return this._call('mail.deleteDraft', `/mail/drafts/${encodeURIComponent(id)}${qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // POST /core/mail/drafts/:id/attachments — multipart staging into the
  // private mail-attachments bucket (25MB per file, 20 per draft). `file`
  // is a File/Blob; 201 with the updated draft. 413 file_too_large · 400
  // too_many_attachments.
  uploadDraftAttachment (id, file, { workspaceId, filename } = {}) {
    const formData = new FormData()
    if (filename) formData.append('file', file, filename)
    else formData.append('file', file)
    return this._call('mail.uploadDraftAttachment', `/mail/drafts/${encodeURIComponent(id)}/attachments${qs(workspaceId)}`, {
      method: 'POST',
      body: formData
    })
  }

  // POST /core/mail/send — { draftId, accountId?, sendAs?, scheduleAt?,
  // undoSeconds? } → 202 with the queued outbox row (`sendAt` = the
  // scheduled instant, or now + undoSeconds). The draft is CONSUMED (it
  // moves into the row's snapshot; cancel restores it). 400
  // no_recipients/too_many_recipients/invalid_send_as/schedule_in_past ·
  // 409 account_not_ready (+ accountStatus) · 413 message_too_large · 429
  // send_rate_limited.
  send (payload = {}, { workspaceId } = {}) {
    return this._call('mail.send', `/mail/send${qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // GET /core/mail/outbox?status=&limit= — this viewer's sends, newest
  // first: queued (undo-able / scheduled), sending, sent, failed,
  // cancelled. Rows carry the snapshot SUMMARY (subject, to, counts) —
  // never the body.
  listOutbox (filter = {}, options = {}) {
    const extra = {}
    const status = filter.status ?? options.status
    const limit = filter.limit ?? options.limit
    if (status !== undefined) extra.status = status
    if (limit !== undefined) extra.limit = limit
    const ws = filter.workspaceId || options.workspaceId
    return this._call('mail.listOutbox', `/mail/outbox${qs(ws, extra)}`)
  }

  // POST /core/mail/outbox/:id/cancel — the UNDO: only a still-queued row
  // cancels; the response carries { outbox, draft } with the restored
  // draft. 409 not_cancellable (+ rowStatus 'sending'|'sent'|…) once the
  // worker claimed it.
  cancelSend (id, { workspaceId } = {}) {
    return this._call('mail.cancelSend', `/mail/outbox/${encodeURIComponent(id)}/cancel${qs(workspaceId)}`, {
      method: 'POST'
    })
  }

  // GET /core/mail/stream — the mail realtime SSE stream (spec §5.9,
  // MAIL-SERVER-STREAM-RELAY-1). ONE multiplexed workspace-anchored
  // connection: `mail.snapshot { accounts, unread }` on open (accounts
  // exactly as listAccounts answers them, ACL-filtered server-side; unread
  // is [{ accountId, n }]), then ACL-masked live events with the
  // producer's REST-shaped row + { accountId, workspaceId } merged on top.
  // Auth rides `?access_token=` (EventSource cannot set headers);
  // `workspaceId` is threaded as a FLAT query param so the server's member
  // chain pins the stream to that workspace. Every event object passed to
  // `onEvent` carries `type` (the SSE event name) + the frame's data.
  // Returns unsubscribe() — call it to close the connection.
  subscribeStream ({ workspaceId } = {}, onEvent) {
    const names = [
      'mail.snapshot',
      'mail.thread.upsert',
      'mail.thread.delete',
      'mail.account.status',
      'mail.account.progress',
      'mail.outbox.sent',
      'mail.outbox.failed',
      'mail.unread'
    ]
    const filter = workspaceId ? { workspaceId: String(workspaceId) } : {}
    return this._sseSubscribe('/mail/stream', filter, onEvent, {
      flatParams: true,
      events: names.map(name => ({ name, frame: (data) => ({ type: name, ...data }) }))
    })
  }
}

export const createMailService = config => new MailService(config)
