import test from 'tape'
import sinon from 'sinon'
import { GrowthService } from '../../GrowthService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'
import { SDK } from '../../../index.js'

// GrowthService — the Growth app's reads of the Symbols sign-up funnel (fly
// docs/FUNNEL.md §3): GET /core/growth/funnel and GET /core/growth/accounts,
// system-org only on the server (requireSymbolsSystemOrg). The server owns
// the query vocabulary (window, grouping, stage filters, paging), so the
// service forwards a filter bag's scalar fields as query params and adds
// none of its own. Asserts what is on the wire (method name + literal path +
// params) and the dispatcher / registration contract.

const sandbox = sinon.createSandbox()

const stubbed = () => {
  const svc = new GrowthService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  return { svc, stub }
}
const urlOf = (stub, i = 0) => stub.getCall(i).args[1]
const pathOf = (stub, i = 0) => urlOf(stub, i).split('?')[0]
const paramsOf = (stub, i = 0) => new URLSearchParams(urlOf(stub, i).split('?')[1] || '')

test('funnel: GET /growth/funnel forwards the filter fields as query params', async (t) => {
  const { svc, stub } = stubbed()
  const since = new Date('2026-10-01T00:00:00.000Z')
  await svc.funnel({
    since,
    until: '2026-10-24',
    tz: 'Asia/Tbilisi',
    groupBy: 'source',
    surface: 'landing',
    projects: ['system/landing', 'fly/symbols'],
    activationDays: 7,
    includeStalled: true
  })
  t.equal(stub.firstCall.args[0], 'growth.funnel', 'method name')
  t.equal(pathOf(stub), '/growth/funnel', 'literal path')
  t.equal(stub.firstCall.args[2], undefined, 'a GET — no body, no method override')
  const p = paramsOf(stub)
  t.equal(p.get('since'), since.toISOString(), 'a Date goes out as ISO')
  t.equal(p.get('until'), '2026-10-24', 'a bare day is sent as is')
  t.equal(p.get('tz'), 'Asia/Tbilisi')
  t.equal(p.get('groupBy'), 'source')
  t.equal(p.get('surface'), 'landing')
  t.equal(p.get('projects'), 'system/landing,fly/symbols', 'an array joins with ","')
  t.equal(p.get('activationDays'), '7')
  t.equal(p.get('includeStalled'), 'true')
  sandbox.restore()
  t.end()
})

test('funnel: empty values, objects, functions and odd keys emit nothing; no filter → bare path', async (t) => {
  const { svc, stub } = stubbed()
  await svc.funnel({
    since: '',
    until: null,
    tz: undefined,
    nested: { a: 1 },
    fn: () => 1,
    nan: Number.NaN,
    'a-b': 'x',
    $where: '1',
    __proto__x: 'y',
    groupBy: 'campaign'
  })
  t.equal(urlOf(stub), '/growth/funnel?groupBy=campaign', 'only the clean scalar survives')
  sandbox.restore()
  const r = stubbed()
  await r.svc.funnel()
  t.equal(urlOf(r.stub), '/growth/funnel', 'no filter → bare path, no stray "?"')
  sandbox.restore()
  t.end()
})

test('accounts: GET /growth/accounts with the filter plus limit / offset / order from options', async (t) => {
  const { svc, stub } = stubbed()
  await svc.accounts({ stage: 'stalled', since: '2026-10-01' }, { limit: 50, offset: 100, order: 'desc' })
  t.equal(stub.firstCall.args[0], 'growth.accounts', 'method name')
  t.equal(pathOf(stub), '/growth/accounts', 'literal path')
  const p = paramsOf(stub)
  t.equal(p.get('stage'), 'stalled')
  t.equal(p.get('since'), '2026-10-01')
  t.equal(p.get('limit'), '50')
  t.equal(p.get('offset'), '100')
  t.equal(p.get('order'), 'desc')
  sandbox.restore()
  const r = stubbed()
  await r.svc.accounts()
  t.equal(urlOf(r.stub), '/growth/accounts', 'no filter → bare path')
  sandbox.restore()
  t.end()
})

test('the service throws the server refusal (a non-system caller gets the server message)', async (t) => {
  const svc = new GrowthService()
  svc._setReady()
  sandbox.stub(svc, '_request').resolves({ success: false, message: 'Forbidden: system organization only' })
  try {
    await svc.funnel({ since: '2026-10-01' })
    t.fail('should reject')
  } catch (err) {
    t.match(err.message, /system organization only/)
  }
  sandbox.restore()
  t.end()
})

// ── sdk.execute — the routes the Growth app reaches ─────────────────────────

const makeSdk = (calls) => ({
  getService: (name) =>
    new Proxy(
      {},
      {
        get: (_t, method) => {
          if (typeof method !== 'string') return undefined
          return (...args) => {
            calls.push({ service: name, method, args })
            return Promise.resolve({ ok: true })
          }
        }
      }
    )
})

test('sdk.execute: growth.funnel / growth.accounts + the named ops resolve GrowthService with the right args', async (t) => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('growth', 'funnel', { since: '2026-10-01', groupBy: 'source' })
  await execute('growth', 'funnel', { filter: { since: '2026-10-02' } })
  await execute('growth', 'accounts', { stage: 'stalled', limit: 20, offset: 40 })
  await execute('growth', 'accounts', { filter: { stage: 'paid' }, options: { limit: 5 } })
  await execute('growth.funnel', 'list', { params: { since: '2026-10-03' } })
  await execute('growth.funnel', 'get', { since: '2026-10-04' })
  await execute('growth.accounts', 'list', { stage: 'activated', limit: 10 })
  t.deepEqual(calls[0], { service: 'growth', method: 'funnel', args: [{ since: '2026-10-01', groupBy: 'source' }] })
  t.deepEqual(calls[1], { service: 'growth', method: 'funnel', args: [{ since: '2026-10-02' }] })
  t.equal(calls[2].method, 'accounts')
  t.deepEqual(calls[2].args[0], { stage: 'stalled' }, 'flat keys become the filter')
  t.equal(calls[2].args[1].limit, 20)
  t.equal(calls[2].args[1].offset, 40)
  t.deepEqual(calls[3].args[0], { stage: 'paid' })
  t.equal(calls[3].args[1].limit, 5)
  t.deepEqual(calls[4], { service: 'growth', method: 'funnel', args: [{ since: '2026-10-03' }] })
  t.deepEqual(calls[5], { service: 'growth', method: 'funnel', args: [{ since: '2026-10-04' }] })
  t.equal(calls[6].method, 'accounts')
  t.deepEqual(calls[6].args[0], { stage: 'activated' })
  t.equal(calls[6].args[1].limit, 10)
  t.end()
})

test('the SDK registers the growth service: sdk.getService("growth") is a GrowthService', async (t) => {
  const sdk = new SDK({ apiUrl: 'http://localhost:0/api' })
  await sdk.initialize({})
  const growth = sdk.getService('growth')
  t.ok(growth instanceof GrowthService, 'registered under "growth"')
  t.equal(typeof growth.funnel, 'function')
  t.equal(typeof growth.accounts, 'function')
  const stub = sandbox.stub(growth, '_call').resolves({ ok: true })
  await sdk.execute('growth', 'funnel', { since: '2026-10-01' })
  t.equal(stub.firstCall.args[1], '/growth/funnel?since=2026-10-01', 'sdk.execute reaches the live service')
  sandbox.restore()
  t.end()
})
