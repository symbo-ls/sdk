import { BaseService } from './BaseService.js'

// StorefrontService wraps the main server's PUBLIC, UNAUTHENTICATED
// /core/storefront/:workspaceId/* routes (tickets/server.md "storefront
// catalog read API", NAT-V1-25..30) — the natali public-shopper catalog
// read surface. Unlike every other Phase-3 commerce service (Product,
// Price, Agreement, …), there is NO workspace-membership identity here by
// design: the storefront serves anonymous visitors, so these three methods
// never attach an Authorization header (see BaseService._requiresInit —
// `listStorefrontProducts`/`getStorefrontProduct`/`listStorefrontCollection`
// are registered alongside the meet-guest / demo flows).
//
// Every read is server-side allowlisted + business-rule-filtered
// (published products only, costPrice stripped, computed warehouse-only
// non-expired availability, active/filterable/searchable flags for the
// supporting catalog collections) — this service is a thin HTTP wrapper,
// it does NOT re-implement any of that filtering client-side.
//
// ── Storefront customer identity (tickets/server.md "storefront customer
// identity layer", NAT-V1-25/27/28) ─────────────────────────────────────
// register/login/requestOtp/verifyOtp/resetPassword wrap
// `/core/storefront/:workspaceId/auth/*` — ALSO unauthenticated (that's the
// point: this IS the anonymous-visitor-becomes-a-customer surface), so they
// are registered in `_requiresInit`'s no-auth-header set the same as the
// catalog reads above.
//
// `getStorefrontCustomerMe` is different: it is the one authenticated route
// on this router, but its identity is a STOREFRONT CUSTOMER session token —
// a completely separate identity plane from the SDK's own signed-in-user
// session (see server core/utils/auth.js `CUSTOMER_ACCESS_TOKEN_AUDIENCE`
// for why a customer token and a platform-user token are mutually
// non-substitutable). It therefore does NOT go through the SDK's shared
// TokenManager/session — the caller passes the customer token explicitly
// (the one returned by `loginStorefrontCustomer`), and this method attaches
// it as a one-off `Authorization` header. Mixing it into the TokenManager
// would risk a customer session silently riding along on other, unrelated
// SDK calls for the signed-in platform user (or vice versa).

