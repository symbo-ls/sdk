// CORE-CALENDAR-SERIES-BULK-SOFT-DELETE-1 — the bulk future-delete op.
//
// Why a dedicated op instead of the update path: 'workspaceProject.calendar'
// update maps through argMaps.idPayload → [id, payload], which DROPS every
// filter param by design — a params-based bulk write dies inside the SDK
// (the defect this ticket exists for). These tests pin the op's argMap, the
// worker-plane URL/body, and the /core wrapper's contract.

import test from 'tape'
import sinon from 'sinon'

import { createEntityDispatcher } from '../../EntityDispatcher.js'
import { WorkspaceProjectService } from '../../WorkspaceProjectService.js'
import { CalendarService } from '../../CalendarService.js'

test('workspaceProject.calendar deleteFuture maps {seriesId, fromDate, workspaceId} positionally', async (t) => {
  t.plan(1)
  const calls = []
  const execute = createEntityDispatcher({
    getService: () => ({
      calendar: {
        deleteFutureEvents: (...args) => {
          calls.push(args)
          return Promise.resolve({ modified: 2, skipped: 0 })
        }
      }
    })
  })

  await execute('workspaceProject.calendar', 'deleteFuture', {
    seriesId: 'series-abc',
    fromDate: '2026-08-19',
    workspaceId: 'ws-1'
  })

  t.deepEqual(calls[0], ['series-abc', '2026-08-19', 'ws-1'])
  t.end()
})

test('WorkspaceProjectService.calendar.deleteFutureEvents POSTs the delete-future route with the body pair', async (t) => {
  t.plan(4)
  const sandbox = sinon.createSandbox()
  const svc = new WorkspaceProjectService()
  sandbox.stub(svc, '_chatWorkspaceId').callsFake((v) => v || null)
  const ws = sandbox.stub(svc, '_ws').resolves({ modified: 1, skipped: 0 })

  await svc.calendar.deleteFutureEvents('series-abc', '2026-08-19', 'ws-1')

  t.equal(ws.firstCall.args[0], 'calendar.deleteFutureEvents', 'op name')
  t.equal(
    ws.firstCall.args[1],
    '/calendar/events/delete-future?workspaceId=ws-1',
    'delete-future route with explicit workspace routing'
  )
  t.equal(ws.firstCall.args[2].method, 'POST')
  t.deepEqual(ws.firstCall.args[2].body, { seriesId: 'series-abc', fromDate: '2026-08-19' })
  sandbox.restore()
  t.end()
})

test('CalendarService.calendarDeleteFutureEvents wraps POST /calendar/events/delete-future and requires its args', async (t) => {
  t.plan(6)
  const sandbox = sinon.createSandbox()
  const svc = new CalendarService()
  const call = sandbox.stub(svc, '_call').resolves({ modified: 3, skipped: 1 })

  await svc.calendarDeleteFutureEvents({
    seriesId: 'series-abc',
    fromDate: '2026-08-19',
    organization: 'org-1',
    workspaceId: 'ws-1'
  })

  t.equal(call.firstCall.args[0], 'calendarDeleteFutureEvents')
  t.equal(call.firstCall.args[1], '/calendar/events/delete-future', 'URL literal at the call site')
  t.equal(call.firstCall.args[2].method, 'POST')
  t.deepEqual(call.firstCall.args[2].body, {
    seriesId: 'series-abc',
    fromDate: '2026-08-19',
    organization: 'org-1',
    workspaceId: 'ws-1'
  })

  t.throws(
    () => svc.calendarDeleteFutureEvents({ fromDate: '2026-08-19', organization: 'org-1' }),
    /seriesId is required/
  )
  t.throws(
    () => svc.calendarDeleteFutureEvents({ seriesId: 's', fromDate: '2026-08-19' }),
    /organization is required/
  )
  sandbox.restore()
  t.end()
})
