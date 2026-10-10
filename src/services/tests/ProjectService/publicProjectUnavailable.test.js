// CORE-PUBLIC-PROJECT-NO-EXISTENCE-ORACLE-1 — the SDK side.
//
// The server's anonymous project routes no longer tell a private project from
// a missing one: a caller with no read access gets
//   404 { error: 'project_unavailable' }
// for both (server branch core/public-project-no-existence-oracle). The public
// wrappers must read that as "no public data here", the way they read
// not_public / project_not_found / env_not_found, and never throw: the
// preview's env-fallback chain advances on null, and a throw breaks the page.
//
// These cases run the REAL BaseService._request against a stubbed global
// fetch, so the error envelope is the one the wrappers actually receive.

import test from 'tape'
import sinon from 'sinon'
import { ProjectService } from '../../ProjectService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new ProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_trackServiceError').returns(undefined)
  return svc
}

const respond = (status, body) => {
  sandbox.stub(globalThis, 'fetch').resolves({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: async () => body
  })
}

const UNAVAILABLE = { error: 'project_unavailable' }

test('getPublicProjectDataByKey — 404 project_unavailable returns null, no throw', async (t) => {
  const svc = makeService()
  respond(404, UNAVAILABLE)
  try {
    const out = await svc.getPublicProjectDataByKey(
      { owner: 'acme', key: 'secret' },
      { envKey: 'production' }
    )
    t.equal(out, null, 'null lets the preview env chain advance')
  } catch (err) {
    t.fail(`threw: ${err.message}`)
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getPublicProjectDataByKey — the old codes still return null (control)', async (t) => {
  for (const code of ['not_public', 'project_not_found', 'env_not_found']) {
    const svc = makeService()
    respond(code === 'not_public' ? 403 : 404, { error: code })
    try {
      const out = await svc.getPublicProjectDataByKey('k', { envKey: 'production' })
      t.equal(out, null, `${code} → null`)
    } catch (err) {
      t.fail(`${code} threw: ${err.message}`)
    } finally {
      sandbox.restore()
    }
  }
  t.end()
})

test('getPublicProjectDataByKey — password_required still throws its coded error (control)', async (t) => {
  const svc = makeService()
  respond(401, { error: 'password_required', visibility: 'password-protected' })
  try {
    await svc.getPublicProjectDataByKey('k', { envKey: 'production' })
    t.fail('did not throw')
  } catch (err) {
    t.equal(err.code, 'password_required')
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getPublicProjectDataByKey — an unknown error code still throws (control)', async (t) => {
  const svc = makeService()
  respond(500, { error: 'boom' })
  try {
    await svc.getPublicProjectDataByKey('k', { envKey: 'production' })
    t.fail('did not throw')
  } catch (err) {
    t.match(err.message, /Failed to get public project data by key/)
  } finally {
    sandbox.restore()
    t.end()
  }
})

test('getPublicProjectVisibility — 404 project_unavailable returns null without a probe-failed warning', async (t) => {
  const svc = makeService()
  respond(404, UNAVAILABLE)
  // `logger.warn` is a getter that hands out console.warn only in debug mode,
  // so debug is switched on and console.warn itself is watched.
  const { setDebug } = await import('../../../utils/logger.js')
  setDebug(true)
  const warn = sandbox.stub(console, 'warn')
  try {
    const out = await svc.getPublicProjectVisibility({ owner: 'acme', key: 'secret' })
    t.equal(out, null, 'not available → null')
    t.equal(warn.called, false, 'an expected answer is not logged as a backend failure')
  } catch (err) {
    t.fail(`threw: ${err.message}`)
  } finally {
    setDebug(false)
    sandbox.restore()
    t.end()
  }
})

// Positive control for the warning probe above: an outage IS still logged.
test('getPublicProjectVisibility — a 500 still returns null and IS logged (control)', async (t) => {
  const svc = makeService()
  respond(500, { error: 'boom' })
  const { setDebug } = await import('../../../utils/logger.js')
  setDebug(true)
  const warn = sandbox.stub(console, 'warn')
  try {
    const out = await svc.getPublicProjectVisibility('k')
    t.equal(out, null)
    t.equal(warn.called, true, 'the probe sees a warning when one is written')
  } finally {
    setDebug(false)
    sandbox.restore()
    t.end()
  }
})

test('unlockPublicProjectDataByKey — 404 project_unavailable returns null, no throw', async (t) => {
  const svc = makeService()
  respond(404, UNAVAILABLE)
  try {
    const out = await svc.unlockPublicProjectDataByKey(
      { owner: 'acme', key: 'secret' },
      { envKey: 'production', password: 'a'.repeat(64) }
    )
    t.equal(out, null, 'not available → null, the caller re-prompts or gives up')
  } catch (err) {
    t.fail(`threw: ${err.message}`)
  } finally {
    sandbox.restore()
    t.end()
  }
})
