import { BaseService } from './BaseService.js'

// ChannelService wraps the main server's /core/channels/* routes — CRM
// communications: WhatsApp (Meta WhatsApp Cloud API) and SMS + voice (a
// Georgian operator), each with a SIMULATED mode that runs the whole flow
// with no provider account.
//
//   accounts     a workspace's business numbers — connect (admin; a live
//                number's credentials go in once and never come back; a Meta
//                number answers its webhook `verifyToken` ONCE), edit, pause,
//                disconnect; WhatsApp templates (list; sync from Meta);
//                `simulate` feeds inbound traffic to a SIMULATED number through
//                the same pipeline a provider webhook uses.
//   inbox        every channel thread of the workspace, unread first
//                (rows + `pagination`).
//   timeline     the ONE timeline of a contact (`partyId`) or a lead / deal
//                (`regardingType` + `regardingId`) across WhatsApp, SMS and
//                calls (rows + `pagination.nextBefore`).
//   send         WhatsApp (session text inside the 24 h window, a template
//                outside it) or SMS, from a record or a thread (editor).
//   startCall    click-to-call — `channel`: 'phone' | 'whatsapp' (the
//                WhatsApp chat's own thread); `via`: 'provider' (the
//                provider rings a member leg first — the request's
//                memberPhone, else the member's own phone, else the
//                workspace GENERAL call number — then bridges the client) |
//                'device' (the member dials from their own device: the answer
//                carries `dial.href`, tel: or https://wa.me/…).
//                `logCallOutcome` writes the member's outcome + note onto the
//                call's CRM interaction; a DEVICE call's result (status +
//                durationSec) goes the same way.
//   settings     the workspace channels settings — today the general call
//                number (`callBridge`: configured, masked, number for an
//                editor+); `updateSettings({ callBridgeNumber })` (editor+).
//
// Errors: a refused call throws an Error with `status` (the HTTP status) and
// `cause` = the server body `{ error: <code>, message, … }` — e.g. 409
// `template_required` (+ `windowOpenUntil`), 429 `channel_rate_limited`
// (+ `retryAfterMs`), 400 `account_required` / `member_phone_required`.
// The messages of ONE thread: sdk.getService('conversations').listMessages(id).
//
// Workspace scope: `workspaceId` rides the query string (reads = member,
// outbound = editor, accounts = admin — enforced server-side).

