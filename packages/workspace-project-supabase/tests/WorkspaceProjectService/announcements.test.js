import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// Announcements DORMANT Supabase → Mongo cutover (SDK side). The default path
// (_useCoreAnnouncements() === false) MUST be byte-identical to today: every
// method delegates to the _sbCrud('announcements') surface (generic /sb
// passthrough). The on-flag path repoints to the Mongo /core/announcements
// routes and unwraps the envelope back to the array/row shape the readers
// consume. These tests assert BOTH directions without a live server.

const sandbox = sinon.createSandbox()

// Build a service whose _useCoreAnnouncements() returns `flag`, with the
// _sbCrud surface + _request stubbed so we can observe which path each method
// takes. The `announcements` object is constructed in the field initializer and
// captures `this`, so post-construction stubs are honored by the arrow methods.
const makeService = (flag) => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  sandbox.stub(svc, '_useCoreAnnouncements').returns(flag)
  // Stub the captured _sbCrud surface methods (default path target).
  svc._announcementsSb = {
    list: sandbox.stub().resolves([{ id: 1, title: 'sb' }]),
    get: sandbox.stub().resolves({ id: 1, title: 'sb' }),
    create: sandbox.stub().resolves({ id: 2, title: 'sb-new' }),
    update: sandbox.stub().resolves({ id: 1, title: 'sb-upd' }),
    remove: sandbox.stub().resolves(null),
  }
  return svc
}

// ── DEFAULT (dormant) path — byte-identical _sbCrud delegation ──────────────

test('announcements.list (default OFF) delegates to _sbCrud, /core never touched', async (t) => {
  t.plan(4)
  const svc = makeService(false)
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  const out = await svc.announcements.list({ tag: 'product' }, { order: 'date' })
  t.ok(svc._announcementsSb.list.calledOnce, '_sbCrud.list invoked')
  t.deepEqual(svc._announcementsSb.list.firstCall.args, [{ tag: 'product' }, { order: 'date' }], 'filter+options forwarded unchanged')
  t.equal(reqStub.callCount, 0, '_request (/core) never called in the default path')
  t.deepEqual(out, [{ id: 1, title: 'sb' }], 'returns the raw _sbCrud array (reader parity)')
  sandbox.restore()
  t.end()
})

test('announcements.{get,create,update,remove} (default OFF) all delegate to _sbCrud', async (t) => {
  t.plan(5)
  const svc = makeService(false)
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  await svc.announcements.get(1)
  await svc.announcements.create({ title: 'x' })
  await svc.announcements.update(1, { title: 'y' })
  await svc.announcements.remove(1)
  t.ok(svc._announcementsSb.get.calledOnce, 'get → _sbCrud')
  t.ok(svc._announcementsSb.create.calledOnce, 'create → _sbCrud')
  t.ok(svc._announcementsSb.update.calledOnce, 'update → _sbCrud')
  t.ok(svc._announcementsSb.remove.calledOnce, 'remove → _sbCrud')
  t.equal(reqStub.callCount, 0, '/core never touched for any default-path verb')
  sandbox.restore()
  t.end()
})

test('announcements.toggleReaction (default OFF) is a no-op → null (preserves local-only behavior)', async (t) => {
  t.plan(2)
  const svc = makeService(false)
  const reqStub = sandbox.stub(svc, '_request').rejects(new Error('CORE PATH MUST NOT BE HIT'))
  const out = await svc.announcements.toggleReaction(1, '🚀', 'Nika')
  t.equal(out, null, 'resolves null — no persisted reaction in the default path')
  t.equal(reqStub.callCount, 0, '/core never called')
  sandbox.restore()
  t.end()
})

// ── ON-flag path — Mongo /core/announcements repoint + envelope unwrap ──────

test('announcements.list (flag ON) hits GET /core/announcements + unwraps the array', async (t) => {
  t.plan(4)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcements: [{ id: 5, title: 'mongo' }] })
  const out = await svc.announcements.list()
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements', 'targets the /core/announcements route (BaseService prepends /core)')
  t.equal(opts.method, 'GET', 'GET')
  t.ok(svc._announcementsSb.list.notCalled, 'default _sbCrud NOT called when flag is on')
  t.deepEqual(out, [{ id: 5, title: 'mongo' }], '{ announcements } envelope unwrapped to the array')
  sandbox.restore()
  t.end()
})

test('announcements.create (flag ON) POSTs { payload } + unwraps { announcement }', async (t) => {
  t.plan(3)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcement: { id: 7, title: 'm' } })
  const out = await svc.announcements.create({ title: 'm' })
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements', 'POST /core/announcements')
  t.deepEqual(JSON.parse(opts.body), { payload: { title: 'm' } }, 'payload wrapped')
  t.deepEqual(out, { id: 7, title: 'm' }, '{ announcement } unwrapped to the row')
  sandbox.restore()
  t.end()
})

test('announcements.toggleReaction (flag ON) POSTs to /:id/reactions with emoji+reactor', async (t) => {
  t.plan(3)
  const svc = makeService(true)
  const reqStub = sandbox.stub(svc, '_request').resolves({ announcement: { id: 1, reactions: { '🚀': ['Nika'] } } })
  const out = await svc.announcements.toggleReaction(1, '🚀', 'Nika')
  const [endpoint, opts] = reqStub.firstCall.args
  t.equal(endpoint, '/announcements/1/reactions', 'reactions sub-path')
  t.deepEqual(JSON.parse(opts.body), { emoji: '🚀', reactor: 'Nika' }, 'emoji + reactor in body')
  t.deepEqual(out.reactions, { '🚀': ['Nika'] }, 'updated reactions returned')
  sandbox.restore()
  t.end()
})
