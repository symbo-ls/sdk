import { BaseService } from './BaseService.js'

// PublicCollectionService (service name `publicRecords`) wraps the main
// server's generic, opt-in ANONYMOUS records surface:
//   /core/public/:scope/collections/:key/*
//
// `scope` is a workspace id OR an organization slug (e.g. 'ventures'); a
// slug resolves server-side to that org's hq workspace, so a published site
// can address its data by its owner slug and carry no hardcoded id.
//
// A workspace owner opts a RecordCollection in by setting its `public` block
// (sdk.getService('recordCollections').update(id, { public: {...} })):
//   read   — list/get rows that match a server-side equality filter, with
//            only allowlisted `data` fields returned;
//   submit — anonymous create, server-forced defaults (e.g. status:
//            'pending'), optional captcha, Origin allowlist, honeypot;
//   vote   — one upvote per row per visitor IP, atomic count.
//
// All four methods are in BaseService._requiresInit's no-auth set: a
// published site's visitor has no account, and attaching a signed-in
// member's bearer token would make the page behave differently for the one
// browser that happens to be logged in. Every refusal before the row (no
// such workspace / collection, not granted, feature off) is the same 404 —
// `_call` throws with the server's message.

const _enc = encodeURIComponent

// list query → '?q=&where[data.x]=v&sort=&limit=&page='
const _listQs = ({ q, where, sort, limit, page } = {}) => {
  const usp = new URLSearchParams()
  if (q !== undefined && q !== null && q !== '') usp.set('q', String(q))
  if (where && typeof where === 'object') {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined || v === null) continue
      const key = k.startsWith('data.') ? k : `data.${k}`
      usp.set(`where[${key}]`, String(v))
    }
  }
  if (sort) usp.set('sort', Array.isArray(sort) ? sort.join(',') : String(sort))
  if (limit !== undefined && limit !== null && limit !== '') usp.set('limit', String(limit))
  if (page !== undefined && page !== null && page !== '') usp.set('page', String(page))
  const s = usp.toString()
  return s ? `?${s}` : ''
}

const _need = (v, name) => {
  if (v === undefined || v === null || v === '') throw new Error(`${name} is required`)
}

export class PublicCollectionService extends BaseService {
  // GET /core/public/:scope/collections/:key
  // opts: { q, where: { field: value } (data. prefix optional), sort:
  // 'data.featured:-1,createdAt:-1' | [..], limit (≤100), page }.
  // Resolves { items: [{ id, name, data, createdAt, updatedAt }], pagination:
  // { page, limit, total, pages, hasMore } }.
  listPublicRecords (scope, key, opts = {}) {
    _need(scope, 'scope')
    _need(key, 'key')
    return this._call(
      'listPublicRecords',
      `/public/${_enc(scope)}/collections/${_enc(key)}${_listQs(opts)}`
    )
  }

  // GET /core/public/:scope/collections/:key/:idOrSlug
  // One row by id or data.slug — 404 unless it matches the read filter.
  getPublicRecord (scope, key, idOrSlug) {
    _need(scope, 'scope')
    _need(key, 'key')
    _need(idOrSlug, 'idOrSlug')
    return this._call(
      'getPublicRecord',
      `/public/${_enc(scope)}/collections/${_enc(key)}/${_enc(idOrSlug)}`
    )
  }

  // POST /core/public/:scope/collections/:key/submissions
  // `data` — the form fields (unknown keys are dropped server-side, defaults
  // are forced). Pass the captcha widget token as `captchaToken` and the
  // form's honeypot input (left empty by humans) as `honeypot: { field, value }`
  // when the page renders one. Resolves { id, status: 'pending' } — the
  // record itself is never echoed.
  submitPublicRecord (scope, key, data, { captchaToken, honeypot } = {}) {
    _need(scope, 'scope')
    _need(key, 'key')
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('data must be an object')
    }
    const body = { data }
    if (captchaToken) body.captchaToken = captchaToken
    if (honeypot && honeypot.field) body[honeypot.field] = honeypot.value ?? ''
    return this._call(
      'submitPublicRecord',
      `/public/${_enc(scope)}/collections/${_enc(key)}/submissions`,
      { method: 'POST', body }
    )
  }

  // POST /core/public/:scope/collections/:key/:id/vote
  // One upvote per row per visitor; resolves { count, voted } — `voted:false`
  // means this visitor had already voted (count unchanged).
  votePublicRecord (scope, key, id) {
    _need(scope, 'scope')
    _need(key, 'key')
    _need(id, 'id')
    return this._call(
      'votePublicRecord',
      `/public/${_enc(scope)}/collections/${_enc(key)}/${_enc(id)}/vote`,
      { method: 'POST', body: {} }
    )
  }
}

export const createPublicCollectionService = config => new PublicCollectionService(config)
