import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'

// Announcements — Mongo cutover complete (SDK side). Every method routes
// unconditionally to the /core/announcements routes and unwraps the
// `{ announcements } / { announcement }` envelope back to the array/row shape
// the readers consume. The legacy _sbCrud('announcements') rollback arm is
// gone (workspace-project Supabase org retired). These tests assert the /core
// wire shapes without a live server.

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('announcements.list hits GET /core/announcements + unwraps the array', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcements: [{ id: 5, title: 'mongo' }] })
  const out = await svc.announcements.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements', 'targets the /core/announcements route (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  t.deepEqual(out, [{ id: 5, title: 'mongo' }], '{ announcements } envelope unwrapped to the array')
  sandbox.restore()
  t.end()
})

test('announcements.get GETs /core/announcements/:id + unwraps { announcement }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcement: { id: 5, title: 'mongo' } })
  const out = await svc.announcements.get(5)
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements/5', 'id sub-path')
  t.equal(opts.method, 'GET', 'GET')
  t.deepEqual(out, { id: 5, title: 'mongo' }, '{ announcement } unwrapped to the row')
  sandbox.restore()
  t.end()
})

test('announcements.create POSTs { payload } + unwraps { announcement }', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcement: { id: 7, title: 'm' } })
  const out = await svc.announcements.create({ title: 'm' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements', 'POST /core/announcements')
  t.deepEqual(JSON.parse(opts.body), { payload: { title: 'm' } }, 'payload wrapped')
  t.deepEqual(out, { id: 7, title: 'm' }, '{ announcement } unwrapped to the row')
  sandbox.restore()
  t.end()
})

test('announcements.{update,remove} PUT/DELETE the /core id sub-path', async (t) => {
  t.plan(4)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request')
  reqStub.onFirstCall().resolves({ announcement: { id: 1, title: 'y' } })
  reqStub.onSecondCall().resolves({ ok: true })
  const upd = await svc.announcements.update(1, { title: 'y' })
  await svc.announcements.remove(1)
  t.equal(reqStub.firstCall.args[0], '/announcements/1', 'update endpoint')
  t.equal(reqStub.firstCall.args[1].method, 'PUT', 'PUT on update')
  t.deepEqual(upd, { id: 1, title: 'y' }, '{ announcement } unwrapped on update')
  t.equal(reqStub.secondCall.args[1].method, 'DELETE', 'DELETE on remove')
  sandbox.restore()
  t.end()
})

test('announcements.toggleReaction POSTs to /:id/reactions with emoji+reactor', async (t) => {
  t.plan(3)
  const svc = makeService()
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcement: { id: 1, reactions: { '🚀': ['Nika'] } } })
  const out = await svc.announcements.toggleReaction(1, '🚀', 'Nika')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements/1/reactions', 'reactions sub-path')
  t.deepEqual(JSON.parse(opts.body), { emoji: '🚀', reactor: 'Nika' }, 'emoji + reactor in body')
  t.deepEqual(out.reactions, { '🚀': ['Nika'] }, 'updated reactions returned')
  sandbox.restore()
  t.end()
})
