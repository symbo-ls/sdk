import test from 'tape'
import sinon from 'sinon'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ProjectService } from '../../ProjectService.js'
import { ProjectService as DistProjectService } from '../../../../dist/esm/src/services/ProjectService.js'

const sandbox = sinon.createSandbox()

const SRC = fileURLToPath(new URL('../../ProjectService.js', import.meta.url))
const DIST = fileURLToPath(
  new URL('../../../../dist/esm/src/services/ProjectService.js', import.meta.url)
)

// Counts the declared parameters of `async duplicateProject (...)` in a file.
// Function.length stops at the first defaulted parameter, so it reads 4 for
// BOTH the old (id, name, key, targetUserId) shape and the new
// (id, name, key, targetUserId, options = {}) one — it cannot tell them apart.
const declaredParams = file => {
  const text = readFileSync(file, 'utf8')
  const at = text.indexOf('async duplicateProject')
  const open = text.indexOf('(', at)
  const close = text.indexOf(')', open)
  return text
    .slice(open + 1, close)
    .split(',')
    .map(p => p.trim())
    .filter(Boolean).length
}

const bodyOf = async Service => {
  const svc = new Service()
  sandbox.stub(svc, '_requireReady').resolves()
  const stub = sandbox.stub(svc, '_request').resolves({ success: true, data: { ok: true } })
  await svc.duplicateProject('proj-1', 'My Fork', 'my-fork', 'user-9', {
    targetOwnerOrganization: 'org-7',
    fork: true
  })
  const call = stub.firstCall
  sandbox.restore()
  return { path: call.args[0], opts: call.args[1], body: JSON.parse(call.args[1].body) }
}

test('duplicateProject carries fork + targetOwnerOrganization into the POST body', async t => {
  t.plan(3)
  const { path, opts, body } = await bodyOf(ProjectService)
  t.equal(path, '/projects/proj-1/duplicate')
  t.equal(opts.method, 'POST')
  t.deepEqual(body, {
    name: 'My Fork',
    key: 'my-fork',
    targetUserId: 'user-9',
    targetOwnerOrganization: 'org-7',
    fork: true
  })
  t.end()
})

// Regression: ENV-SDK-CHECKOUT-BEHIND-DROPS-NEW-ARGS-1. `dist/esm` is what every
// browser loads (root node_modules/@symbo.ls/sdk is a symlink to this package and
// the "import"/"default" export conditions both resolve to dist/esm). A dist that
// lags src drops any newly added argument BEFORE the request is composed — no
// throw, no warning, just a plain duplicate instead of a fork.
test('dist/esm duplicateProject is not behind src', async t => {
  t.plan(2)
  t.equal(
    declaredParams(DIST),
    declaredParams(SRC),
    'dist/esm and src declare the same duplicateProject parameter count — rebuild with `npm run build:esm` if this fails'
  )
  const { body } = await bodyOf(DistProjectService)
  t.deepEqual(body, {
    name: 'My Fork',
    key: 'my-fork',
    targetUserId: 'user-9',
    targetOwnerOrganization: 'org-7',
    fork: true
  })
  t.end()
})
