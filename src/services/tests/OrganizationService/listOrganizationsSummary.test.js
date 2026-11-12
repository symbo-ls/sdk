// listOrganizations({ summary: true }) → GET /organizations?view=summary — the
// opt-in small org list (server OrganizationController._listOrganizationsSummary;
// perf report 2026-11-12: the full list measured 561 KB decoded). The URL is
// asserted literally: the drift analyzer only sees template literals AT the
// `_request` call site.

import test from 'tape'
import sinon from 'sinon'
import { OrganizationService } from '../../OrganizationService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new OrganizationService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('listOrganizations() — no argument: the full list, path unchanged', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [{ slug: 'a', members: [] }] })
  const out = await svc.listOrganizations()
  t.equal(req.firstCall.args[0], '/organizations', 'no query string')
  t.equal(req.firstCall.args[1].method, 'GET')
  t.deepEqual(out, [{ slug: 'a', members: [] }], 'envelope unwrapped, as before')
  sandbox.restore()
  t.end()
})

test('listOrganizations({ summary: true }) — GET /organizations?view=summary', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [{ slug: 'a', memberCount: 2 }] })
  const out = await svc.listOrganizations({ summary: true })
  t.equal(req.firstCall.args[0], '/organizations?view=summary')
  t.equal(req.firstCall.args[1].methodName, 'listOrganizations')
  t.deepEqual(out, [{ slug: 'a', memberCount: 2 }])
  sandbox.restore()
  t.end()
})

test('listOrganizations({ summary: false }) — the full list', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [] })
  await svc.listOrganizations({ summary: false })
  t.equal(req.firstCall.args[0], '/organizations')
  sandbox.restore()
  t.end()
})
