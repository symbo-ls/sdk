import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for project version history (workspace Version
// History UI, 2026-08-07). The 'project.versions' route unpacks both the
// imperative bag ({ projectId, branch }) and the fetch-adapter pack
// ({ filter, params }) into ProjectService positionals. Also pins the
// project.remove fix — the route used to point at 'deleteProject', a method
// that has never existed on ProjectService (it's removeProject), so every
// sdk.execute('project','remove',…) threw.

const spy = (calls, service, method) => (...args) => {
  calls.push({ service, method, args })
  return Promise.resolve({ ok: true })
}

const makeSdk = (calls) => {
  const project = {
    getProjectVersions: spy(calls, 'project', 'getProjectVersions'),
    getProjectVersion: spy(calls, 'project', 'getProjectVersion'),
    restoreProjectVersion: spy(calls, 'project', 'restoreProjectVersion'),
    removeProject: spy(calls, 'project', 'removeProject')
  }
  return { getService: (name) => (name === 'project' ? project : {}) }
}

// ── project.versions list ───────────────────────────────────────────────

test('project.versions list — imperative bag unpacks to positionals', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('project.versions', 'list', { projectId: 'p1', branch: 'main', page: 2, limit: 30 })
  t.deepEqual(calls[0], {
    service: 'project',
    method: 'getProjectVersions',
    args: ['p1', { branch: 'main', page: 2, limit: 30, fields: undefined }]
  })
  t.end()
})

test('project.versions list — fetch-adapter pack (params) resolves', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('project.versions', 'list', { params: { projectId: 'p1', branch: 'dev', limit: 10 } })
  t.deepEqual(calls[0].args, ['p1', { branch: 'dev', page: undefined, limit: 10, fields: undefined }])
  t.end()
})

// ── project.versions get ────────────────────────────────────────────────

test('project.versions get — versionId via id alias', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('project.versions', 'get', { projectId: 'p1', id: 'v9' })
  t.deepEqual(calls[0].args, ['p1', 'v9'])
  t.end()
})

// ── project.versions rpc (restore) ──────────────────────────────────────

test('project.versions rpc — restore maps version + options', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('project.versions', 'rpc', { projectId: 'p1', version: '1.2.3', message: 'roll back' })
  t.deepEqual(calls[0], {
    service: 'project',
    method: 'restoreProjectVersion',
    args: ['p1', '1.2.3', { message: 'roll back', branch: undefined, type: undefined }]
  })
  t.end()
})

// ── project remove regression ───────────────────────────────────────────

test('project remove — routes to removeProject (deleteProject never existed)', async t => {
  const calls = []
  const execute = createEntityDispatcher(makeSdk(calls))
  await execute('project', 'remove', 'p1')
  t.equal(calls[0].method, 'removeProject', 'resolves the real method name')
  t.end()
})
