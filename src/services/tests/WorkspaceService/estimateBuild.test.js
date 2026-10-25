// estimateBuild(workspaceId, body) — POST /core/workspaces/:id/build-estimate
// (server CORE-EST, S1-API.md "CORE-EST — build estimate"): the price of a
// builder turn BEFORE it is sent, so a client never guesses "enough". The
// server contract (server src/domains/workspaces/routes/workspaces.js,
// BuildEstimateController / BuildEstimateService and their live HTTP test):
//
//   - a member of the workspace (requireAuth + the member gate: anyone else
//     gets 404 `workspace_not_found`), so the SDK attaches the session;
//   - the body IS the builder turn's body (content, context.surface
//     'add-app-builder', modelMode, targetAgentId, attachments) plus
//     `conversationId` for an existing thread — in the POST body only, never
//     in the URL; the server never logs, stores or echoes it;
//   - the answer, enveloped `{ success: true, data }`:
//       { surface, step: { full, min }, build: null, basis: 'first-step-only',
//         balance, waived, waiver, allocationExceeded, canStart, enough }
//   - 400 `unknown_surface` when the body is not a builder turn's.
//
// Fixtures only: no network is touched (globalThis.fetch is replaced per test).
import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { TokenManager } from '../../../utils/TokenManager.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  svc._requireReady = () => {}
  return svc
}

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return impl(url, init)
  }
  try {
    await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

// The builder turn's body, as the shell sends it for a NEW build.
const ASK = 'Build me a booking app for my salon'
const BODY = {
  content: ASK,
  modelMode: 'auto',
  context: {
    surface: 'add-app-builder',
    extensionProjectId: null,
    pickedElements: null,
    targetAgentId: null,
    targetAgentName: null,
    uiLanguage: 'en'
  }
}

const ESTIMATE = {
  surface: 'add-app-builder',
  step: { full: 250, min: 192 },
  build: null,
  basis: 'first-step-only',
  balance: 100,
  waived: false,
  waiver: null,
  allocationExceeded: false,
  canStart: false,
  enough: false
}

test('estimateBuild is a method of the workspace service, flat-exposed by the SDK', t => {
  t.plan(2)
  t.equal(typeof new WorkspaceService().estimateBuild, 'function', 'WorkspaceService.estimateBuild exists')
  t.equal(SERVICE_METHODS.estimateBuild, 'workspace', 'sdk.estimateBuild() dispatches to WorkspaceService')
})

test('estimateBuild carries the caller session (a member-gated route)', t => {
  t.plan(1)
  t.equal(new WorkspaceService()._requiresInit('estimateBuild'), true, 'the bearer token is attached')
})

test('estimateBuild POSTs /workspaces/:id/build-estimate with the turn body whole, and unwraps the answer', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: ESTIMATE })
  const body = { ...BODY, conversationId: 'c1' }
  const out = await svc.estimateBuild('w1', body)
  t.equal(req.callCount, 1, 'one request')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/workspaces/w1/build-estimate', 'the route (the SDK adds /core)')
  t.equal(opts.method, 'POST', 'a POST')
  t.equal(opts.methodName, 'estimateBuild', 'named for the init and telemetry rules')
  t.deepEqual(JSON.parse(opts.body), body, 'the body as given: nothing dropped, nothing added')
  t.notOk(endpoint.includes('salon'), 'the ask never rides the URL')
  t.deepEqual(out, ESTIMATE, 'the estimate, unwrapped from { success, data }')
  sandbox.restore()
  t.end()
})

test('estimateBuild refuses a missing workspace id or a body that is not an object, before any request', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: ESTIMATE })
  const refused = async (args, reason, label) => {
    try {
      await svc.estimateBuild(...args)
      t.fail(`${label}: should throw`)
    } catch (err) {
      t.equal(err.message, reason, `${label}: refused — ${reason}`)
    }
  }
  await refused([undefined, BODY], 'workspaceId is required', 'no workspace id')
  await refused(['', BODY], 'workspaceId is required', 'an empty workspace id')
  for (const [body, label] of [
    [undefined, 'no body'],
    [null, 'a null body'],
    [ASK, 'the ask as a bare string'],
    [42, 'a number'],
    [[BODY], 'an array']
  ]) {
    await refused(['w1', body], 'body must be an object', label)
  }
  t.equal(req.callCount, 0, 'nothing was sent')
  sandbox.restore()
  t.end()
})

test('estimateBuild surfaces a 400 unknown_surface verbatim (not a builder turn)', async t => {
  t.plan(2)
  const svc = makeService()
  const cause = {
    success: false,
    error: "The build estimate prices a builder turn: context.surface must be 'add-app-builder'.",
    code: 'unknown_surface'
  }
  sandbox.stub(svc, '_request').rejects(Object.assign(new Error(cause.error, { cause }), { status: 400 }))
  try {
    await svc.estimateBuild('w1', { content: ASK, context: { surface: 'assistant' } })
  } catch (err) {
    t.equal(err.status, 400)
    t.equal(err.cause.code, 'unknown_surface')
  }
  sandbox.restore()
  t.end()
})

test('over the real transport: <apiUrl>/core/workspaces/w1/build-estimate, a JSON POST with the bearer token; the text only in the body', async t => {
  const svc = makeService()
  svc._apiUrl = 'http://api.fixture.test'
  const tm = new TokenManager({ storageType: 'memory', apiUrl: 'http://api.fixture.test' })
  tm.setTokens({ access_token: 'fixture-access-1', refresh_token: 'fixture-refresh-1', expires_in: 3600 })
  svc._tokenManager = tm
  try {
    await withFetch(
      async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true, data: ESTIMATE })
      }),
      async calls => {
        const out = await svc.estimateBuild('w1', BODY)
        t.equal(calls.length, 1, 'one request')
        t.equal(calls[0].url, 'http://api.fixture.test/core/workspaces/w1/build-estimate', 'the full URL, no query')
        t.notOk(calls[0].url.includes('salon'), 'the ask is not in the URL')
        t.equal(String(calls[0].init.method).toUpperCase(), 'POST', 'a POST')
        const headers = calls[0].init.headers || {}
        t.equal(headers.Authorization, 'Bearer fixture-access-1', 'the session rides the request')
        t.equal(headers['Content-Type'], 'application/json', 'a JSON body')
        t.deepEqual(JSON.parse(calls[0].init.body), BODY, 'the turn body, unchanged')
        t.deepEqual(out, ESTIMATE, 'the estimate, unwrapped')
      }
    )
    await withFetch(
      async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ success: false, error: 'workspace_not_found' })
      }),
      async () => {
        try {
          await svc.estimateBuild('w2', BODY)
          t.fail('a non-member should be refused')
        } catch (err) {
          t.equal(err.status, 404, 'the member gate refuses a non-member: 404')
          t.equal(err.cause && err.cause.error, 'workspace_not_found', 'its code rides err.cause')
        }
      }
    )
  } finally {
    // The fixture session schedules a refresh timer; a live timer keeps the
    // process (and tape) running for its whole hour.
    tm.destroy()
  }
  t.end()
})
