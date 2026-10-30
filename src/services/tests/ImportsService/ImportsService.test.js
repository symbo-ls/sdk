import test from 'tape'
import sinon from 'sinon'
import { ImportsService } from '../../ImportsService.js'

// POB — the import core (server /core/workspaces/:id/imports/*).
// Pinned: the 7 names, their literal paths + methods + bodies, the
// { success, data } unwrap, and a refusal that keeps .status + .cause and
// gains .code (the Imports UI reads err.status, then err.cause.error).

const WS = 'a'.repeat(24)
const sandbox = sinon.createSandbox()
const makeService = (answer = { success: true, data: { ok: 1 } }) => {
  const svc = new ImportsService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  const stub = sandbox.stub(svc, '_request').resolves(answer)
  return { svc, stub }
}

test('listImportSources / listImportTargets GET the workspace paths and unwrap data', async t => {
  const { svc, stub } = makeService({ success: true, data: { sources: [{ id: 'file' }] } })
  t.deepEqual(await svc.listImportSources(WS), { sources: [{ id: 'file' }] })
  t.equal(stub.firstCall.args[0], `/workspaces/${WS}/imports/sources`)
  t.equal(stub.firstCall.args[1].method, 'GET')
  t.equal(stub.firstCall.args[1].methodName, 'listImportSources')
  await svc.listImportTargets(WS)
  t.equal(stub.secondCall.args[0], `/workspaces/${WS}/imports/targets`)
  t.equal(stub.secondCall.args[1].method, 'GET')
  sandbox.restore()
  t.end()
})

test('uploadImportFile POSTs one multipart `file`', async t => {
  const { svc, stub } = makeService({ success: true, data: { fileId: 'f1', kind: 'csv' } })
  const file = new Blob(['Name\nAnn\n'], { type: 'text/csv' })
  const out = await svc.uploadImportFile(WS, file)
  t.deepEqual(out, { fileId: 'f1', kind: 'csv' })
  const [path, init] = stub.firstCall.args
  t.equal(path, `/workspaces/${WS}/imports/upload`)
  t.equal(init.method, 'POST')
  t.ok(init.body instanceof FormData, 'a FormData body (the runtime writes the boundary)')
  t.ok(init.body.get('file'), 'the file field')
  t.notOk(init.headers && init.headers['Content-Type'], 'no JSON content type on a multipart body')
  sandbox.restore()
  t.end()
})

test('previewImport POSTs { fileId } or { sourceId } as given', async t => {
  const { svc, stub } = makeService()
  await svc.previewImport(WS, { fileId: 'f1' })
  t.equal(stub.firstCall.args[0], `/workspaces/${WS}/imports/preview`)
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { fileId: 'f1' })
  await svc.previewImport(WS, { sourceId: 'google_sheets', object: 'x' })
  t.deepEqual(JSON.parse(stub.secondCall.args[1].body), { sourceId: 'google_sheets', object: 'x' })
  try {
    await svc.previewImport(WS, {})
    t.fail('should throw')
  } catch (e) {
    t.ok(/fileId or sourceId/.test(e.message))
  }
  sandbox.restore()
  t.end()
})

test('runImport POSTs { previewId, target, mapping }; getImport GETs, undoImport DELETEs /:importId', async t => {
  const { svc, stub } = makeService({ success: true, data: { importId: 'i1' } })
  const target = { app: 'system/crm-app', collection: 'contacts' }
  t.deepEqual(await svc.runImport(WS, { previewId: 'p1', target, mapping: { c1: 'name' } }), { importId: 'i1' })
  t.equal(stub.firstCall.args[0], `/workspaces/${WS}/imports/run`)
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { previewId: 'p1', target, mapping: { c1: 'name' } })
  await svc.getImport(WS, 'i1')
  t.equal(stub.secondCall.args[0], `/workspaces/${WS}/imports/i1`)
  t.equal(stub.secondCall.args[1].method, 'GET')
  await svc.undoImport(WS, 'i1')
  t.equal(stub.thirdCall.args[0], `/workspaces/${WS}/imports/i1`)
  t.equal(stub.thirdCall.args[1].method, 'DELETE')
  t.equal(stub.thirdCall.args[1].methodName, 'undoImport')
  sandbox.restore()
  t.end()
})

test('ids are required and encoded', async t => {
  const { svc, stub } = makeService()
  for (const call of [
    () => svc.listImportSources(''),
    () => svc.getImport(WS, ''),
    () => svc.uploadImportFile(WS, null),
    () => svc.runImport(WS, { target: {} })
  ]) {
    try {
      await call()
      t.fail('should throw')
    } catch (e) {
      t.ok(/required/.test(e.message), e.message)
    }
  }
  await svc.getImport(WS, 'a/b')
  t.equal(stub.firstCall.args[0], `/workspaces/${WS}/imports/a%2Fb`)
  sandbox.restore()
  t.end()
})

test('a refusal keeps .status and .cause and gains .code from the body', async t => {
  const svc = new ImportsService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  const err = new Error('No table was found in this PDF.', { cause: { error: 'no_table_found', message: 'x' } })
  err.status = 422
  sandbox.stub(svc, '_request').rejects(err)
  try {
    await svc.previewImport(WS, { fileId: 'f1' })
    t.fail('should throw')
  } catch (e) {
    t.equal(e, err, 'the same HTTP error, not a wrapper')
    t.equal(e.status, 422)
    t.equal(e.cause.error, 'no_table_found')
    t.equal(e.code, 'no_table_found')
  }
  sandbox.restore()
  t.end()
})
