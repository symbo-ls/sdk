import test from 'tape'
import sinon from 'sinon'
import { AdminService } from '../../AdminService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// The /admin/system page read GET /core/system/status and /core/system/uptime
// with raw fetch() (workspace shared systemStatus.js). These are the SDK doors
// for both — the SDK-only rule — pinned: path, method, the query each option
// sends, a caller's AbortSignal reaching _request, and the payload unchanged.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AdminService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}
const MATRIX = { matrix: { 'server:prod': { status: 'healthy' } }, npm: {}, services: [], packages: [], warnings: [], errors: [], integration: { connected: false } }

test('getSystemStatus GETs /system/status and answers the matrix as sent', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves(MATRIX)
  const res = await svc.getSystemStatus()
  t.deepEqual(res, MATRIX, 'payload unchanged (the route answers a bare object, no envelope)')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/system/status', 'path (→ /core/system/status)')
  t.equal(opts.method, 'GET')
  t.equal(opts.methodName, 'getSystemStatus')
  t.equal(opts.signal, undefined, 'no signal → the GET can share an in-flight read')
  sandbox.restore()
  t.end()
})

test('getSystemStatus({ refresh: true }) asks the server for a fresh probe; a signal rides along', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves(MATRIX)
  const controller = new AbortController()
  await svc.getSystemStatus({ refresh: true, signal: controller.signal })
  t.equal(stub.firstCall.args[0], '/system/status?refresh=1')
  t.equal(stub.firstCall.args[1].signal, controller.signal, 'the caller\'s AbortSignal reaches _request')
  sandbox.restore()
  t.end()
})

test('getSystemUptime GETs /system/uptime with the limit the page asks for', async t => {
  const svc = makeService()
  const rows = { server: [{ service: 'server', checked_at: '2026-09-24', status: 'ok', latency_ms: 12, message: '' }] }
  const stub = sandbox.stub(svc, '_request').resolves(rows)
  const res = await svc.getSystemUptime({ limit: 3000 })
  t.deepEqual(res, rows, 'grouped rows as sent')
  t.equal(stub.firstCall.args[0], '/system/uptime?limit=3000')
  t.equal(stub.firstCall.args[1].method, 'GET')
  t.equal(stub.firstCall.args[1].methodName, 'getSystemUptime')
  sandbox.restore()
  t.end()
})

test('getSystemUptime sends no limit when none (or a non-positive one) is given — the server default holds', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({})
  await svc.getSystemUptime()
  await svc.getSystemUptime({ limit: 0 })
  await svc.getSystemUptime({ limit: 'abc' })
  await svc.getSystemUptime({ limit: 250.9 })
  t.deepEqual(stub.getCalls().map(c => c.args[0]), ['/system/uptime', '/system/uptime', '/system/uptime', '/system/uptime?limit=250'])
  sandbox.restore()
  t.end()
})

test('both are flat on the SDK instance: sdk.getSystemStatus() / sdk.getSystemUptime()', t => {
  t.equal(SERVICE_METHODS.getSystemStatus, 'admin')
  t.equal(SERVICE_METHODS.getSystemUptime, 'admin')
  t.end()
})