const _qs = (params) => {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export class StorefrontService extends BaseService {
  // GET /core/storefront/:workspaceId/products?category=&limit=&page=
  // PUBLIC — published products only, computed sellable (warehouse,
  // non-expired) availability, zero-stock products excluded from the
  // listing, costPrice never present.
  listStorefrontProducts (workspaceId, { category, limit, page } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'listStorefrontProducts',
      `/storefront/${encodeURIComponent(workspaceId)}/products${_qs({ category, limit, page })}`
    )
  }

  // GET /core/storefront/:workspaceId/products/:id
  // PUBLIC — a published product's detail page stays reachable at zero
  // stock (`inStock:false`); a draft/missing/cross-workspace id 404s.
  getStorefrontProduct (workspaceId, id) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    return this._call(
      'getStorefrontProduct',
      `/storefront/${encodeURIComponent(workspaceId)}/products/${encodeURIComponent(id)}`
    )
  }

  // GET /core/storefront/:workspaceId/collections/:collection?limit=&page=
  // PUBLIC — the ONLY caller-supplied-collection-name entry point; the
  // server checks `collection` against an explicit, hardcoded allowlist
  // (nat_categories, nat_attributes, nat_attribute_list_values,
  // nat_product_categories, nat_product_attribute_values,
  // nat_product_media, nat_delivery_cities) and 400s
  // `collection_not_public` for anything else — including nat_products
  // (use listStorefrontProducts/getStorefrontProduct instead) and every
  // non-public nat_* collection (nat_stock_lines, nat_customers, …).
  listStorefrontCollection (workspaceId, collection, { limit, page } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!collection) throw new Error('collection is required')
    return this._call(
      'listStorefrontCollection',
      `/storefront/${encodeURIComponent(workspaceId)}/collections/${encodeURIComponent(collection)}${_qs({ limit, page })}`
    )
  }

  // ── Job-application pipeline (tickets/server.md "job-application
  // pipeline backend") — public job listings (read) + the public
  // application WRITE. Same no-auth-header carve-out as the catalog reads
  // above (see BaseService._requiresInit) — anonymous applicants, no
  // workspace-membership identity. `applyToStorefrontJob` is the SDK's
  // wrapper around the platform's first anonymous public WRITE; the server
  // NEVER echoes applicant PII back and returns the identical
  // `{received:true}` body whether the submission was fresh or a deduped
  // repeat (see server StorefrontJobsService.js header "NO ENUMERATION") —
  // callers should not try to infer anything from this response beyond
  // "the server accepted the request".

  // GET /core/storefront/:workspaceId/jobs?limit=&page=
  // PUBLIC — published + active openings only.
  listStorefrontJobs (workspaceId, { limit, page } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'listStorefrontJobs',
      `/storefront/${encodeURIComponent(workspaceId)}/jobs${_qs({ limit, page })}`
    )
  }

  // GET /core/storefront/:workspaceId/jobs/:id
  // PUBLIC — published + active only; an unpublished/archived/missing/
  // cross-workspace id 404s.
  getStorefrontJob (workspaceId, id) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    return this._call(
      'getStorefrontJob',
      `/storefront/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(id)}`
    )
  }

  // POST /core/storefront/:workspaceId/jobs/:id/apply
  // PUBLIC — the anonymous public WRITE. `cvUrl` is a link (Drive/Dropbox/
  // LinkedIn/…), not a file upload — v1 has no anonymous-safe upload path
  // server-side (see server StorefrontJobsService.js header). Rate-limited
  // far stricter than the catalog reads (5/hr per-IP, 30/hr per-opening) —
  // a 429 here means slow down, not a bug.
  applyToStorefrontJob (workspaceId, id, { fullName, email, phone, coverLetter, cvUrl } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    return this._call(
      'applyToStorefrontJob',
      `/storefront/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(id)}/apply`,
      { method: 'POST', body: { fullName, email, phone, coverLetter, cvUrl } }
    )
  }

  // POST /core/storefront/:workspaceId/auth/register
  // PUBLIC — physical customers only (juridical customers cannot self-
  // register, §8.10 — there is no `type` param here to request it).
  registerStorefrontCustomer (workspaceId, { phone, email, fullName, password, birthDate, identificationNumber } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'registerStorefrontCustomer',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/register`,
      { method: 'POST', body: { phone, email, fullName, password, birthDate, identificationNumber } }
    )
  }

  // POST /core/storefront/:workspaceId/auth/login
  // PUBLIC — email or phone + password. Resolves `{ token, customer }` on
  // success; `token` is a storefront-customer session token, pass it to
  // `getStorefrontCustomerMe`.
  loginStorefrontCustomer (workspaceId, { email, phone, identifier, password } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'loginStorefrontCustomer',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/login`,
      { method: 'POST', body: { email, phone, identifier, password } }
    )
  }

  // POST /core/storefront/:workspaceId/auth/request-otp
  // PUBLIC — `purpose` is 'verify' (default) or 'reset'. v1 is EMAIL-ONLY
  // (no SMS provider wired server-side yet) — a phone-only request resolves
  // `{ success:false }` with `error:'sms_not_available'`, never a silent
  // no-op.
  requestStorefrontCustomerOtp (workspaceId, { phone, email, purpose } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'requestStorefrontCustomerOtp',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/request-otp`,
      { method: 'POST', body: { phone, email, purpose } }
    )
  }

  // POST /core/storefront/:workspaceId/auth/verify-otp
  verifyStorefrontCustomerOtp (workspaceId, { phone, email, code, purpose } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'verifyStorefrontCustomerOtp',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/verify-otp`,
      { method: 'POST', body: { phone, email, code, purpose } }
    )
  }

  // POST /core/storefront/:workspaceId/auth/reset-password
  // PUBLIC — phone/email + the OTP from requestStorefrontCustomerOtp
  // (purpose:'reset') + newPassword, in one call.
  resetStorefrontCustomerPassword (workspaceId, { phone, email, code, newPassword } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'resetStorefrontCustomerPassword',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/reset-password`,
      { method: 'POST', body: { phone, email, code, newPassword } }
    )
  }

  // GET /core/storefront/:workspaceId/auth/me
  // Behind `requireCustomer` on the server — pass the storefront-customer
  // token returned by `loginStorefrontCustomer` explicitly. See the class
  // header for why this does NOT use the SDK's shared TokenManager session.
  getStorefrontCustomerMe (workspaceId, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'getStorefrontCustomerMe',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/me`,
      { headers: { Authorization: `Bearer ${customerToken}` } }
    )
  }
}

export const createStorefrontService = config => new StorefrontService(config)
