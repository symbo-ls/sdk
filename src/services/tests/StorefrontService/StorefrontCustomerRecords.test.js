import test from 'tape'
import sinon from 'sinon'
import { StorefrontService } from '../../StorefrontService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Customer records + private files: literal routes (the server drift analyzer
// reads them), bodies, the explicit customer token, and the identity rule
// (customer methods never attach the platform session; owner/staff methods do).

const sandbox = sinon.createSandbox()
const WS = '6aee1fc92f79c854c992389c'
const TOK = 'customer.jwt'
const AUTH = { Authorization: `Bearer ${TOK}` }

const makeService = () => {
  const svc = new StorefrontService()
  const call = sandbox.stub(svc, '_call').resolves({})
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return { svc, call }
}
const args = (call) => call.firstCall.args

test('records: list / create / get / update / delete / import paths + bodies', async (t) => {
  const cases = [
    [(s) => s.listStorefrontCustomerRecords(WS, 'pets', { limit: 10, updatedSince: '2026-11-09T00:00:00Z' }, TOK),
      'listStorefrontCustomerRecords', `/storefront/${WS}/account/records/pets?limit=10&updatedSince=2026-11-09T00%3A00%3A00Z`, undefined, undefined],
    [(s) => s.createStorefrontCustomerRecord(WS, 'pets', { data: { name: 'T' }, clientId: 'd1' }, TOK),
      'createStorefrontCustomerRecord', `/storefront/${WS}/account/records/pets`, 'POST', { data: { name: 'T' }, clientId: 'd1' }],
    [(s) => s.getStorefrontCustomerRecord(WS, 'pets', 'r1', TOK),
      'getStorefrontCustomerRecord', `/storefront/${WS}/account/records/pets/r1`, undefined, undefined],
    [(s) => s.updateStorefrontCustomerRecord(WS, 'pets', 'r1', { data: { name: 'U' }, version: 2 }, TOK),
      'updateStorefrontCustomerRecord', `/storefront/${WS}/account/records/pets/r1`, 'PATCH', { data: { name: 'U' }, version: 2 }],
    [(s) => s.deleteStorefrontCustomerRecord(WS, 'pets', 'r1', TOK),
      'deleteStorefrontCustomerRecord', `/storefront/${WS}/account/records/pets/r1`, 'DELETE', undefined],
    [(s) => s.importStorefrontCustomerRecords(WS, 'pets', [{ clientId: 'd1', data: {} }], TOK),
      'importStorefrontCustomerRecords', `/storefront/${WS}/account/records/pets/import`, 'POST', { items: [{ clientId: 'd1', data: {} }] }]
  ]
  for (const [run, name, path, method, body] of cases) {
    const { svc, call } = makeService()
    await run(svc)
    const [n, p, opts] = args(call)
    t.equal(n, name)
    t.equal(p, path, name)
    t.equal(opts.method, method, `${name} method`)
    t.deepEqual(opts.body, body, `${name} body`)
    t.deepEqual(opts.headers, AUTH, `${name} carries the customer token`)
    sandbox.restore()
  }
  t.end()
})

test('records: required args refuse before any request', (t) => {
  const { svc, call } = makeService()
  t.throws(() => svc.listStorefrontCustomerRecords(WS, 'pets', {}), /customerToken/)
  t.throws(() => svc.createStorefrontCustomerRecord(WS, 'pets', {}, TOK), /data/)
  t.throws(() => svc.updateStorefrontCustomerRecord(WS, 'pets', 'r1', { data: {} }, TOK), /version/)
  t.throws(() => svc.importStorefrontCustomerRecords(WS, 'pets', [], TOK), /items/)
  t.throws(() => svc.getStorefrontCustomerRecord(WS, '', 'r1', TOK), /collection/)
  t.equal(call.callCount, 0)
  sandbox.restore()
  t.end()
})

test('files: upload is multipart (field `file`), list / url / delete paths', async (t) => {
  const { svc, call } = makeService()
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
  await svc.uploadStorefrontCustomerFile(WS, blob, TOK)
  const [n, p, opts] = args(call)
  t.equal(n, 'uploadStorefrontCustomerFile')
  t.equal(p, `/storefront/${WS}/account/files`)
  t.equal(opts.method, 'POST')
  t.ok(opts.body instanceof FormData, 'FormData body')
  t.ok(opts.body.get('file'), 'field `file`')
  t.deepEqual(opts.headers, AUTH)
  sandbox.restore()

  for (const [run, path, method] of [
    [(s) => s.listStorefrontCustomerFiles(WS, { limit: 5 }, TOK), `/storefront/${WS}/account/files?limit=5`, undefined],
    [(s) => s.getStorefrontCustomerFileUrl(WS, 'f1', TOK), `/storefront/${WS}/account/files/f1/url`, undefined],
    [(s) => s.deleteStorefrontCustomerFile(WS, 'f1', TOK), `/storefront/${WS}/account/files/f1`, 'DELETE']
  ]) {
    const m = makeService()
    await run(m.svc)
    t.equal(args(m.call)[1], path)
    t.equal(args(m.call)[2].method, method)
    t.deepEqual(args(m.call)[2].headers, AUTH)
    sandbox.restore()
  }
  t.end()
})

test('owner + staff: platform session, no customer header', async (t) => {
  for (const [run, path, method, body] of [
    [(s) => s.getStorefrontCustomerRecordSettings(WS), `/storefront/${WS}/settings/customer-records`, 'GET'],
    [(s) => s.setStorefrontCustomerRecordSettings(WS, { collections: {} }), `/storefront/${WS}/settings/customer-records`, 'PUT', { collections: {} }],
    [(s) => s.getStorefrontCustomerFileStaffUrl(WS, 'f1'), `/storefront/${WS}/customer-files/f1/url`, 'GET']
  ]) {
    const { svc, call } = makeService()
    await run(svc)
    const [, p, opts] = args(call)
    t.equal(p, path)
    t.equal(opts.method, method)
    t.deepEqual(opts.body, body)
    t.equal(opts.headers, undefined, 'the session token, not a customer header')
    sandbox.restore()
  }
  t.end()
})

test('identity rule + flat exposure', (t) => {
  const base = new BaseService({})
  const customer = [
    'listStorefrontCustomerRecords', 'createStorefrontCustomerRecord', 'getStorefrontCustomerRecord',
    'updateStorefrontCustomerRecord', 'deleteStorefrontCustomerRecord', 'importStorefrontCustomerRecords',
    'uploadStorefrontCustomerFile', 'listStorefrontCustomerFiles', 'getStorefrontCustomerFileUrl',
    'deleteStorefrontCustomerFile'
  ]
  for (const m of customer) {
    t.equal(base._requiresInit(m), false, `${m} never attaches the platform token`)
    t.equal(SERVICE_METHODS[m], 'storefront', `${m} is flat-exposed`)
  }
  for (const m of ['getStorefrontCustomerRecordSettings', 'setStorefrontCustomerRecordSettings', 'getStorefrontCustomerFileStaffUrl']) {
    t.equal(base._requiresInit(m), true, `${m} needs the platform session`)
    t.equal(SERVICE_METHODS[m], 'storefront', `${m} is flat-exposed`)
  }
  t.end()
})
