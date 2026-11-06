import test from 'tape'
import sinon from 'sinon'
import { BuildsService } from '../../BuildsService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// Set or remove ONE env var of an imported repo (CRUD sweep item 6,
// 2026-11-01):
//   PUT    /core/builds/workspaces/:ws/imports/:repoId/env-vars/:key { value }
//   DELETE /core/builds/workspaces/:ws/imports/:repoId/env-vars/:key
// The PATCH of the import replaces the WHOLE envVars map, so a client that
// changes one variable sends every other one too and loses a variable
// another editor added in between. These write only the one key and answer
// the updated import. (404 env_var_not_found for an unknown key on DELETE;
// 400 invalid_env_var_key for a new odd name on PUT.) Until the build
// variable screen moves to these, it keeps its whole-list write.
// Paths stay literal at the call site (the drift analyzer reads only those).

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new BuildsService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test.onFinish(() => sandbox.restore())

test('setBuildImportEnvVar PUTs { value } to …/imports/:repoId/env-vars/:key', async t => {
  const svc = makeService()
  const repo = { id: 'repo1', envVars: { API_URL: 'https://x.test' } }
  const stub = sandbox.stub(svc, '_call').resolves(repo)
  const out = await svc.setBuildImportEnvVar('ws1', 'repo/1', 'API_URL', 'https://x.test')
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'setBuildImportEnvVar', 'method name')
  t.equal(path, '/builds/workspaces/ws1/imports/repo%2F1/env-vars/API_URL', 'literal path; ids encoded')
  t.equal(opts.method, 'PUT', 'PUT')
  t.deepEqual(opts.body, { value: 'https://x.test' }, 'body: the value only')
  t.deepEqual(out, repo, 'the updated import comes back')
  sandbox.restore()
  t.end()
})

test('removeBuildImportEnvVar DELETEs …/env-vars/:key (key encoded)', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'repo1', envVars: {} })
  await svc.removeBuildImportEnvVar('ws1', 'repo1', 'odd key')
  const [name, path, opts] = stub.firstCall.args
  t.equal(name, 'removeBuildImportEnvVar', 'method name')
  t.equal(path, '/builds/workspaces/ws1/imports/repo1/env-vars/odd%20key', 'key encoded')
  t.equal(opts.method, 'DELETE', 'DELETE')
  t.equal(opts.body, undefined, 'no body')
  sandbox.restore()
  t.end()
})

test('the env var methods need a workspace, a repo and a key', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const cases = [
    [() => svc.setBuildImportEnvVar('', 'repo1', 'K', 'v'), /workspaceId/],
    [() => svc.setBuildImportEnvVar('ws1', '', 'K', 'v'), /repoId/],
    [() => svc.setBuildImportEnvVar('ws1', 'repo1', '', 'v'), /key/],
    [() => svc.removeBuildImportEnvVar('', 'repo1', 'K'), /workspaceId/],
    [() => svc.removeBuildImportEnvVar('ws1', '', 'K'), /repoId/],
    [() => svc.removeBuildImportEnvVar('ws1', 'repo1', ''), /key/]
  ]
  for (const [run, re] of cases) {
    try {
      await run()
      t.fail('a missing argument should throw')
    } catch (err) {
      t.match(String(err.message), re, 'names the missing argument')
    }
  }
  t.equal(stub.callCount, 0, 'nothing is sent')
  sandbox.restore()
  t.end()
})

test("sdk.execute('builds.imports', 'setEnvVar' | 'removeEnvVar', …) maps workspace, repo, key, value", async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const execute = createEntityDispatcher({ getService: (name) => (name === 'builds' ? svc : null) })
  await execute('builds.imports', 'setEnvVar', { workspaceId: 'ws1', repoId: 'repo1', key: 'API_URL', value: 'https://x.test' })
  await execute('builds.imports', 'removeEnvVar', { workspaceId: 'ws1', repoId: 'repo1', key: 'API_URL' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[0], c.args[1], c.args[2].method, c.args[2].body]), [
    ['setBuildImportEnvVar', '/builds/workspaces/ws1/imports/repo1/env-vars/API_URL', 'PUT', { value: 'https://x.test' }],
    ['removeBuildImportEnvVar', '/builds/workspaces/ws1/imports/repo1/env-vars/API_URL', 'DELETE', undefined]
  ])
  sandbox.restore()
  t.end()
})

test('SERVICE_METHODS exposes the env var methods at the top level (builds)', t => {
  t.equal(SERVICE_METHODS.setBuildImportEnvVar, 'builds', 'sdk.setBuildImportEnvVar')
  t.equal(SERVICE_METHODS.removeBuildImportEnvVar, 'builds', 'sdk.removeBuildImportEnvVar')
  t.end()
})
