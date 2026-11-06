import test from 'tape'
import sinon from 'sinon'
import { PublicOnboardingService } from '../../PublicOnboardingService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// CORE-ONBOARDING-SELF-JOIN-1 — the SDK half of /core/onboarding/options,
// /request and /join. Pins: the literal endpoints and bodies, the anonymous
// (no bearer) rule for options/request and the signed-in rule for join,
// the server's error code surfaced as `.code`, the short names, and the flat
// proxies.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new PublicOnboardingService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('getOnboardingOptions GETs /onboarding/options with the encoded scope', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ enabled: true, roles: [] })
  const res = await svc.getOnboardingOptions('bellforge/new-dashboard')
  t.equal(stub.firstCall.args[0], '/onboarding/options?workspace=bellforge%2Fnew-dashboard')
  t.equal(stub.firstCall.args[1].method, 'GET')
  t.equal(stub.firstCall.args[1].methodName, 'getOnboardingOptions')
  t.deepEqual(res, { enabled: true, roles: [] }, 'bare payload returned as it came')
  sandbox.restore()
  t.end()
})

test('getOnboardingOptions requires a scope', async (t) => {
  const svc = makeService()
  try {
    await svc.getOnboardingOptions('')
    t.fail('should throw')
  } catch (err) {
    t.match(err.message, /scope is required/)
  }
  sandbox.restore()
  t.end()
})

test('requestOnboarding POSTs only the known fields', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ ok: true, emailSent: true })
  await svc.requestOnboarding({
    workspace: 'ws_abc',
    email: 'a@b.test',
    role: 'investor',
    name: 'Ann',
    captchaToken: 'cap',
    extra: 'dropped'
  })
  t.equal(stub.firstCall.args[0], '/onboarding/request')
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), {
    workspace: 'ws_abc',
    email: 'a@b.test',
    role: 'investor',
    name: 'Ann',
    captchaToken: 'cap'
  })
  sandbox.restore()
  t.end()
})

test('joinOnboarding POSTs { workspace, role, consent } and stamps consent.at', async (t) => {
  const svc = makeService()
  const answer = { ok: true, joined: true, alreadyMember: false, role: 'editor' }
  const stub = sandbox.stub(svc, '_request').resolves(answer)
  const res = await svc.joinOnboarding({
    workspace: 'ws_abc',
    role: 'searcher',
    consent: { terms: true, privacy: true }
  })
  t.equal(stub.firstCall.args[0], '/onboarding/join')
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.equal(stub.firstCall.args[1].methodName, 'joinOnboarding')
  const body = JSON.parse(stub.firstCall.args[1].body)
  t.equal(body.workspace, 'ws_abc')
  t.equal(body.role, 'searcher')
  t.equal(body.consent.terms, true)
  t.equal(body.consent.privacy, true)
  t.ok(!Number.isNaN(Date.parse(body.consent.at)), 'consent.at defaults to an ISO time')
  t.deepEqual(res, answer)
  sandbox.restore()
  t.end()
})

test('joinOnboarding: consent values are strict booleans, a caller time is kept', async (t) => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ ok: true })
  await svc.joinOnboarding({
    workspace: 'w',
    role: 'r',
    consent: { terms: 'yes', privacy: true, at: '2026-11-06T07:00:00.000Z' }
  })
  const body = JSON.parse(stub.firstCall.args[1].body)
  t.equal(body.consent.terms, false, 'a truthy string is not consent')
  t.equal(body.consent.at, '2026-11-06T07:00:00.000Z')
  await svc.joinOnboarding({ workspace: 'w', role: 'r' })
  t.notOk('consent' in JSON.parse(stub.secondCall.args[1].body), 'no consent → no key')
  sandbox.restore()
  t.end()
})

test('a server refusal throws with .code = the server error code and .status', async (t) => {
  const svc = makeService()
  const err = new Error('Please accept the terms and the privacy policy to join.', {
    cause: { error: 'consent_required', message: '…' }
  })
  err.status = 400
  sandbox.stub(svc, '_request').rejects(err)
  try {
    await svc.join({ workspace: 'w', role: 'r' })
    t.fail('should throw')
  } catch (e) {
    t.equal(e.code, 'consent_required')
    t.equal(e.status, 400)
  }
  sandbox.restore()
  t.end()
})

test('short names call the same methods', async (t) => {
  const svc = makeService()
  const opt = sandbox.stub(svc, 'getOnboardingOptions').resolves('o')
  const req = sandbox.stub(svc, 'requestOnboarding').resolves('r')
  const join = sandbox.stub(svc, 'joinOnboarding').resolves('j')
  t.equal(await svc.options('s'), 'o')
  t.equal(await svc.request({ a: 1 }), 'r')
  t.equal(await svc.join({ b: 2 }), 'j')
  t.equal(opt.firstCall.args[0], 's')
  t.deepEqual(req.firstCall.args[0], { a: 1 })
  t.deepEqual(join.firstCall.args[0], { b: 2 })
  sandbox.restore()
  t.end()
})

test('options + request are anonymous (no bearer); join is signed in', (t) => {
  const base = new BaseService()
  t.equal(base._requiresInit('getOnboardingOptions'), false)
  t.equal(base._requiresInit('requestOnboarding'), false)
  t.equal(base._requiresInit('joinOnboarding'), true)
  t.end()
})

test('flat proxies route to the onboarding service', (t) => {
  t.equal(SERVICE_METHODS.getOnboardingOptions, 'onboarding')
  t.equal(SERVICE_METHODS.requestOnboarding, 'onboarding')
  t.equal(SERVICE_METHODS.joinOnboarding, 'onboarding')
  t.end()
})
