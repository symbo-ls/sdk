import test from 'tape'
import sinon from 'sinon'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// The dispatcher's getRoute introspector is the only public way to read
// route config — used here to verify the calendar entity exposes upsert.
const getRoute = createEntityDispatcher({ getService: () => ({}) }).getRoute

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_requireReady').resolves()
  return svc
}

test('calendar.upsertEvent routes through _sb with default on_conflict=id', async t => {
  t.plan(5)
  const svc = makeService()
  const sbStub = sandbox.stub(svc, '_sb').resolves({ data: { id: 'e1' } })
  const payload = { id: 'e1', title: 'Standup', start_at: '2026-05-14T09:00:00Z' }
  await svc.calendar.upsertEvent(payload)
  const [methodName, table, op, args] = sbStub.firstCall.args
  t.equal(methodName, 'calendar.upsertEvent', 'methodName tag')
  t.equal(table, 'calendar_events', 'targets calendar_events table')
  t.equal(op, 'create', 'op=create (PostgREST upsert is POST + Prefer)')
  t.deepEqual(args.payload, payload, 'payload passes through unchanged')
  t.equal(args.options.upsertOnConflict, 'id', 'default on_conflict = id')
  sandbox.restore()
  t.end()
})

test('calendar.upsertEvent honors caller-supplied onConflict', async t => {
  t.plan(1)
  const svc = makeService()
  const sbStub = sandbox.stub(svc, '_sb').resolves({ data: {} })
  await svc.calendar.upsertEvent(
    { google_calendar_id: 'cal-1', google_event_id: 'evt-2', title: 'Synced' },
    'google_calendar_id,google_event_id'
  )
  t.equal(
    sbStub.firstCall.args[3].options.upsertOnConflict,
    'google_calendar_id,google_event_id',
    'forwards multi-column on_conflict'
  )
  sandbox.restore()
  t.end()
})

test('dispatcher route workspaceProject.calendar exposes upsert → calendar.upsertEvent', t => {
  t.plan(2)
  const route = getRoute('workspaceProject.calendar')
  t.equal(route.methods.upsert, 'calendar.upsertEvent', 'methods.upsert mapped')
  const args = route.argMap.upsert({
    payload: { id: 'x', title: 'y' },
    onConflict: 'id',
  })
  t.deepEqual(
    args,
    [{ id: 'x', title: 'y' }, 'id'],
    'argMap extracts (payload, onConflict) tuple'
  )
  t.end()
})

test('dispatcher argMap falls back: data → payload; bare arg → payload', t => {
  t.plan(2)
  const route = getRoute('workspaceProject.calendar')
  t.deepEqual(
    route.argMap.upsert({ data: { id: '1' } }),
    [{ id: '1' }, undefined],
    'data field treated as payload'
  )
  t.deepEqual(
    route.argMap.upsert({ id: '2', title: 'bare' }),
    [{ id: '2', title: 'bare' }, undefined],
    'bare object treated as payload when neither payload nor data present'
  )
  t.end()
})
