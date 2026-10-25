import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Unit coverage for the workspace data export ("export any time") —
// five WorkspaceService methods over the server routes
// /workspaces/:workspaceId/exports[/:exportId[/download]]. Transport is
// mocked at `_request`; the server owns the gate (owner/admin, interactive
// session, requester-only download), the job runner and the signed URL.
// This suite pins the SDK's request shape, the envelope unwrap and the
// required arguments.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

const METHODS = [
  'startWorkspaceExport',
  'listWorkspaceExports',
  'getWorkspaceExport',
  'getWorkspaceExportDownloadUrl',
  'deleteWorkspaceExport'
]

test('teardown-before', t => {
  sandbox.restore()
  t.end()
})

test('export methods are flat-exposed under the workspace service', t => {
  t.plan(METHODS.length)
  for (const m of METHODS) t.equal(SERVICE_METHODS[m], 'workspace', m)
})

test('startWorkspaceExport POSTs /workspaces/:id/exports and resolves the job', async t => {
  t.plan(3)
  const svc = makeService()
  const job = { id: 'e1', status: 'queued', createdAt: '2026-10-25T16:00:00.000Z' }
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: job })
  const out = await svc.startWorkspaceExport('w1')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/workspaces/w1/exports')
  t.equal(opts.method, 'POST')
  t.deepEqual(out, job, 'unwrapped data')
  sandbox.restore()
})

test('listWorkspaceExports GETs /workspaces/:id/exports', async t => {
  t.plan(3)
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: [{ id: 'e1' }] })
  const out = await svc.listWorkspaceExports('w1')
  const [endpoint, opts = {}] = req.firstCall.args
  t.equal(endpoint, '/workspaces/w1/exports')
  t.ok(!opts.method || opts.method === 'GET', 'GET')
  t.deepEqual(out, [{ id: 'e1' }])
  sandbox.restore()
})

test('getWorkspaceExport GETs /workspaces/:id/exports/:exportId', async t => {
  t.plan(2)
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'e1', status: 'running' } })
  const out = await svc.getWorkspaceExport('w1', 'e1')
  t.equal(req.firstCall.args[0], '/workspaces/w1/exports/e1')
  t.equal(out.status, 'running')
  sandbox.restore()
})

test('getWorkspaceExportDownloadUrl POSTs .../download and resolves { url, expiresAt }', async t => {
  t.plan(3)
  const svc = makeService()
  const data = { url: 'https://signed.example.test/x', expiresAt: '2026-10-25T16:05:00.000Z' }
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data })
  const out = await svc.getWorkspaceExportDownloadUrl('w1', 'e1')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/workspaces/w1/exports/e1/download')
  t.equal(opts.method, 'POST')
  t.deepEqual(out, data)
  sandbox.restore()
})

test('deleteWorkspaceExport DELETEs /workspaces/:id/exports/:exportId', async t => {
  t.plan(2)
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({ success: true, data: { id: 'e1', status: 'deleted' } })
  await svc.deleteWorkspaceExport('w1', 'e1')
  const [endpoint, opts] = req.firstCall.args
  t.equal(endpoint, '/workspaces/w1/exports/e1')
  t.equal(opts.method, 'DELETE')
  sandbox.restore()
})

test('every export method refuses a missing workspaceId (no request sent)', async t => {
  t.plan(METHODS.length * 2)
  for (const m of METHODS) {
    const svc = makeService()
    const req = sandbox.stub(svc, '_request')
    try {
      await svc[m](undefined, 'e1')
      t.fail(`${m} should have thrown`)
    } catch (err) {
      t.equal(err.message, 'Workspace ID is required', m)
    }
    t.equal(req.called, false, `${m}: no transport`)
    sandbox.restore()
  }
})

test('job methods refuse a missing exportId (no request sent)', async t => {
  const jobMethods = ['getWorkspaceExport', 'getWorkspaceExportDownloadUrl', 'deleteWorkspaceExport']
  t.plan(jobMethods.length * 2)
  for (const m of jobMethods) {
    const svc = makeService()
    const req = sandbox.stub(svc, '_request')
    try {
      await svc[m]('w1')
      t.fail(`${m} should have thrown`)
    } catch (err) {
      t.equal(err.message, 'Export ID is required', m)
    }
    t.equal(req.called, false, `${m}: no transport`)
    sandbox.restore()
  }
})

test('the server 409 message surfaces on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'An export is already running' })
  try {
    await svc.startWorkspaceExport('w1')
    t.fail('should have thrown')
  } catch (err) {
    t.match(err.message, /already running/)
  }
  sandbox.restore()
})
