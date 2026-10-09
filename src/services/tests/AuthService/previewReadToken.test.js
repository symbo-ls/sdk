// PREVIEW-READ-TOKEN — the preview SDK holds one short token and nothing else.
//
// A preview host runs USER project code. Before this, the preview page got
// the visitor's full platform session, and the SDK parked it on
// `globalThis.__SMBLS_TOKEN_MANAGER__` where any script could read it
// (review D1). `new SDK({ previewReadToken })` now:
//   - never creates that global and never touches storage;
//   - sends only the preview token, never refreshes, refuses setTokens;
//   - drops an expired token instead of refreshing it.
// `sdk.mintPreviewToken()` is the shell's wrapper for the mint route.
//
// Run: npx tape src/services/tests/AuthService/previewReadToken.test.js
import test from 'tape'
import sinon from 'sinon'
import { SDK } from '../../../index.js'
import { AuthService } from '../../AuthService.js'

const GLOBAL_KEY = '__SMBLS_TOKEN_MANAGER__'
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (claims) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`
const now = () => Math.floor(Date.now() / 1000)
const PREVIEW = fakeJwt({ aud: 'symbols-preview-read', prj: 'p1', exp: now() + 600 })
const EXPIRED = fakeJwt({ aud: 'symbols-preview-read', prj: 'p1', exp: now() - 5 })

const storageSpy = () => {
  const writes = []
  const reads = []
  return {
    writes,
    reads,
    getItem: (k) => { reads.push(k); return null },
    setItem: (k, v) => writes.push([k, v]),
    removeItem: () => {}
  }
}

const withEnv = async (t, fn) => {
  const saved = {
    tm: globalThis[GLOBAL_KEY],
    ls: globalThis.localStorage,
    fetch: globalThis.fetch
  }
  delete globalThis[GLOBAL_KEY]
  const ls = storageSpy()
  globalThis.localStorage = ls
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: { ...(init.headers || {}) }, method: init.method || 'GET', body: init.body })
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, data: { ok: 1 } }) }
  }
  try {
    await fn({ ls, calls })
  } finally {
    if (saved.tm === undefined) delete globalThis[GLOBAL_KEY]
    else globalThis[GLOBAL_KEY] = saved.tm
    if (saved.ls === undefined) delete globalThis.localStorage
    else globalThis.localStorage = saved.ls
    globalThis.fetch = saved.fetch
  }
}

const previewSdk = async (token) => {
  const sdk = new SDK({ apiUrl: 'https://api.test', previewReadToken: token })
  await sdk.initialize({})
  return sdk
}

test('SDK advertises preview-read support', (t) => {
  t.equal(SDK.supportsPreviewReadToken, true)
  t.end()
})

test('preview SDK: no page-global token manager, no storage, token not on options', async (t) => {
  t.timeoutAfter(10000)
  await withEnv(t, async ({ ls }) => {
    const sdk = await previewSdk(PREVIEW)
    t.equal(globalThis[GLOBAL_KEY], undefined, 'globalThis.__SMBLS_TOKEN_MANAGER__ never created')
    t.equal(sdk.isPreviewReadSession(), true)
    t.equal(sdk.getAuthToken(), PREVIEW, 'the preview token is the only token')
    t.equal(sdk.getService('project')._tokenManager, sdk.getService('auth')._tokenManager, 'one holder per SDK')
    t.equal(sdk.getService('project')._tokenManager.isScopedTokenHolder, true)
    t.deepEqual(ls.writes, [], 'nothing written to localStorage')
    t.deepEqual(ls.reads.filter((k) => /symbols_(access|refresh)/.test(k)), [], 'no platform token read from storage')
    t.notOk(JSON.stringify(sdk._options).includes(PREVIEW), 'the raw token is not on the options')
    t.notOk(JSON.stringify(sdk.getService('auth')._tokenManager).includes(PREVIEW), 'the holder JSON carries no token')
  })
  t.end()
})

test('preview SDK: sends only the preview token and refuses a platform session', async (t) => {
  t.timeoutAfter(10000)
  await withEnv(t, async ({ calls }) => {
    const sdk = await previewSdk(PREVIEW)
    const holder = sdk.getService('auth')._tokenManager
    holder.setTokens({ access_token: 'PLATFORM-ACCESS', refresh_token: 'PLATFORM-REFRESH' })
    t.equal(holder.getRefreshToken(), null, 'no refresh token, ever')
    await sdk.getService('project')._request('/projects/key/acme/shop/data', { methodName: 'getProjectDataByKey' })
    const sent = calls.at(-1)
    t.equal(sent.headers.Authorization, `Bearer ${PREVIEW}`, 'only the preview token is sent')
    t.equal(await holder.refreshTokens(), null, 'refresh is a no-op')
  })
  t.end()
})

test('preview SDK: an expired token is dropped, never refreshed', async (t) => {
  t.timeoutAfter(10000)
  await withEnv(t, async ({ calls }) => {
    const sdk = await previewSdk(EXPIRED)
    await sdk.getService('project')._request('/projects/key/acme/shop/data', { methodName: 'getProjectDataByKey' })
    t.equal(calls.length, 1, 'one request, no refresh round trip')
    t.equal(calls[0].headers.Authorization, undefined, 'no Authorization header')
    t.equal(sdk.getAuthToken(), null)
  })
  t.end()
})

test('preview SDK with a null token: anonymous, still no global manager', async (t) => {
  t.timeoutAfter(10000)
  await withEnv(t, async () => {
    const sdk = await previewSdk(null)
    t.equal(globalThis[GLOBAL_KEY], undefined)
    t.equal(sdk.getAuthToken(), null)
  })
  t.end()
})

test('control: a default SDK still uses the shared TokenManager', async (t) => {
  t.timeoutAfter(10000)
  await withEnv(t, async () => {
    const sdk = new SDK({ apiUrl: 'https://api.test' })
    await sdk.initialize({})
    t.ok(globalThis[GLOBAL_KEY], 'the global manager exists in the default mode')
    t.equal(sdk.isPreviewReadSession(), false)
    globalThis[GLOBAL_KEY].destroy?.()
  })
  t.end()
})

test('mintPreviewToken posts the target to /auth/preview-token', async (t) => {
  const svc = new AuthService()
  const call = sinon.stub(svc, '_call').resolves({
    previewToken: 'pt', expiresIn: 600, expiresAt: 'x', projectId: 'p1'
  })
  const out = await svc.mintPreviewToken({ owner: 'acme', key: 'shop' })
  t.equal(out.previewToken, 'pt')
  t.deepEqual(call.firstCall.args, [
    'mintPreviewToken', '/auth/preview-token', { method: 'POST', body: { owner: 'acme', key: 'shop' } }
  ])
  await svc.mintPreviewToken({ projectId: 'p1' })
  t.deepEqual(call.secondCall.args[2].body, { projectId: 'p1' })
  try {
    await svc.mintPreviewToken({})
    t.fail('a mint with no target must throw')
  } catch (e) {
    t.ok(/required/.test(e.message))
  }
  call.resolves({})
  try {
    await svc.mintPreviewToken({ projectId: 'p1' })
    t.fail('a reply with no token must throw')
  } catch (e) {
    t.ok(/no token/.test(e.message))
  }
  sinon.restore()
  t.end()
})
