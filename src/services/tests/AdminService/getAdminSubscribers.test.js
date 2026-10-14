import test from 'tape'
import sinon from 'sinon'
import { AdminService } from '../../AdminService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// GET /core/admin/subscribers — the Subscriptions console read (platform
// superuser). Pinned: path, method, the query each option sends, the
// envelope unwrapped, a server refusal thrown, the AbortSignal passed on,
// and the flat proxy entry.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new AdminService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}
const DATA = {
  rows: [{ id: 's1', status: 'active', class: 'manual', monthly: 9900, currency: 'USD', hasStripe: false, seats: 1 }],
  summary: {
    total: 1,
    currencies: {
      USD: {
        mrr: 9900,
        arr: 118800,
        billable: 1,
        mrrByClass: { stripe: 0, manual: 9900 },
        trialing: { mrr: 0, count: 0 },
        atRisk: { mrr: 0, count: 0 }
      }
    }
  },
  paging: { limit: 50, offset: 0, total: 1 }
}

test('getAdminSubscribers GETs /admin/subscribers and unwraps the envelope', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: DATA })
  const res = await svc.getAdminSubscribers()
  t.deepEqual(res, DATA, '{ rows, summary, paging } as sent')
  const [path, opts] = stub.firstCall.args
  t.equal(path, '/admin/subscribers', 'no query when no option is given (→ /core/admin/subscribers)')
  t.equal(opts.method, 'GET')
  t.equal(opts.methodName, 'getAdminSubscribers')
  sandbox.restore()
  t.end()
})

test('getAdminSubscribers sends status (string or list), limit and offset; drops bad numbers', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: DATA })
  const controller = new AbortController()
  await svc.getAdminSubscribers({ status: 'canceled', limit: 25, offset: 50, signal: controller.signal })
  await svc.getAdminSubscribers({ status: ['active', 'past_due'] })
  await svc.getAdminSubscribers({ status: 'all', limit: 0, offset: -3 })
  await svc.getAdminSubscribers({ limit: 'abc', offset: 10.7 })
  t.deepEqual(stub.getCalls().map(c => c.args[0]), [
    '/admin/subscribers?status=canceled&limit=25&offset=50',
    '/admin/subscribers?status=active%2Cpast_due',
    '/admin/subscribers?status=all',
    '/admin/subscribers?offset=10'
  ])
  t.equal(stub.firstCall.args[1].signal, controller.signal, 'the caller\'s AbortSignal reaches _request')
  sandbox.restore()
  t.end()
})

test('getAdminSubscribers throws the server message on a refusal envelope', async t => {
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'Platform superuser required' })
  try {
    await svc.getAdminSubscribers()
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'Platform superuser required')
  }
  sandbox.restore()
  t.end()
})

test('getAdminSubscribers is flat on the SDK instance: sdk.getAdminSubscribers()', t => {
  t.equal(SERVICE_METHODS.getAdminSubscribers, 'admin')
  t.end()
})
