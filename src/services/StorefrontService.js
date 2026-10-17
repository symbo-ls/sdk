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

// `qs` (a whole word) — the server route-drift analyzer drops `${qs(...)}`
// template holes, so every path below stays readable to it. (The old name
// `_qs` is not a whole word, so the analyzer read the products and jobs list
// paths as `/products:id` / `/jobs:id` and reported both routes as drift.)
const qs = (params) => {
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
      `/storefront/${encodeURIComponent(workspaceId)}/products${qs({ category, limit, page })}`
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
  //
  // Extra keys in the options object ride the query string as the
  // collection's DECLARED filters (today: cmsEntries `type` + `slug`); the
  // server ignores undeclared ones and 400s `invalid_filter` on a non-string.
  listStorefrontCollection (workspaceId, collection, { limit, page, ...filters } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!collection) throw new Error('collection is required')
    return this._call(
      'listStorefrontCollection',
      `/storefront/${encodeURIComponent(workspaceId)}/collections/${encodeURIComponent(collection)}${qs({ ...filters, limit, page })}`
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
      `/storefront/${encodeURIComponent(workspaceId)}/jobs${qs({ limit, page })}`
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

  // GET /core/storefront/:workspaceId/auth/providers
  // PUBLIC — which social sign-in providers this storefront offers, plus the
  // PUBLIC client ids a page needs to render its buttons:
  // `{ providers: { google: { enabled, clientId, clientIds },
  //                 apple: { enabled, clientId, servicesIds },
  //                 facebook: { enabled, appId } } }`. Never a secret.
  getStorefrontAuthProviders (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getStorefrontAuthProviders',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/providers`,
      { method: 'GET' }
    )
  }

  // POST /core/storefront/:workspaceId/auth/oauth/:provider
  // PUBLIC — social sign-in. The page obtains the provider token in the
  // browser and passes it here; the server verifies it against the
  // workspace's own configured client ids and signs the customer in (or
  // links / creates the account). Payload per provider:
  //   google   { idToken }                  — Google Identity Services credential
  //   apple    { idToken, nonce?, name? }   — Sign in with Apple JS id_token; the
  //            RAW nonce (the page passed sha256(nonce) to Apple); `name` only
  //            on the first authorization (Apple sends it to the client once)
  //   facebook { accessToken }              — Facebook JS SDK authResponse.accessToken
  // Resolves `{ token, customer }` — the same shape as
  // `loginStorefrontCustomer`.
  signInStorefrontCustomerWithOAuth (workspaceId, provider, { idToken, accessToken, nonce, name } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!['google', 'apple', 'facebook'].includes(provider)) {
      throw new Error('provider must be one of: google, apple, facebook')
    }
    return this._call(
      'signInStorefrontCustomerWithOAuth',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/oauth/${encodeURIComponent(provider)}`,
      { method: 'POST', body: { idToken, accessToken, nonce, name } }
    )
  }

  // PUT /core/storefront/:workspaceId/settings/auth-providers
  // AUTHENTICATED as the signed-in PLATFORM user (workspace owner|admin) —
  // unlike every other method on this service it rides the SDK's own
  // session. Per-provider partial update: an omitted provider is kept, `null`
  // removes it. `facebook.appSecret` is write-only (stored in the server's
  // secret manager, never returned); the response reports `appSecretSet`.
  //   { google: { clientIds: [] },
  //     apple: { servicesIds: [], bundleIds: [] },
  //     facebook: { appId, appSecret } }
  setStorefrontAuthProviders (workspaceId, config = {}) {
    this._requireReady('setStorefrontAuthProviders')
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'setStorefrontAuthProviders',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/auth-providers`,
      { method: 'PUT', body: config }
    )
  }

  // GET /core/storefront/:workspaceId/settings/schema
  // AUTHENTICATED platform user (workspace owner|admin). Which record
  // collections this storefront uses: `{ setting, preset, collections,
  // presets }` — the stored `settings.storefront.schema`, the preset it
  // resolves to ('unconfigured' — the isolated storefront_* names — until the
  // owner picks one), `configured`, the effective logical→collection map and
  // the selectable preset names.
  getStorefrontSchema (workspaceId) {
    this._requireReady('getStorefrontSchema')
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getStorefrontSchema',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/schema`,
      { method: 'GET' }
    )
  }

  // PUT /core/storefront/:workspaceId/settings/schema — owner|admin.
  // `{ preset: 'default' | 'natali', collections?: { <logicalKey>: <collectionKey> } }`,
  // or `{ preset: null }` to clear back to the unconfigured fallback.
  // `{ preset: 'default' }` binds the storefront to the workspace apps' bare
  // collections (products, categories, online_orders, cms_entries, bundles, …).
  setStorefrontSchema (workspaceId, schema) {
    this._requireReady('setStorefrontSchema')
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!schema || typeof schema !== 'object') throw new Error('schema is required')
    return this._call(
      'setStorefrontSchema',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/schema`,
      { method: 'PUT', body: schema }
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

  // ── Shaker program (CONTRACT §7, 2026-10-17) ────────────────────────────
  //
  // Same identity rules as above: every method below that talks to the
  // shopper surface is in BaseService._requiresInit's no-auth set, so the
  // SDK's own platform-user session NEVER rides it; a storefront-customer
  // token, where one applies, is passed explicitly and attached as a one-off
  // `Authorization` header. The four `settings/*` methods are the exception:
  // owner|admin writes on the platform-user session (like
  // setStorefrontAuthProviders).
  //
  // Argument order: required arguments, then the customer token (when the
  // route requires one), then an optional options object.

  // GET /core/storefront/resolve?host= — PUBLIC. `{ workspaceId, owner, key,
  // env }` for a published storefront's hostname. Omit `host` in a browser
  // and the server reads the page's Origin; pass it from a server-side
  // renderer or a script. A site resolves at boot and never hardcodes a
  // workspace id or an API base.
  resolveStorefront (host) {
    return this._call('resolveStorefront', `/storefront/resolve${qs({ host })}`)
  }

  // GET /core/storefront/:workspaceId/collections/bundles — PUBLIC. Active
  // kits only, sorted by sortOrder: `{ id, slug, name, tag, i18n, art,
  // cocktails, productIds, discountPercent, sortOrder }`; productIds name
  // published products only. The kit discount is applied by the server at
  // checkout (order items with `group: 'k:<slug>'`).
  //
  // The three kit/CMS readers below are named shortcuts over
  // listStorefrontCollection — the ONE literal for the server's
  // `/collections/:collection` route (a literal collection name in a second
  // path would read as drift to the server's route analyzer).
  listStorefrontBundles (workspaceId, { limit, page } = {}) {
    return this.listStorefrontCollection(workspaceId, 'bundles', { limit, page })
  }

  // GET /core/storefront/:workspaceId/collections/cmsTypes — PUBLIC. The
  // content types at least one PUBLISHED entry uses: `{ id, slug, label,
  // icon, color, fields: [{ key, label, type, required?, options? }],
  // updatedAt }`.
  listStorefrontCmsTypes (workspaceId, { limit, page } = {}) {
    return this.listStorefrontCollection(workspaceId, 'cmsTypes', { limit, page })
  }

  // GET /core/storefront/:workspaceId/collections/cmsEntries?type=&slug= —
  // PUBLIC. Published entries only, newest first (equal times by id):
  // `{ id, type, title, slug, body, fields, seo, i18n, cover, updatedAt }`.
  // `type` is the content type's slug; `slug` picks one entry (a page by its
  // URL slug). `limit` up to 500 (one call per type). `omit: 'body'` drops
  // `body` and `i18n.*.body` (a list page; any other value is a 400). `v` is
  // a cache-buster the server ignores — the answer is `Cache-Control:
  // public, no-cache` + a strong ETag, so a cached copy is always revalidated;
  // change `v` to skip a copy you know is old (e.g. after an events frame).
  listStorefrontCmsEntries (workspaceId, { type, slug, limit, page, omit, v } = {}) {
    return this.listStorefrontCollection(workspaceId, 'cmsEntries', { type, slug, omit, v, limit, page })
  }

  // POST /core/storefront/:workspaceId/orders — place an order. A guest
  // order (no `customerToken`) is accepted only when the workspace's checkout
  // settings allow guests; `order` then carries `contact: { name, phone,
  // email? }`. Shape (CONTRACT §3): `{ items: [{ productId | sku, quantity,
  // group? }], contact?, fulfilment: { mode, day, slot, deliveryCityId?,
  // street?, building?, flat?, geo? }, paymentMethod, note?, lang, channel?,
  // clientTotal? }` (the signed-in natali checkout keeps `addressId` and
  // `useLoyaltyPoints`). The server prices every line — never send prices.
  // Resolves `{ order, payment }`; a guest order's `order.accessKey` is
  // returned ONCE — keep it for getStorefrontOrderStatus / pay.
  placeStorefrontOrder (workspaceId, order = {}, { customerToken } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!order || typeof order !== 'object') throw new Error('order is required')
    return this._call(
      'placeStorefrontOrder',
      `/storefront/${encodeURIComponent(workspaceId)}/orders`,
      { method: 'POST', body: order, headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/orders/:id/status — a guest's status
  // read with the order's accessKey in the `X-Storefront-Order-Key` header
  // (never the URL: a query string lands in access logs), or the signed-in
  // customer's own order with their token: `{ orderNumber, paymentStatus,
  // fulfilmentStatus, total, currency, paymentMode }` (nothing personal).
  getStorefrontOrderStatus (workspaceId, id, key, { customerToken } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    if (!key && !customerToken) throw new Error('key or customerToken is required')
    return this._call(
      'getStorefrontOrderStatus',
      `/storefront/${encodeURIComponent(workspaceId)}/orders/${encodeURIComponent(id)}/status`,
      { headers: _orderHeaders(key, customerToken) }
    )
  }

  // POST /core/storefront/:workspaceId/orders/:id/pay/test — Keepz TEST mode
  // only (the workspace's payment mode is 'test'): `{ result: 'success' |
  // 'fail', method: 'apple' | 'google' | 'card' }`, a guest's accessKey in
  // the `X-Storefront-Order-Key` header. No money moves; a success books the
  // order paid with a KEEPZ-TEST reference.
  payStorefrontOrderTest (workspaceId, id, { key, result, method } = {}, { customerToken } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    if (!['success', 'fail'].includes(result)) throw new Error("result must be 'success' or 'fail'")
    return this._call(
      'payStorefrontOrderTest',
      `/storefront/${encodeURIComponent(workspaceId)}/orders/${encodeURIComponent(id)}/pay/test`,
      { method: 'POST', body: { result, method }, headers: _orderHeaders(key, customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/orders?limit=&skip= — the signed-in
  // customer's own orders.
  listStorefrontOrders (workspaceId, customerToken, { limit, skip } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'listStorefrontOrders',
      `/storefront/${encodeURIComponent(workspaceId)}/orders${qs({ limit, skip })}`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/orders/:id — one of the customer's own
  // orders (another customer's order 404s exactly like a missing one).
  getStorefrontOrder (workspaceId, id, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'getStorefrontOrder',
      `/storefront/${encodeURIComponent(workspaceId)}/orders/${encodeURIComponent(id)}`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/cart — product ids + quantities, never
  // prices (the server prices at checkout).
  getStorefrontCart (workspaceId, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'getStorefrontCart',
      `/storefront/${encodeURIComponent(workspaceId)}/cart`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // PUT /core/storefront/:workspaceId/cart — `items` is byte-for-byte the
  // `items` of placeStorefrontOrder; replaces the whole cart.
  replaceStorefrontCart (workspaceId, items, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!Array.isArray(items)) throw new Error('items must be an array')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'replaceStorefrontCart',
      `/storefront/${encodeURIComponent(workspaceId)}/cart`,
      { method: 'PUT', body: { items }, headers: _customerHeaders(customerToken) }
    )
  }

  // DELETE /core/storefront/:workspaceId/cart
  clearStorefrontCart (workspaceId, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'clearStorefrontCart',
      `/storefront/${encodeURIComponent(workspaceId)}/cart`,
      { method: 'DELETE', headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/account/addresses
  listStorefrontAddresses (workspaceId, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'listStorefrontAddresses',
      `/storefront/${encodeURIComponent(workspaceId)}/account/addresses`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // POST /core/storefront/:workspaceId/account/addresses —
  // `{ deliveryCityId, street, building?, flat?, isDefault? }`.
  createStorefrontAddress (workspaceId, { deliveryCityId, street, building, flat, isDefault } = {}, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'createStorefrontAddress',
      `/storefront/${encodeURIComponent(workspaceId)}/account/addresses`,
      {
        method: 'POST',
        body: { deliveryCityId, street, building, flat, isDefault },
        headers: _customerHeaders(customerToken)
      }
    )
  }

  // PATCH /core/storefront/:workspaceId/account/addresses/:id — partial.
  updateStorefrontAddress (workspaceId, id, patch = {}, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    if (!customerToken) throw new Error('customerToken is required')
    const { deliveryCityId, street, building, flat, isDefault } = patch || {}
    return this._call(
      'updateStorefrontAddress',
      `/storefront/${encodeURIComponent(workspaceId)}/account/addresses/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: { deliveryCityId, street, building, flat, isDefault },
        headers: _customerHeaders(customerToken)
      }
    )
  }

  // DELETE /core/storefront/:workspaceId/account/addresses/:id
  deleteStorefrontAddress (workspaceId, id, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'deleteStorefrontAddress',
      `/storefront/${encodeURIComponent(workspaceId)}/account/addresses/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: _customerHeaders(customerToken) }
    )
  }

  // PATCH /core/storefront/:workspaceId/auth/me — profile fields only.
  updateStorefrontCustomerMe (workspaceId, patch = {}, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'updateStorefrontCustomerMe',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/me`,
      { method: 'PATCH', body: patch || {}, headers: _customerHeaders(customerToken) }
    )
  }

  // POST /core/storefront/:workspaceId/auth/change-password
  changeStorefrontCustomerPassword (workspaceId, { currentPassword, newPassword } = {}, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'changeStorefrontCustomerPassword',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/change-password`,
      {
        method: 'POST',
        body: { currentPassword, newPassword },
        headers: _customerHeaders(customerToken)
      }
    )
  }

  // DELETE /core/storefront/:workspaceId/auth/me — archives the customer
  // record and deletes the credentials + saved addresses. Takes the CURRENT
  // password (or `reauth` for a passwordless social account).
  deleteStorefrontCustomerAccount (workspaceId, { currentPassword, reauth } = {}, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'deleteStorefrontCustomerAccount',
      `/storefront/${encodeURIComponent(workspaceId)}/auth/me`,
      {
        method: 'DELETE',
        body: { currentPassword, reauth },
        headers: _customerHeaders(customerToken)
      }
    )
  }

  // GET /core/storefront/:workspaceId/account/appointments?limit=&skip= —
  // natali preset only (an unmapped feature reads empty).
  listStorefrontAppointments (workspaceId, customerToken, { limit, skip } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'listStorefrontAppointments',
      `/storefront/${encodeURIComponent(workspaceId)}/account/appointments${qs({ limit, skip })}`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/account/balances — natali preset only.
  getStorefrontBalances (workspaceId, customerToken) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'getStorefrontBalances',
      `/storefront/${encodeURIComponent(workspaceId)}/account/balances`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/account/loyalty?limit=&skip= — natali
  // preset only.
  listStorefrontLoyalty (workspaceId, customerToken, { limit, skip } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!customerToken) throw new Error('customerToken is required')
    return this._call(
      'listStorefrontLoyalty',
      `/storefront/${encodeURIComponent(workspaceId)}/account/loyalty${qs({ limit, skip })}`,
      { headers: _customerHeaders(customerToken) }
    )
  }

  // GET /core/storefront/:workspaceId/events — the PUBLIC, anonymous SSE
  // invalidation channel. `onEvent` receives
  //   { type: 'records', collection, at }   a public collection changed:
  //                                         refetch what reads it (product
  //                                         media / category links /
  //                                         attribute values are embedded in
  //                                         the product shape, so those
  //                                         collections mean "refetch
  //                                         products" too)
  //   { type: 'deployment', version, at }   a new published bundle
  // and never row data. Anonymous on purpose: no stream ticket is minted even
  // when the SDK holds a platform session. Returns `unsubscribe()`; the
  // stream reconnects with backoff (the server closes it every 10 minutes).
  subscribeStorefrontEvents (workspaceId, onEvent) {
    if (!workspaceId) throw new Error('workspaceId is required')
    if (typeof onEvent !== 'function') throw new Error('onEvent must be a function')
    return this._sseSubscribe(
      `/storefront/${encodeURIComponent(workspaceId)}/events`,
      {},
      onEvent,
      {
        anonymous: true,
        events: [
          { name: 'records', frame: (data) => ({ type: 'records', collection: data.collection, at: data.at }) },
          { name: 'deployment', frame: (data) => ({ type: 'deployment', version: data.version, at: data.at }) }
        ]
      }
    )
  }

  // GET /core/storefront/:workspaceId/checkout — PUBLIC. What the shop's
  // checkout offers right now: `{ enabled, guest, paymentMethods, currency,
  // fulfilment: { modes, daysAhead, timezone, leadMinutes, slots,
  // pickupAddress, days: [{ day, open, slots: [{ key, from, to, open }] }] },
  // payments: { keepz: { mode } }, captcha: { provider, siteKey } | null }`
  // (`{ enabled: false }` when the shop has no checkout settings). The
  // day/slot calendar is computed by the server in the shop's timezone —
  // render it, never the visitor's clock.
  getStorefrontCheckout (workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getStorefrontCheckout',
      `/storefront/${encodeURIComponent(workspaceId)}/checkout`
    )
  }

  // POST /core/storefront/:workspaceId/orders/:id/payments/confirm — STAFF
  // (platform-user session, editor+): confirm a CASH order as paid through
  // the same settlement as Keepz (transaction + invoice). `{ reference?,
  // note? }`.
  confirmStorefrontCashPayment (workspaceId, id, { reference, note } = {}) {
    this._requireReady('confirmStorefrontCashPayment')
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!id) throw new Error('id is required')
    return this._call(
      'confirmStorefrontCashPayment',
      `/storefront/${encodeURIComponent(workspaceId)}/orders/${encodeURIComponent(id)}/payments/confirm`,
      { method: 'POST', body: { reference, note } }
    )
  }

  // GET|PUT /core/storefront/:workspaceId/settings/checkout — owner|admin on
  // the platform-user session. `{ guest, paymentMethods, fulfilment: { modes,
  // daysAhead, timezone, leadMinutes, slots, pickupAddress }, orderPrefix,
  // currency, notifyEmails }` (CONTRACT §2). Absent = sign-in-only checkout.
  getStorefrontCheckoutSettings (workspaceId) {
    this._requireReady('getStorefrontCheckoutSettings')
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getStorefrontCheckoutSettings',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/checkout`,
      { method: 'GET' }
    )
  }

  setStorefrontCheckoutSettings (workspaceId, settings) {
    this._requireReady('setStorefrontCheckoutSettings')
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!settings || typeof settings !== 'object') throw new Error('settings is required')
    return this._call(
      'setStorefrontCheckoutSettings',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/checkout`,
      { method: 'PUT', body: settings }
    )
  }

  // GET|PUT /core/storefront/:workspaceId/settings/payments — owner|admin.
  // `{ keepz: { mode: 'test' | 'live' | 'off', integratorId, receiverId,
  // receiverType, publicKey, privateKey? (write-only), base } }`; the
  // response reports `privateKeySet`, never the key.
  getStorefrontPaymentSettings (workspaceId) {
    this._requireReady('getStorefrontPaymentSettings')
    if (!workspaceId) throw new Error('workspaceId is required')
    return this._call(
      'getStorefrontPaymentSettings',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/payments`,
      { method: 'GET' }
    )
  }

  setStorefrontPaymentSettings (workspaceId, settings) {
    this._requireReady('setStorefrontPaymentSettings')
    if (!workspaceId) throw new Error('workspaceId is required')
    if (!settings || typeof settings !== 'object') throw new Error('settings is required')
    return this._call(
      'setStorefrontPaymentSettings',
      `/storefront/${encodeURIComponent(workspaceId)}/settings/payments`,
      { method: 'PUT', body: settings }
    )
  }
}

// A one-off storefront-CUSTOMER Authorization header, or none — never the
// SDK's platform session (see the class header).
function _customerHeaders (customerToken) {
  return customerToken ? { Authorization: `Bearer ${customerToken}` } : undefined
}

// The guest order's accessKey rides `X-Storefront-Order-Key` (the server
// reads it before the old `?key=` / body field, kept one release), next to a
// storefront-customer token when there is one.
export const STOREFRONT_ORDER_KEY_HEADER = 'X-Storefront-Order-Key'

function _orderHeaders (key, customerToken) {
  const headers = { ...(_customerHeaders(customerToken) || {}) }
  if (key) headers[STOREFRONT_ORDER_KEY_HEADER] = String(key)
  return Object.keys(headers).length ? headers : undefined
}

export const createStorefrontService = config => new StorefrontService(config)
