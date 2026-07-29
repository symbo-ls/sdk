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
}

export const createStorefrontService = config => new StorefrontService(config)
