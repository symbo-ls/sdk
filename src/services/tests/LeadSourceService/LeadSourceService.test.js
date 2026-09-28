import test from 'tape'
import sinon from 'sinon'
import { LeadSourceService } from '../../LeadSourceService.js'
import { BaseService } from '../../BaseService.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new LeadSourceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('leadSources: sources CRUD paths, methods and bodies', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.list({ type: ['webhook', 'web_form'], status: 'active' }, { workspaceId: 'ws1' })
  t.equal(stub.getCall(0).args[0], 'leadSources.list')
  t.equal(stub.getCall(0).args[1], '/lead-sources?type=webhook%2Cweb_form&status=active&workspaceId=ws1')
  await svc.create({ type: 'webhook', name: 'Zapier' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(1).args.slice(1), [
    '/lead-sources?workspaceId=ws1',
    { method: 'POST', body: { type: 'webhook', name: 'Zapier' } }
  ])
  await svc.update('s1', { status: 'paused' })
  t.deepEqual(stub.getCall(2).args.slice(1), ['/lead-sources/s1', { method: 'PATCH', body: { status: 'paused' } }])
  await svc.archive('s1', { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(3).args.slice(1), ['/lead-sources/s1?workspaceId=ws1', { method: 'DELETE' }])
  await svc.rotateSecret('s1')
  t.equal(stub.getCall(4).args[1], '/lead-sources/s1/rotate-secret')
  t.equal(stub.getCall(4).args[2].method, 'POST')
  await svc.sendTestLead('s1', { person: { fullName: 'T' } })
  t.deepEqual(stub.getCall(5).args[2], { method: 'POST', body: { payload: { person: { fullName: 'T' } } } })
  await svc.get('a/b')
  t.equal(stub.getCall(6).args[1], '/lead-sources/a%2Fb', 'ids are encoded')
  sandbox.restore()
  t.end()
})

test('leadSources: settings, presets, issues, events, touches', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.updateSettings({ defaultCountry: 'GE' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(0).args.slice(1), [
    '/lead-sources/settings?workspaceId=ws1',
    { method: 'PATCH', body: { defaultCountry: 'GE' } }
  ])
  await svc.getSettings()
  t.equal(stub.getCall(1).args[1], '/lead-sources/settings')
  await svc.csvPresets()
  t.equal(stub.getCall(2).args[1], '/lead-sources/csv-presets')
  await svc.issuesSummary({ reason: 'mapping_error', bogus: 'x' })
  t.equal(stub.getCall(3).args[1], '/lead-sources/issues/summary?reason=mapping_error', 'unknown filters are not sent')
  await svc.retryIssue('e1')
  t.equal(stub.getCall(4).args[1], '/lead-sources/issues/e1/retry')
  await svc.retryIssues({ source: 's1' })
  t.deepEqual(stub.getCall(5).args[2], { method: 'POST', body: { source: 's1' } })
  await svc.getEvent('e1')
  t.equal(stub.getCall(6).args[1], '/lead-sources/events/e1')
  await svc.leadTouches('l1', { workspaceId: 'ws1' })
  t.equal(stub.getCall(7).args[1], '/lead-sources/leads/l1/touches?workspaceId=ws1')
  sandbox.restore()
  t.end()
})

test('leadSources.listIssues returns rows with pagination attached', async t => {
  const svc = makeService()
  const req = sandbox.stub(svc, '_request').resolves({
    success: true,
    data: [{ id: 'e1', reason: 'validation_error', hint: 'fix_payload' }],
    pagination: { totalCount: 1, hasMore: false }
  })
  const rows = await svc.listIssues({ status: ['dead', 'failed'], source: 's1' }, { limit: 20, workspaceId: 'ws1' })
  const url = req.firstCall.args[0]
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  t.ok(url.startsWith('/lead-sources/issues?'))
  t.equal(q.get('status'), 'dead,failed')
  t.equal(q.get('source'), 's1')
  t.equal(q.get('limit'), '20')
  t.equal(q.get('workspaceId'), 'ws1')
  t.equal(rows.length, 1)
  t.equal(rows.pagination.totalCount, 1)
  req.resolves({ success: false, message: 'forbidden' })
  try {
    await svc.listIssues()
    t.fail('a refused read throws')
  } catch (err) {
    t.equal(err.message, 'forbidden')
  }
  sandbox.restore()
  t.end()
})