// `qs` (a whole word) — the server route-drift analyzer drops `${qs(...)}`
// template holes, so every path below stays readable to it.
const qs = (params = {}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, Array.isArray(v) ? v.map(String).join(',') : v instanceof Date ? v.toISOString() : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

const INBOX_FILTERS = ['channel', 'status', 'assignee', 'unread', 'accountId']
const TIMELINE_FILTERS = ['partyId', 'regardingType', 'regardingId', 'channel', 'before']

const _rows = (response) => {
  const rows = Array.isArray(response?.data) ? response.data : []
  if (response?.pagination) rows.pagination = response.pagination
  return rows
}

export class ChannelService extends BaseService {
  // ── accounts ─────────────────────────────────────────────────────────

  // GET /core/channels/accounts — filter: { channel: 'whatsapp'|'sms'|'voice', status }.
  listAccounts (filter = {}, { workspaceId } = {}) {
    const { channel, status } = filter || {}
    return this._call(
      'channels.listAccounts',
      `/channels/accounts${qs({ channel, status, workspaceId: workspaceId || filter?.workspaceId })}`
    )
  }

  // GET /core/channels/accounts/:id
  getAccount (id, { workspaceId } = {}) {
    return this._call('channels.getAccount', `/channels/accounts/${encodeURIComponent(id)}${qs({ workspaceId })}`)
  }

  // POST /core/channels/accounts (admin) → { account, verifyToken? }.
  // payload: { provider: 'meta_cloud'|'ge_gateway', mode: 'live'|'simulated',
  // name, address, channels?, identity?: { phoneNumberId, wabaId, senderId },
  // credentials? (live only), defaults?: { owner, country }, templates?
  // (simulated only) }. Keep `verifyToken` — it is never shown again.
  createAccount (payload = {}, { workspaceId } = {}) {
    return this._call('channels.createAccount', `/channels/accounts${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/channels/accounts/:id (admin) — { name, status: 'active'|'paused',
  // channels, defaults, identity, credentials (live), templates (simulated) }.
  updateAccount (id, payload = {}, { workspaceId } = {}) {
    return this._call('channels.updateAccount', `/channels/accounts/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /core/channels/accounts/:id (admin) — disconnects; history is kept.
  disconnectAccount (id, { workspaceId } = {}) {
    return this._call('channels.disconnectAccount', `/channels/accounts/${encodeURIComponent(id)}${qs({ workspaceId })}`, {
      method: 'DELETE'
    })
  }

  // POST /core/channels/accounts/:id/verify-token (admin; live Meta number) → { verifyToken } once.
  rotateVerifyToken (id, { workspaceId } = {}) {
    return this._call(
      'channels.rotateVerifyToken',
      `/channels/accounts/${encodeURIComponent(id)}/verify-token${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // GET /core/channels/accounts/:id/templates → [{ name, language, category, status, body, params }].
  listTemplates (id, { workspaceId } = {}) {
    return this._call(
      'channels.listTemplates',
      `/channels/accounts/${encodeURIComponent(id)}/templates${qs({ workspaceId })}`
    )
  }

  // POST /core/channels/accounts/:id/templates/sync (admin; live Meta number).
  syncTemplates (id, { workspaceId } = {}) {
    return this._call(
      'channels.syncTemplates',
      `/channels/accounts/${encodeURIComponent(id)}/templates/sync${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // POST /core/channels/accounts/:id/simulate (admin; SIMULATED number) →
  // { results }. payload: one event or { events: [...] } —
  //   { type: 'message', from, name?, text, channel?, at?, providerId? }
  //   { type: 'call', from, name?, status, durationSec?, at?, providerId? }
  //   { type: 'status', providerId, status: 'delivered'|'read'|'failed', error? }
  simulate (accountId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'channels.simulate',
      `/channels/accounts/${encodeURIComponent(accountId)}/simulate${qs({ workspaceId })}`,
      { method: 'POST', body: payload }
    )
  }

  // ── workspace channels settings ──────────────────────────────────────

  // GET /core/channels/settings (member) → { callBridge: { configured,
  // masked, number (editor+ only, else null), updatedAt } }.
  getSettings ({ workspaceId } = {}) {
    return this._call('channels.getSettings', `/channels/settings${qs({ workspaceId })}`)
  }

  // PATCH /core/channels/settings (editor) — { callBridgeNumber: '+995…' | null }.
  // 400 invalid_phone for a number that is not a phone number.
  updateSettings (payload = {}, { workspaceId } = {}) {
    return this._call('channels.updateSettings', `/channels/settings${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // ── inbox + timeline ─────────────────────────────────────────────────

  // GET /core/channels/inbox → threads (unread first) with `pagination`.
  // filter: { channel: ['whatsapp','sms','phone'], status, assignee: 'me'|'none'|userId,
  // unread: true, accountId }; options: { limit, offset, workspaceId }.
  async inbox (filter = {}, options = {}) {
    const params = {}
    for (const k of INBOX_FILTERS) params[k] = filter?.[k]
    const response = await this._call(
      'channels.inbox',
      `/channels/inbox${qs({ ...params, limit: options.limit, offset: options.offset, workspaceId: options.workspaceId || filter?.workspaceId })}`,
      { raw: true }
    )
    return _rows(response)
  }

  // GET /core/channels/timeline → messages + calls, newest first, with
  // `pagination: { hasMore, nextBefore }`. filter: { partyId } or
  // { regardingType: 'lead'|'deal', regardingId }, plus { channel, before }.
  async timeline (filter = {}, options = {}) {
    const params = {}
    for (const k of TIMELINE_FILTERS) params[k] = filter?.[k]
    const response = await this._call(
      'channels.timeline',
      `/channels/timeline${qs({ ...params, limit: options.limit, workspaceId: options.workspaceId || filter?.workspaceId })}`,
      { raw: true }
    )
    return _rows(response)
  }

  // POST /core/channels/conversations/:id/read → the thread (unreadCount 0).
  markRead (conversationId, { workspaceId } = {}) {
    return this._call(
      'channels.markRead',
      `/channels/conversations/${encodeURIComponent(conversationId)}/read${qs({ workspaceId })}`,
      { method: 'POST', body: {} }
    )
  }

  // ── outbound ─────────────────────────────────────────────────────────

  // POST /core/channels/messages (editor) → { message, conversation }.
  // payload: { channel: 'whatsapp'|'sms', accountId?, conversationId? |
  // partyId? (+ to: one of the party's numbers), regarding?: { type:
  // 'lead'|'deal', id }, text? | template?: { name, language, params } }.
  // A provider failure still resolves: message.status 'failed' + message.error.
  send (payload = {}, { workspaceId } = {}) {
    return this._call('channels.send', `/channels/messages${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // POST /core/channels/calls (editor) → { call, conversation, dial? } — click-to-call.
  // payload: { channel?: 'phone' | 'whatsapp', via?: 'provider' | 'device', accountId?,
  // conversationId? | partyId? (+ to), regarding?, memberPhone? }. `dial` ({ kind:
  // 'tel' | 'whatsapp', href }) answers a device call. Errors: 400 member_phone_required
  // (no request / own / general number), 409 whatsapp_calling_not_available (a live
  // WhatsApp number — call from the device).
  startCall (payload = {}, { workspaceId } = {}) {
    return this._call('channels.startCall', `/channels/calls${qs({ workspaceId })}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /core/channels/calls/:messageId → the call row; { outcome?, note? } — and
  // for a DEVICE call its result: { status: 'completed' | 'no_answer' | 'busy' |
  // 'canceled' | 'failed', durationSec? }. 400 call_status_from_provider on a provider
  // call; 409 call_finished when the call already ended with another result.
  logCallOutcome (messageId, payload = {}, { workspaceId } = {}) {
    return this._call('channels.logCallOutcome', `/channels/calls/${encodeURIComponent(messageId)}${qs({ workspaceId })}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // POST /core/channels/calls/:messageId/simulate (editor; simulated number) →
  // the call row; { status: 'answered'|'completed'|'no_answer'|'busy'|'failed'|'canceled', durationSec? }.
  simulateCall (messageId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'channels.simulateCall',
      `/channels/calls/${encodeURIComponent(messageId)}/simulate${qs({ workspaceId })}`,
      { method: 'POST', body: payload }
    )
  }
}

export const createChannelService = config => new ChannelService(config)
