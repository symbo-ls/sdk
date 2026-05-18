import test from 'tape'
import { TokenManager } from '../../../utils/TokenManager.js'

// Minimal JWT builder: { alg: HS256 }.{ payload }.signature — signature is not
// verified by the SDK (it only decodes the exp claim), so a placeholder is
// fine.
const b64url = (obj) => {
  const json = JSON.stringify(obj)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const makeJwt = (exp) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'u_1', exp })}.sig`

const makeManager = () => new TokenManager({ storageType: 'memory' })

test('TokenManager — JWT exp drives validity when expiresAt is absent', t => {
  t.plan(4)
  const tm = makeManager()
  const futureExp = Math.floor(Date.now() / 1000) + 3600 // +1h
  tm.tokens.accessToken = makeJwt(futureExp)
  tm.tokens.expiresAt = null // External login flow path: token set without expires_in

  t.equal(tm.isAccessTokenValid(), true, 'JWT not yet expired → valid')
  t.equal(tm.isAccessTokenActuallyValid(), true, 'JWT not yet expired → actuallyValid')

  const pastExp = Math.floor(Date.now() / 1000) - 3600 // -1h
  tm.tokens.accessToken = makeJwt(pastExp)
  t.equal(tm.isAccessTokenValid(), false, 'JWT past exp → invalid (was the silent-failure bug)')
  t.equal(tm.isAccessTokenActuallyValid(), false, 'JWT past exp → not actuallyValid')
})

test('TokenManager — opaque (non-JWT) token still falls through to "assume valid"', t => {
  t.plan(2)
  const tm = makeManager()
  tm.tokens.accessToken = 'opaque-token-not-a-jwt'
  tm.tokens.expiresAt = null

  t.equal(tm.isAccessTokenValid(), true, 'no exp anywhere → assume valid (backward compat)')
  t.equal(tm.isAccessTokenActuallyValid(), true, 'no exp anywhere → actuallyValid')
})

test('TokenManager — stored expiresAt takes precedence over JWT exp', t => {
  t.plan(1)
  const tm = makeManager()
  // JWT says expired, but stored expiresAt says valid → stored wins
  const pastExp = Math.floor(Date.now() / 1000) - 3600
  tm.tokens.accessToken = makeJwt(pastExp)
  tm.tokens.expiresAt = Date.now() + 10 * 60 * 1000 // +10 min (clear of refreshBuffer)

  t.equal(tm.isAccessTokenValid(), true, 'stored expiresAt wins when present')
})

test('TokenManager — getTokenStatus reports expired for stale JWT with no refresh token', t => {
  t.plan(3)
  const tm = makeManager()
  const pastExp = Math.floor(Date.now() / 1000) - 3600
  tm.tokens.accessToken = makeJwt(pastExp)
  tm.tokens.refreshToken = null
  tm.tokens.expiresAt = null

  const status = tm.getTokenStatus()
  t.equal(status.status, 'expired', 'expired + no refresh → status = expired')
  t.equal(status.hasTokens, true)
  t.equal(status.isValid, false)
})

test('TokenManager — getTokenStatus reports valid when refresh token is available', t => {
  t.plan(1)
  const tm = makeManager()
  const pastExp = Math.floor(Date.now() / 1000) - 3600
  tm.tokens.accessToken = makeJwt(pastExp)
  tm.tokens.refreshToken = 'rt_1' // recoverable
  tm.tokens.expiresAt = null

  const status = tm.getTokenStatus()
  t.equal(status.status, 'valid', 'expired but recoverable → still valid for UI')
})

test('TokenManager — getTokenStatus reports missing when no token at all', t => {
  t.plan(1)
  const tm = makeManager()
  // accessToken starts null from constructor

  const status = tm.getTokenStatus()
  t.equal(status.status, 'missing', 'no token → status = missing')
})

test('TokenManager — ensureValidToken clears stale JWT and fires onTokenExpired', async t => {
  t.plan(3)
  let expiredFired = false
  const tm = new TokenManager({
    storageType: 'memory',
    onTokenExpired: () => { expiredFired = true }
  })
  const pastExp = Math.floor(Date.now() / 1000) - 3600
  tm.tokens.accessToken = makeJwt(pastExp)
  tm.tokens.refreshToken = null
  tm.tokens.expiresAt = null

  const result = await tm.ensureValidToken()
  t.equal(result, null, 'returns null when expired + unrecoverable')
  t.equal(tm.tokens.accessToken, null, 'stale token cleared from memory')
  t.equal(expiredFired, true, 'onTokenExpired callback fired so shell can prompt re-login')
})