test('leadSources: imports — csv, bitrix24 (dry run is the caller default), runs, undo', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.importCsv({ sourceId: 's1', preset: 'meta', contentBase64: 'AA==' }, { workspaceId: 'ws1' })
  t.deepEqual(stub.getCall(0).args.slice(1), [
    '/lead-sources/imports/csv?workspaceId=ws1',
    { method: 'POST', body: { sourceId: 's1', preset: 'meta', contentBase64: 'AA==' } }
  ])
  await svc.importBitrix24({ entity: 'leads', content: 'ID\n1', dryRun: false })
  t.equal(stub.getCall(1).args[1], '/lead-sources/imports/bitrix24')
  t.equal(stub.getCall(1).args[2].body.dryRun, false)
  await svc.listImports({ kind: 'bitrix24' })
  t.equal(stub.getCall(2).args[1], '/lead-sources/imports?kind=bitrix24')
  await svc.getImport('i1')
  t.equal(stub.getCall(3).args[1], '/lead-sources/imports/i1')
  await svc.undoImport('i1')
  t.deepEqual(stub.getCall(4).args.slice(1), ['/lead-sources/imports/i1/undo', { method: 'POST', body: {} }])
  sandbox.restore()
  t.end()
})

test('leadSources.submitForm is public: POST /lead-sources/forms/:key, no session token', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ received: true })
  const out = await svc.submitForm('lf_abc', { name: 'Nino', phone: '555 12 34 56', website: '' })
  t.deepEqual(out, { received: true })
  t.deepEqual(stub.firstCall.args, [
    'leadSources.submitForm',
    '/lead-sources/forms/lf_abc',
    { method: 'POST', body: { name: 'Nino', phone: '555 12 34 56', website: '' } }
  ])
  t.equal(
    BaseService.prototype._requiresInit.call(svc, 'leadSources.submitForm'),
    false,
    'the public submit attaches no bearer token'
  )
  t.equal(BaseService.prototype._requiresInit.call(svc, 'leadSources.create'), true)
  sandbox.restore()
  t.end()
})

test("sdk.execute routes: leadSources, leadSources.issues / .settings / .imports", async t => {
  const calls = []
  const svc = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'leadSources' ? svc : null) })
  await dispatch('leadSources', 'list', { type: 'webhook', workspaceId: 'ws1' })
  t.equal(calls[0][0], 'list')
  t.equal(calls[0][1].type, 'webhook')
  t.equal(calls[0][2].workspaceId, 'ws1')
  await dispatch('leadSources', 'remove', { id: 's1', workspaceId: 'ws1' })
  t.deepEqual(calls[1], ['archive', 's1', { workspaceId: 'ws1' }], 'remove archives')
  await dispatch('leadSources', 'create', { type: 'web_form', name: 'Site', workspaceId: 'ws1' })
  t.deepEqual(calls[2], ['create', { type: 'web_form', name: 'Site' }, { workspaceId: 'ws1' }], 'workspaceId never rides the body')
  await dispatch('leadSources.issues', 'list', { reason: 'mapping_error', limit: 20, workspaceId: 'ws1' })
  t.equal(calls[3][0], 'listIssues')
  t.equal(calls[3][1].reason, 'mapping_error')
  t.equal(calls[3][2].limit, 20)
  await dispatch('leadSources.issues', 'retry', { id: 'e1', workspaceId: 'ws1' })
  t.deepEqual(calls[4], ['retryIssue', 'e1', { workspaceId: 'ws1' }])
  await dispatch('leadSources.settings', 'update', { defaultCountry: 'GE', workspaceId: 'ws1' })
  t.deepEqual(calls[5], ['updateSettings', { defaultCountry: 'GE' }, { workspaceId: 'ws1' }])
  await dispatch('leadSources.imports', 'bitrix24', { entity: 'leads', content: 'ID\n1', workspaceId: 'ws1' })
  t.deepEqual(calls[6], ['importBitrix24', { entity: 'leads', content: 'ID\n1' }, { workspaceId: 'ws1' }])
  t.end()
})
