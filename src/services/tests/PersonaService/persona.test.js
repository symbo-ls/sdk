// PersonaService unit tests (tickets/sonnet.md PERSONA-4).
//
// Pins the SHIPPED server contract (server 886a9b27) — persona claim
// strictly { role, sid, startedAt }, target roles admin/editor/viewer/guest,
// role simulation ONLY — plus the ticket's own acceptance cases: double-end,
// end-after-expiry, and the promise-not-boolean trap. The invariant tests
// assert the NEGATIVE: no argument capable of naming a user ever reaches the
// network.
import test from 'tape'
import sinon from 'sinon'
import { PersonaService, PERSONA_TARGET_ROLES } from '../../PersonaService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { createTokenManager } from '../../../utils/TokenManager.js'
import { rootBus } from '../../../state/rootEventBus.js'

const sandbox = sinon.createSandbox()

// ── fixtures ─────────────────────────────────────────────────────────────────

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const makeJwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`

const PERSONA_CLAIM = { role: 'viewer', sid: 'ps_1', startedAt: 1755000000 }
const personaJwt = makeJwt({ sub: 'admin1', persona: PERSONA_CLAIM })
const cleanJwt = makeJwt({ sub: 'admin1' })

// Minimal TokenManager double mirroring the real preserve semantics
// (refresh_token omitted/null keeps the stored refresh token). The real
// class is exercised separately below to pin that contract at the source.
const fakeTm = (initialToken, { refreshToken = 'rt_admin' } = {}) => {
  const tm = {
    access: initialToken,
    refresh: refreshToken,
    setTokensCalls: [],
    getAccessToken: () => tm.access,
    hasRefreshToken: () => !!tm.refresh,
    setTokens (td) {
      tm.setTokensCalls.push(td)
      tm.access = td.access_token
      if (td.refresh_token) tm.refresh = td.refresh_token
      return td
    },
    refreshTokens: async () => {
      throw new Error('refreshTokens not stubbed for this test')
    }
  }
  return tm
}

const makeService = (token, tmOpts) => {
  const svc = new PersonaService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._tokenManager = fakeTm(token, tmOpts)
  return svc
}

// rootBus replays the last payload to late subscribers — capture from a
// baseline index so a previous test's emission never leaks into assertions.
const captureEvents = () => {
  const events = []
  const handler = (p) => events.push(p)
  rootBus.on('sdk.personaChanged', handler)
  const baseline = events.length
  return {
    since: () => events.slice(baseline),
    stop: () => rootBus.off('sdk.personaChanged', handler)
  }
}

// ── registry ─────────────────────────────────────────────────────────────────

test('SERVICE_METHODS maps startPersona/endPersona/getPersona → persona', (t) => {
  t.plan(3)
  t.equal(SERVICE_METHODS.startPersona, 'persona')
  t.equal(SERVICE_METHODS.endPersona, 'persona')
  t.equal(SERVICE_METHODS.getPersona, 'persona')
  t.end()
})

test('PERSONA_TARGET_ROLES mirrors the server enum — four tiers, owner excluded', (t) => {
  t.plan(2)
  t.deepEqual([...PERSONA_TARGET_ROLES], ['admin', 'editor', 'viewer', 'guest'])
  t.notOk(PERSONA_TARGET_ROLES.includes('owner'), 'owner is never a persona target')
  t.end()
})

// ── startPersona ─────────────────────────────────────────────────────────────

test('startPersona({ role }) POSTs /persona/start and adopts the persona token', async (t) => {
  const svc = makeService(cleanJwt)
  const payload = { persona: PERSONA_CLAIM, accessToken: personaJwt }
  const stub = sandbox.stub(svc, '_call').resolves(payload)
  const cap = captureEvents()

  const data = await svc.startPersona({ role: 'viewer' })

  const [methodName, path, init] = stub.firstCall.args
  t.equal(methodName, 'startPersona', 'method name matches SERVICE_METHODS entry')
  t.equal(path, '/persona/start', 'canonical start route')
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, { role: 'viewer' }, 'body is { role } — nothing else')
  t.deepEqual(data, payload, 'server payload returned verbatim')
  t.equal(svc._tokenManager.access, personaJwt, 'persona access token adopted')
  const evts = cap.since()
  t.equal(evts.length, 1, 'one sdk.personaChanged emission')
  t.equal(evts[0].previous, null, 'previous persona was null')
  t.deepEqual(evts[0].persona, PERSONA_CLAIM, 'event carries the new persona')

  cap.stop()
  sandbox.restore()
  t.end()
})

test('startPersona adoption PRESERVES the admin refresh token (real TokenManager)', async (t) => {
  // The refresh token is the admin's persona-free credential — losing it on
  // persona adoption would break endPersona's local escape hatch. Pinned
  // against the REAL TokenManager (memory storage in Node), not the double.
  const tm = createTokenManager({ apiUrl: 'http://api.test' })
  tm.setTokens({ access_token: cleanJwt, refresh_token: 'rt_admin_real' })

  const svc = new PersonaService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  svc._tokenManager = tm
  sandbox.stub(svc, '_call').resolves({ persona: PERSONA_CLAIM, accessToken: personaJwt })

  await svc.startPersona({ role: 'viewer' })

  t.equal(tm.getAccessToken(), personaJwt, 'access token is now the persona token')
  t.equal(tm.getRefreshToken(), 'rt_admin_real', 'admin refresh token preserved through adoption')

  tm.destroy()
  sandbox.restore()
  t.end()
})

test('startPersona requires a role', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.startPersona({})
    t.fail('should have rejected')
  } catch (err) {
    t.match(err.message, /requires a role/, 'clear missing-role message')
  }
  t.ok(stub.notCalled, 'no network call on validation failure')
  sandbox.restore()
  t.end()
})

test('startPersona rejects owner — structurally excluded, not just invalid', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.startPersona({ role: 'owner' })
    t.fail('should have rejected')
  } catch (err) {
    t.match(err.message, /structurally excluded/, 'owner-specific message')
  }
  t.ok(stub.notCalled, 'no network call')
  sandbox.restore()
  t.end()
})

test('startPersona rejects roles outside the server enum', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  for (const role of ['manager', 'member', 'searcher']) {
    try {
      await svc.startPersona({ role })
      t.fail(`'${role}' should have been rejected`)
    } catch (err) {
      t.match(err.message, /admin, editor, viewer, guest/, `'${role}' rejected with the real enum listed`)
    }
  }
  t.ok(stub.notCalled, 'no network calls')
  sandbox.restore()
  t.end()
})

test('INVARIANT: startPersona refuses any argument capable of naming a user — before any network', async (t) => {
  // "The persona resolver must have no parameter capable of naming a user."
  // (Nika, 2026-08-11.) This is the class of thing that silently regresses,
  // so the negative is asserted key by key.
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  const attempts = [
    { type: 'user', id: 'u_123' },
    { role: 'viewer', userId: 'u_123' },
    { role: 'viewer', user: { id: 'u_123' } },
    { role: 'viewer', memberId: 'm_9' },
    { role: 'viewer', email: 'natia@example.com' },
    { role: 'viewer', sub: 'u_123' }
  ]
  for (const args of attempts) {
    try {
      await svc.startPersona(args)
      t.fail(`should have rejected: ${JSON.stringify(args)}`)
    } catch (err) {
      t.match(err.message, /never name a user/, `refused: ${JSON.stringify(args)}`)
    }
  }
  t.ok(stub.notCalled, 'not one of them reached the network')
  sandbox.restore()
  t.end()
})

test('startPersona rejects the legacy { type: "role", id } shape with a migration message', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  try {
    await svc.startPersona({ type: 'role', id: 'viewer' })
    t.fail('should have rejected')
  } catch (err) {
    t.match(err.message, /pass \{ role: '<role>' \}/, 'points at the role-only shape')
  }
  t.ok(stub.notCalled, 'no network call')
  sandbox.restore()
  t.end()
})

test('startPersona rejects non-object arguments', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  for (const bad of ['viewer', null, ['viewer']]) {
    try {
      await svc.startPersona(bad)
      t.fail('should have rejected')
    } catch (err) {
      t.match(err.message, /startPersona\(\{ role \}\)|requires a role/, 'rejected with usage hint')
    }
  }
  t.ok(stub.notCalled, 'no network calls')
  sandbox.restore()
  t.end()
})

// ── getPersona ───────────────────────────────────────────────────────────────

test('TRAP: getPersona() returns a Promise — always truthy unawaited, null only when awaited', async (t) => {
  // Every flat sdk.* method resolves through the init gate as a Promise, so
  // `if (sdk.getPersona())` is ALWAYS truthy (workspace a0a81ea6). Pinned
  // here so the trap is documented at the source.
  const svc = makeService(cleanJwt)
  const p = svc.getPersona()
  t.equal(typeof p.then, 'function', 'returns a thenable')
  t.ok(p, 'the unawaited return value is truthy even with NO persona active')
  t.equal(await p, null, 'the RESOLVED value is null — always await it')
  sandbox.restore()
  t.end()
})

test('getPersona decodes the active persona claim from the access token', async (t) => {
  const svc = makeService(personaJwt)
  const persona = await svc.getPersona()
  t.deepEqual(persona, PERSONA_CLAIM, 'claim decoded { role, sid, startedAt }')
  sandbox.restore()
  t.end()
})

test('getPersona is null with no token, a non-JWT token, or a persona-free claimset', async (t) => {
  t.equal(await makeService(null).getPersona(), null, 'no token')
  t.equal(await makeService('opaque-token').getPersona(), null, 'not a JWT')
  t.equal(await makeService(cleanJwt).getPersona(), null, 'JWT without persona claim')
  sandbox.restore()
  t.end()
})

test('getPersona is PERMISSIVE about malformed claim shapes — exit affordance must still see it', async (t) => {
  // Same fail direction as the exit pill: a malformed-but-present claim
  // reads as "persona active" so the way out renders; the server fails the
  // actual requests closed regardless (886a9b27).
  const svc = makeService(makeJwt({ sub: 'admin1', persona: { weird: true } }))
  const persona = await svc.getPersona()
  t.ok(persona, 'truthy for any object-shaped claim')
  t.equal(persona.role, null, 'missing role normalized to null, not undefined')
  t.equal(persona.sid, null, 'missing sid normalized to null')
  sandbox.restore()
  t.end()
})

// ── endPersona ───────────────────────────────────────────────────────────────

test('endPersona with no active persona resolves ok with ZERO network traffic', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  const result = await svc.endPersona()
  t.deepEqual(
    result,
    { ok: true, wasActive: false, endedRemotely: false, restored: false, persona: null },
    'pure idempotent no-op'
  )
  t.ok(stub.notCalled, 'no network call')
  sandbox.restore()
  t.end()
})

test('endPersona POSTs /persona/end, adopts the clean token, emits persona:null', async (t) => {
  const svc = makeService(personaJwt)
  const stub = sandbox.stub(svc, '_call').resolves({ accessToken: cleanJwt })
  const cap = captureEvents()

  const result = await svc.endPersona()

  const [methodName, path, init] = stub.firstCall.args
  t.equal(methodName, 'endPersona', 'method name matches SERVICE_METHODS entry')
  t.equal(path, '/persona/end', 'canonical end route')
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, {}, 'empty body — the session is named by the token itself')
  t.deepEqual(
    result,
    { ok: true, wasActive: true, endedRemotely: true, restored: true, persona: null },
    'full success shape'
  )
  t.equal(svc._tokenManager.access, cleanJwt, 'clean token adopted')
  const evts = cap.since()
  t.equal(evts.length, 1, 'one emission')
  t.deepEqual(evts[0], { previous: PERSONA_CLAIM, persona: null }, 'event announces the exit')

  cap.stop()
  sandbox.restore()
  t.end()
})

test('double-end: the second endPersona is an ok no-op with no second network call', async (t) => {
  const svc = makeService(personaJwt)
  const stub = sandbox.stub(svc, '_call').resolves({ accessToken: cleanJwt })

  const first = await svc.endPersona()
  t.equal(first.ok, true, 'first end ok')
  const second = await svc.endPersona()
  t.equal(second.ok, true, 'second end still ok — idempotent')
  t.equal(second.wasActive, false, 'nothing was active the second time')
  t.equal(stub.callCount, 1, 'the network was hit exactly once')

  sandbox.restore()
  t.end()
})

test('end-after-expiry: server 410 still succeeds — claim shed via token refresh', async (t) => {
  const svc = makeService(personaJwt)
  const gone = new Error('persona session invalid or ended')
  gone.status = 410
  sandbox.stub(svc, '_call').rejects(gone)
  svc._tokenManager.refreshTokens = sandbox.stub().callsFake(async () => {
    svc._tokenManager.access = cleanJwt
  })

  const result = await svc.endPersona()

  t.equal(result.ok, true, 'expired session end succeeds')
  t.equal(result.endedRemotely, true, '410 counts as already-ended, not a failure')
  t.equal(result.restored, true, 'clean token obtained via refresh')
  t.ok(svc._tokenManager.refreshTokens.calledOnce, 'refresh path used')
  t.equal(await svc.getPersona(), null, 'persona claim gone')

  sandbox.restore()
  t.end()
})

test('endPersona survives a dead server: 500 + working refresh → ok, endedRemotely false', async (t) => {
  const svc = makeService(personaJwt)
  const boom = new Error('internal')
  boom.status = 500
  sandbox.stub(svc, '_call').rejects(boom)
  svc._tokenManager.refreshTokens = sandbox.stub().callsFake(async () => {
    svc._tokenManager.access = cleanJwt
  })

  const result = await svc.endPersona()

  t.equal(result.ok, true, 'locally exited')
  t.equal(result.endedRemotely, false, 'honest: the server never acknowledged')
  t.equal(result.restored, true, 'clean token via refresh')

  sandbox.restore()
  t.end()
})

test('endPersona NEVER rejects — total failure resolves { ok: false } honestly', async (t) => {
  // Server unreachable AND token unrefreshable: the persona is genuinely
  // still in force, so ok:false (resolved, not rejected) keeps the exit
  // affordance visible instead of dropping the banner over a live lens.
  const svc = makeService(personaJwt)
  const boom = new Error('network down')
  boom.status = 503
  sandbox.stub(svc, '_call').rejects(boom)
  svc._tokenManager.refreshTokens = sandbox.stub().rejects(new Error('offline'))

  const result = await svc.endPersona()

  t.equal(result.ok, false, 'exit did NOT take effect — reported, not hidden')
  t.equal(result.wasActive, true)
  t.equal(result.restored, false)
  t.deepEqual(result.persona, PERSONA_CLAIM, 'the still-active claim is surfaced')
  t.match(result.error, /still active/, 'error explains the state')

  sandbox.restore()
  t.end()
})

test('endPersona falls back to refresh when the server acks without minting a token', async (t) => {
  const svc = makeService(personaJwt)
  sandbox.stub(svc, '_call').resolves({})
  svc._tokenManager.refreshTokens = sandbox.stub().callsFake(async () => {
    svc._tokenManager.access = cleanJwt
  })

  const result = await svc.endPersona()

  t.equal(result.ok, true)
  t.equal(result.endedRemotely, true)
  t.equal(result.restored, true, 'refresh supplied the clean token')
  t.ok(svc._tokenManager.refreshTokens.calledOnce)

  sandbox.restore()
  t.end()
})

test('endPersona never rejects even on an unexpected internal error', async (t) => {
  const svc = makeService(personaJwt)
  svc._decodePersonaClaim = () => {
    throw new Error('unexpected decode explosion')
  }
  const result = await svc.endPersona()
  t.equal(result.ok, false, 'resolved with ok:false')
  t.match(result.error, /unexpected decode explosion/, 'error captured, not thrown')
  sandbox.restore()
  t.end()
})

// ── scope-switch hooks ───────────────────────────────────────────────────────

test('switchWorkspace/switchOrg hooks end an active persona (cross-tenant sids are rejected server-side)', async (t) => {
  const svc = makeService(personaJwt)
  sandbox.stub(svc, '_call').resolves({ accessToken: cleanJwt })
  const endSpy = sandbox.spy(svc, 'endPersona')

  await svc.switchWorkspace('ws_next', 'ws_prev')
  t.ok(endSpy.calledOnce, 'active persona ended on workspace switch')

  const svc2 = makeService(personaJwt)
  sandbox.stub(svc2, '_call').resolves({ accessToken: cleanJwt })
  const endSpy2 = sandbox.spy(svc2, 'endPersona')
  await svc2.switchOrg('org_next', 'org_prev')
  t.ok(endSpy2.calledOnce, 'active persona ended on org switch')

  sandbox.restore()
  t.end()
})

test('switch hooks are pure no-ops without an active persona — zero network', async (t) => {
  const svc = makeService(cleanJwt)
  const stub = sandbox.stub(svc, '_call').resolves({})
  const endSpy = sandbox.spy(svc, 'endPersona')

  await svc.switchWorkspace('ws_next', 'ws_prev')
  await svc.switchOrg('org_next', 'org_prev')

  t.ok(endSpy.notCalled, 'endPersona not invoked')
  t.ok(stub.notCalled, 'no network call')
  sandbox.restore()
  t.end()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
