// A bare project key can name several owners' projects. Since server
// 736d2d755 the 1-seg by-key routes answer such a key
//   409 { error: 'ambiguous_key', candidates: [{ owner, key }] }
// and never pick one. The key methods throw ONE structured error for it —
// `code: 'ambiguous_key'`, `status: 409`, `key`, `candidates` — so a caller
// can show the candidates instead of reading "Failed to get project by key:
// Project key matches more than one project" with nothing to act on.
//
// The REAL BaseService._request runs against a stubbed global fetch, so the
// error chain is the one the wrappers actually receive.

import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

const CANDIDATES = [
  { owner: 'acme', key: 'fly' },
  { owner: 'globex', key: 'fly' }
]

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_trackServiceError').returns(undefined)
  return svc
}

const respond409 = () => {
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves({
    ok: false,
    status: 409,
    statusText: 'Conflict',
    json: async () => ({
      error: 'ambiguous_key',
      message: 'Project key matches more than one project',
      candidates: CANDIDATES
    })
  })
  return fetchStub
}

const assertAmbiguous = (t, err) => {
  t.equal(err?.code, 'ambiguous_key', 'code ambiguous_key')
  t.equal(err?.status, 409, 'status 409')
  t.equal(err?.key, 'fly', 'the bare key')
  t.deepEqual(err?.candidates, CANDIDATES, 'the candidates, as the server named them')
  t.match(err?.message || '', /acme\/fly, globex\/fly/, 'the message names them too')
}

for (const [name, call] of [
  ['getProjectByKey', (svc) => svc.getProjectByKey('fly')],
  ['getProjectDataByKey', (svc) => svc.getProjectDataByKey('fly')],
  ['getProjectComponentsByKey', (svc) => svc.getProjectComponentsByKey('fly')],
  ['getProjectFunctionsByKey', (svc) => svc.getProjectFunctionsByKey('fly')],
  ['getProjectPagesByKey', (svc) => svc.getProjectPagesByKey('fly')],
  // The public reads (server: the public by-key routes answer the same 409
  // once features.ambiguousKeyRefusal is ON). They returned null / threw a
  // plain "Failed to …" for it.
  ['getPublicProjectDataByKey', (svc) => svc.getPublicProjectDataByKey('fly', { envKey: 'production' })],
  [
    'unlockPublicProjectDataByKey',
    (svc) => svc.unlockPublicProjectDataByKey('fly', { envKey: 'production', password: 'h' })
  ]
]) {
  test(`${name} — a shared bare key throws the structured ambiguous_key error`, async (t) => {
    const svc = makeService()
    respond409()
    try {
      await call(svc)
      t.fail('resolved')
    } catch (err) {
      assertAmbiguous(t, err)
    } finally {
      sandbox.restore()
      t.end()
    }
  })
}

test('getProjectByKey — { owner, key } takes the 2-seg route', async (t) => {
  const svc = makeService()
  const fetchStub = sandbox.stub(globalThis, 'fetch').resolves({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { _id: 'p1', key: 'fly' } })
  })
  try {
    const out = await svc.getProjectByKey({ owner: 'acme', key: 'fly' })
    t.equal(out._id, 'p1')
    t.match(String(fetchStub.firstCall.args[0]), /\/core\/projects\/key\/acme\/fly$/)
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getProjectByKey — any other failure keeps its old message (control)', async (t) => {
  const svc = makeService()
  sandbox.stub(globalThis, 'fetch').resolves({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: async () => ({ error: 'project_unavailable' })
  })
  try {
    await svc.getProjectByKey('nope')
    t.fail('resolved')
  } catch (err) {
    t.notEqual(err.code, 'ambiguous_key')
    t.match(err.message, /^Failed to get project by key:/)
  } finally {
    sandbox.restore()
    t.end()
  }
})
