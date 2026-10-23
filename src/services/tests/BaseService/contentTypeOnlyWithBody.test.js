import test from 'tape'
import sinon from 'sinon'
import { BaseService, __inflightGetsForTests } from '../../BaseService.js'
import { StorefrontService } from '../../StorefrontService.js'

// SDK-CONTENT-TYPE-ON-BODILESS-GET-FORCES-PREFLIGHT-1. A cross-origin request
// stays a CORS "simple request" — no OPTIONS preflight — only while every
// header it carries is CORS-safelisted, and `Content-Type: application/json`
// is not (only text/plain, multipart/form-data and
// application/x-www-form-urlencoded are). `_request` put it on EVERY request,
// bodiless GETs included, so every storefront read was OPTIONS + GET: a
// bazaar1 boot = 14 GETs + 13 OPTIONS, and the API answers preflights with
// `Access-Control-Max-Age: 1`, so the browser asks again on every call.
//
// Rule now: a read (GET / HEAD — fetch() refuses a body on either) sends no
// Content-Type; a request with a body says what the body is; FormData is left
// to the runtime (it writes the multipart boundary); a caller's own header
// wins; a bodiless mutation keeps application/json on purpose (see
// BaseService._request).

const SAFELISTED = new Set(['accept', 'accept-language', 'content-language', 'range'])
const SIMPLE_CONTENT_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain'
])
const headerOf = (headers, name) => {
  const hit = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase())
  return hit === undefined ? undefined : headers[hit]
}
// What the browser checks before it decides to preflight (headers only — the
// method is checked separately).
const isSimpleHeaderSet = (headers = {}) =>
  Object.entries(headers).every(([k, v]) => {
    const name = k.toLowerCase()
    if (SAFELISTED.has(name)) return true
    if (name !== 'content-type') return false
    return SIMPLE_CONTENT_TYPES.has(String(v).split(';')[0].trim().toLowerCase())
  })

const jsonRes = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
})

const withFetch = async (fn) => {
  const original = globalThis.fetch
  const stub = sinon.stub().callsFake(async () => jsonRes({ success: true, data: {} }))
  globalThis.fetch = stub
  try {
    await fn(stub)
  } finally {
    globalThis.fetch = original
    __inflightGetsForTests.clear()
  }
}

const makeBase = () => {
  const svc = new BaseService()
  svc._apiUrl = 'https://api.test'
  svc._ready = true
  return svc
}

const initOf = (stub, i = 0) => stub.getCall(i).args[1] || {}

test('a bodiless GET carries no Content-Type: a cross-origin read stays a simple request', async (t) => {
  await withFetch(async (fetch) => {
    await makeBase()._request('/storefront/6aadb5e0d03299e6a0719dcc/products', { method: 'GET' })
    const init = initOf(fetch)
    t.equal(headerOf(init.headers, 'Content-Type'), undefined, 'no Content-Type on a read')
    t.ok(isSimpleHeaderSet(init.headers), `only CORS-safelisted headers: ${JSON.stringify(init.headers)}`)
  })
  t.end()
})

test('a GET with no method given (the default) and a HEAD send no Content-Type either', async (t) => {
  await withFetch(async (fetch) => {
    const svc = makeBase()
    await svc._request('/storefront/resolve?host=bazaar1.ge')
    await svc._request('/health', { method: 'HEAD' })
    t.equal(headerOf(initOf(fetch, 0).headers, 'Content-Type'), undefined, 'default GET')
    t.equal(headerOf(initOf(fetch, 1).headers, 'Content-Type'), undefined, 'HEAD')
  })
  t.end()
})

test('the storefront boot reads, through the public SDK surface, are all simple requests', async (t) => {
  const WS = '6ad90a11cbbe3293726ebe7a'
  await withFetch(async (fetch) => {
    const svc = new StorefrontService()
    svc._apiUrl = 'https://api.test'
    svc._ready = true
    await svc.resolveStorefront('bazaar1.ge')
    await svc.listStorefrontProducts(WS, { limit: 300 })
    await svc.listStorefrontBundles(WS)
    await svc.listStorefrontCollection(WS, 'categories')
    await svc.getStorefrontCheckout(WS)
    await svc.listStorefrontCmsEntries(WS, { type: 'page', omit: 'body' })
    t.equal(fetch.callCount, 6, 'six reads went out')
    for (let i = 0; i < fetch.callCount; i += 1) {
      const [url, init] = fetch.getCall(i).args
      t.equal(String(init.method || 'GET').toUpperCase(), 'GET', `${url} is a GET`)
      t.ok(isSimpleHeaderSet(init.headers), `${url} carries only safelisted headers: ${JSON.stringify(init.headers)}`)
    }
  })
  t.end()
})

test('a JSON body still says application/json', async (t) => {
  await withFetch(async (fetch) => {
    await makeBase()._call('createThing', '/things', { method: 'POST', body: { a: 1 } })
    const init = initOf(fetch)
    t.equal(headerOf(init.headers, 'Content-Type'), 'application/json')
    t.equal(init.body, JSON.stringify({ a: 1 }), 'the body is the JSON text')
  })
  t.end()
})

test('a bodiless mutation keeps application/json (deliberately unchanged)', async (t) => {
  await withFetch(async (fetch) => {
    const svc = makeBase()
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await svc._request('/things/1', { method })
    }
    for (let i = 0; i < 4; i += 1) {
      t.equal(headerOf(initOf(fetch, i).headers, 'Content-Type'), 'application/json', initOf(fetch, i).method)
    }
  })
  t.end()
})

test('FormData is left to the runtime (it writes the multipart boundary)', async (t) => {
  await withFetch(async (fetch) => {
    const form = new FormData()
    form.append('file', new Blob(['x']), 'x.txt')
    await makeBase()._request('/files', { method: 'POST', body: form })
    t.equal(headerOf(initOf(fetch).headers, 'Content-Type'), undefined)
  })
  t.end()
})

test("a caller's own Content-Type wins, on a read and on a write", async (t) => {
  await withFetch(async (fetch) => {
    const svc = makeBase()
    await svc._request('/export', { method: 'GET', headers: { 'Content-Type': 'text/plain' } })
    await svc._request('/docs', {
      method: 'POST',
      body: '# hello',
      headers: { 'Content-Type': 'text/markdown' }
    })
    t.equal(headerOf(initOf(fetch, 0).headers, 'Content-Type'), 'text/plain')
    t.equal(headerOf(initOf(fetch, 1).headers, 'Content-Type'), 'text/markdown')
  })
  t.end()
})
