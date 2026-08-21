import test from 'tape'
import { SDK } from '../../../index.js'

// SDK-INVALIDATECLAIMS-DEAD-GUARD-1: `switchOrg`/`switchWorkspace` used to
// guard `if (this._tokenManager?.invalidateClaims) { … }`. `TokenManager`
// never defined that method, so the guard was falsy in every build and the
// call never ran. This suite proves the removal was correct rather than
// convenient: (1) there is no claim cache on TokenManager to clear, (2) every
// claim reader re-decodes the live access token per call, (3) the one cache
// that CAN outlive a switch — the workspace-project token provider — is
// already dropped by the per-service hook walk. A re-added dead guard, or a
// memoizing claim reader, fails here.

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims) =>
  `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(claims)}.notarealsignature`

const bootSdk = async () => {
  const sdk = new SDK({ apiUrl: 'http://localhost:0/api' })
  await sdk.initialize({})
  return sdk
}

test('TokenManager holds no claim cache — nothing for invalidateClaims to clear', async (t) => {
  const sdk = await bootSdk()
  const tm = sdk._tokenManager
  t.ok(tm, 'root token manager resolves (SDK-TOKENMANAGER-ROOT-1)')

  t.equal(
    'invalidateClaims' in tm,
    false,
    'invalidateClaims is absent from the instance AND the prototype chain'
  )

  const claimish = Object.keys(tm).filter((k) => /claim/i.test(k))
  t.deepEqual(claimish, [], 'no own field on TokenManager holds claims')

  // `tokens` is the whole credential surface: two opaque token strings plus
  // expiry. Nothing decoded is stashed alongside them. (Subset check, not an
  // exact-keys check — `setTokens` adds `tokenType`, and the TokenManager is
  // a process singleton shared with whichever test file ran first.)
  t.deepEqual(
    Object.keys(tm.tokens).filter((k) => /claim|payload|decoded/i.test(k)),
    [],
    'tokens carries credentials and expiry only — no decoded claim payload'
  )

  t.end()
})

test('every claim reader re-decodes the live access token — no memoization', async (t) => {
  const sdk = await bootSdk()
  const tm = sdk._tokenManager
  const auth = sdk.getService('auth')
  const persona = sdk.getService('persona')
  const nowSec = Math.floor(Date.now() / 1000)

  tm.setTokens({
    access_token: jwt({
      sub: 'user-1',
      exp: nowSec + 3600,
      activeOrganization: 'org-A',
      persona: { role: 'admin', sid: 'sid-A' }
    }),
    refresh_token: 'refresh-1',
    expires_in: 3600
  })

  t.equal(
    auth._userFromTokenClaims()?.app_metadata?.activeOrganization,
    'org-A',
    'AuthService._userFromTokenClaims reads org-A off token #1'
  )
  t.equal(
    persona._decodePersonaClaim()?.role,
    'admin',
    'PersonaService._decodePersonaClaim reads admin off token #1'
  )
  t.equal(
    tm._decodeJwtExpMs(),
    (nowSec + 3600) * 1000,
    'TokenManager._decodeJwtExpMs reads exp off token #1'
  )

  // Swap the token WITHOUT calling any invalidation step. If any reader
  // memoized, it would still answer org-A / admin here — the exact stale
  // claim the dead guard pretended to prevent.
  tm.tokens.accessToken = jwt({
    sub: 'user-1',
    exp: nowSec + 7200,
    activeOrganization: 'org-B',
    persona: { role: 'viewer', sid: 'sid-B' }
  })

  t.equal(
    auth._userFromTokenClaims()?.app_metadata?.activeOrganization,
    'org-B',
    'org claim re-derived as org-B with no invalidation call'
  )
  t.equal(
    persona._decodePersonaClaim()?.role,
    'viewer',
    'persona claim re-derived as viewer with no invalidation call'
  )
  t.equal(
    tm._decodeJwtExpMs(),
    (nowSec + 7200) * 1000,
    'exp claim re-derived with no invalidation call'
  )

  // setTokens scheduled an auto-refresh timer; drop it so the run exits.
  tm.destroy()
  t.end()
})

test('switchOrg/switchWorkspace drop the one cache that can outlive a switch', async (t) => {
  const sdk = await bootSdk()
  const wsp = sdk.getService('workspaceProject')

  let invalidated = 0
  const provider = async () => null
  provider.invalidate = () => {
    invalidated++
  }
  wsp._tokenProvider = provider

  // Keep both switches offline: the Mongo persist calls are not what this
  // test is about, and a real request would try to reach the network.
  sdk.setActiveWorkspace = async () => ({ success: true })

  // switchWorkspace persists `activeWorkspace` to localStorage when a
  // browser global is present. Sibling test files install one and leave it
  // behind, and BaseService._resolveWorkspaceId reads it as a fallback — so
  // without this snapshot/restore this test silently re-scopes every later
  // test file in the same tape process.
  const store = globalThis.localStorage
  const before = store ? store.getItem('activeWorkspace') : null
  const restoreStore = () => {
    if (!store) return
    if (before === null || before === undefined) store.removeItem('activeWorkspace')
    else store.setItem('activeWorkspace', before)
  }

  const orgResult = await sdk.switchOrg('org-B', { skipPersist: true })
  t.equal(orgResult.changed, true, 'switchOrg advanced the org context')
  t.equal(
    sdk._context.activeOrgId,
    'org-B',
    'context.activeOrgId is the fresh signal every service reads'
  )
  t.equal(
    invalidated,
    1,
    'switchOrg invalidated the workspace-project token-provider cache'
  )

  const wsResult = await sdk.switchWorkspace('workspace-2')
  t.equal(wsResult.changed, true, 'switchWorkspace advanced the workspace context')
  t.equal(
    sdk._context.activeWorkspaceId,
    'workspace-2',
    'context.activeWorkspaceId advanced synchronously'
  )
  t.equal(
    invalidated,
    2,
    'switchWorkspace invalidated the same provider cache'
  )

  restoreStore()
  t.end()
})

test('the dead guard is gone from both switch paths', async (t) => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../index.js', import.meta.url), 'utf8')

  t.equal(
    /this\._tokenManager\??\.?invalidateClaims\s*\(/.test(src),
    false,
    'no call to _tokenManager.invalidateClaims() survives in index.js'
  )
  t.equal(
    /if\s*\(\s*this\._tokenManager\?\.invalidateClaims\s*\)/.test(src),
    false,
    'no always-false invalidateClaims guard survives in index.js'
  )
  t.ok(
    src.includes('NO CLAIM CACHE'),
    'the finding is recorded in-place so the guard is not re-added'
  )

  t.end()
})
