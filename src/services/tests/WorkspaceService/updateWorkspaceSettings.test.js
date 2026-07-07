import test from 'tape'
import sinon from 'sinon'
import { WorkspaceService } from '../../WorkspaceService.js'

// Unit coverage for the merge-safe settings writer —
// updateWorkspaceSettings → PATCH /workspaces/:id/settings. Transport is
// mocked at `_request` (the { success, data } envelope contract) so we can
// assert URL + method + wire body. The server contract (per-key deep merge
// into Workspace.settings, key whitelist, owner/admin gate, module-ref
// validation + tier clamp) lives in
// server/src/domains/workspaces/* and is NOT re-tested here.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('updateWorkspaceSettings PATCHes /workspaces/:id/settings with the partial VERBATIM', async t => {
  t.plan(4)
  const svc = makeService()
  const partial = { navbar: [{ label: 'Home', path: '/' }], apps: [] }
  const requestStub = sandbox
    .stub(svc, '_request')
    .resolves({ success: true, data: { settings: { ...partial, workspaceModule: { key: 'm' } } } })

  const result = await svc.updateWorkspaceSettings('w1', partial)

  const [endpoint, opts] = requestStub.firstCall.args
  t.equal(endpoint, '/workspaces/w1/settings', 'URL is the settings sub-resource')
  t.equal(opts.method, 'PATCH', 'method PATCH')
  t.deepEqual(JSON.parse(opts.body), partial, 'wire body is the flat partial, unwrapped')
  t.deepEqual(
    result,
    { settings: { ...partial, workspaceModule: { key: 'm' } } },
    'resolves the unwrapped { settings } data (siblings preserved server-side)'
  )
  sandbox.restore()
  t.end()
})

test('updateWorkspaceSettings sends only the keys provided (single-key write)', async t => {
  t.plan(1)
  const svc = makeService()
  const requestStub = sandbox.stub(svc, '_request').resolves({ success: true, data: { settings: {} } })

  await svc.updateWorkspaceSettings('w1', { designSystem: { canvasBg: 'gray.1', vars: {} } })

  t.deepEqual(
    JSON.parse(requestStub.firstCall.args[1].body),
    { designSystem: { canvasBg: 'gray.1', vars: {} } },
    'body carries only designSystem — no sibling keys fabricated'
  )
  sandbox.restore()
  t.end()
})

test('updateWorkspaceSettings surfaces the server message on { success: false }', async t => {
  t.plan(1)
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves({
    success: false,
    message: "settings key 'bogus' is not writable"
  })

  try {
    await svc.updateWorkspaceSettings('w1', { bogus: 1 })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, "settings key 'bogus' is not writable", 'server message surfaces verbatim')
  }
  sandbox.restore()
  t.end()
})

test('updateWorkspaceSettings throws without workspaceId', async t => {
  t.plan(1)
  const svc = makeService()
  try {
    await svc.updateWorkspaceSettings(undefined, { navbar: [] })
    t.fail('should have thrown')
  } catch (err) {
    t.equal(err.message, 'workspaceId is required', 'validation')
  }
  sandbox.restore()
  t.end()
})

test('updateWorkspaceSettings throws on a missing / non-object partial', async t => {
  t.plan(3)
  const svc = makeService()
  const expect = async (arg, label) => {
    try {
      await svc.updateWorkspaceSettings('w1', arg)
      t.fail(`should have thrown for ${label}`)
    } catch (err) {
      t.equal(err.message, 'partialSettings object is required', label)
    }
  }
  await expect(undefined, 'undefined rejected')
  await expect(null, 'null rejected')
  await expect([{ navbar: [] }], 'array rejected (must be a plain settings object)')
  sandbox.restore()
  t.end()
})

test('teardown', t => {
  sandbox.restore()
  t.end()
})
