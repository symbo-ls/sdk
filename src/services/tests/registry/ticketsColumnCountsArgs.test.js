import test from 'tape'

import { createEntityDispatcher } from '../../EntityDispatcher.js'

// sdk.execute('tickets', 'columnCounts', …) must carry `groupBy` through to
// TicketService.columnCounts — a dropped groupBy silently answers the column
// map to a caller that reads it as type counts.
const dispatcherWithSpy = () => {
  const calls = []
  const execute = createEntityDispatcher({
    getService: () => ({
      columnCounts: (...args) => {
        calls.push(args)
        return Promise.resolve({})
      }
    })
  })
  return { calls, execute }
}

test('tickets.columnCounts { filter, groupBy } → columnCounts(filter, { groupBy })', async (t) => {
  t.plan(2)
  const { calls, execute } = dispatcherWithSpy()
  await execute('tickets', 'columnCounts', { filter: { workspaceId: 'ws-1' }, groupBy: 'type' })
  t.deepEqual(calls[0][0], { workspaceId: 'ws-1' }, 'the filter')
  t.deepEqual(calls[0][1], { groupBy: 'type' }, 'the groupBy option')
  t.end()
})

test('tickets.columnCounts keeps the older call shapes: { filter } and a bare filter', async (t) => {
  t.plan(3)
  const { calls, execute } = dispatcherWithSpy()
  await execute('tickets', 'columnCounts', { filter: { workspaceId: 'ws-1' } })
  await execute('tickets', 'columnCounts', { workspaceId: 'ws-2' })
  t.deepEqual(calls[0][0], { workspaceId: 'ws-1' }, '{ filter } unwraps the filter')
  t.equal(calls[0][1]?.groupBy, undefined, 'no groupBy invented')
  t.deepEqual(calls[1], [{ workspaceId: 'ws-2' }], 'a bare filter is still the one-argument call')
  t.end()
})
