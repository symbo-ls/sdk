// Review probe (sdk 422b54c): confirmRegistration with a REAL TokenManager.
import test from 'tape'
import sinon from 'sinon'
import { AuthService } from '../../AuthService.js'
import { TokenManager } from '../../../utils/TokenManager.js'

const mk = () => {
  const tm = new TokenManager({ storageType: 'memory', autoRefresh: false })
  const svc = new AuthService()
  svc._tokenManager = tm
  return { svc, tm }
}

test('P1 previous user A session; B confirm answer WITH refreshToken -> no A token left', async t => {
  const { svc, tm } = mk()
  tm.setTokens({ access_token: 'accA', refresh_token: 'refA' })
  svc._currentUser = { id: 'A' }
  sinon.stub(svc, '_request').resolves({ success: true, data: { user: { id: 'B' }, tokens: { accessToken: 'accB', refreshToken: 'refB' } } })
  await svc.confirmRegistration('t')
  console.log(`RESULT P1 access=${tm.getAccessToken()} refresh=${tm.tokens.refreshToken} cached=${JSON.stringify(svc._currentUser)}`)
  t.equal(tm.getAccessToken(), 'accB'); t.equal(tm.tokens.refreshToken, 'refB'); t.equal(svc._currentUser, null)
  t.end()
})

test('P2 previous user A session; B answer WITHOUT refreshToken -> A refresh token must not survive', async t => {
  const { svc, tm } = mk()
  tm.setTokens({ access_token: 'accA', refresh_token: 'refA' })
  sinon.stub(svc, '_request').resolves({ success: true, data: { tokens: { accessToken: 'accB' } } })
  await svc.confirmRegistration('t')
  console.log(`RESULT P2 access=${tm.getAccessToken()} refresh=${tm.tokens.refreshToken}`)
  t.notEqual(tm.tokens.refreshToken, 'refA', 'A refresh token paired with B access token')
  t.end()
})

test('P3 failed confirm (throws) keeps the existing session untouched', async t => {
  const { svc, tm } = mk()
  tm.setTokens({ access_token: 'accA', refresh_token: 'refA' })
  sinon.stub(svc, '_request').rejects(Object.assign(new Error('bad'), { status: 400 }))
  try { await svc.confirmRegistration('t') } catch {}
  console.log(`RESULT P3 access=${tm.getAccessToken()}`)
  t.equal(tm.getAccessToken(), 'accA')
  t.end()
})
