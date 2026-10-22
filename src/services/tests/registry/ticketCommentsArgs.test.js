import test from 'tape'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

// Dispatch-layer contract for `tickets.comments` list. The route used the
// generic CRUD_ARG_MAP, whose (filter, options) split handed
// comments.list(ticketId, options) the filter OBJECT as the ticket id and
// dropped flat paging keys other than `limit`. These lock the
// (ticketId, { limit, skip, sortBy, sortDir, includeCount }) shape.

const makeSdk = (calls) => ({
  getService: () => ({
    comments: {
      list: (...args) => (calls.push({ method: 'list', args }), Promise.resolve([])),
      create: (...args) => (calls.push({ method: 'create', args }), Promise.resolve({}))
    }
  })
})

const listArgs = async (a) => {
  const calls = []
  await createEntityDispatcher(makeSdk(calls))('tickets.comments', 'list', a)
  return calls[0].args
}

test('tickets.comments list accepts a bare ticket id', async (t) => {
  t.deepEqual(await listArgs('T1'), ['T1', {}], 'id positional, empty options')
  t.end()
})

test('tickets.comments list reads ticketId / id / filter shapes', async (t) => {
  t.equal((await listArgs({ ticketId: 'T1' }))[0], 'T1', 'flat ticketId')
  t.equal((await listArgs({ id: 'T1' }))[0], 'T1', 'flat id')
  t.equal((await listArgs({ filter: 'T1' }))[0], 'T1', 'string filter')
  t.equal((await listArgs({ filter: { ticketId: 'T1' } }))[0], 'T1', 'packed filter.ticketId')
  t.equal((await listArgs({ params: { id: 'T1' } }))[0], 'T1', 'packed params.id')
  t.end()
})

test('tickets.comments list threads flat and packed paging keys', async (t) => {
  t.deepEqual(
    (await listArgs({ ticketId: 'T1', limit: 20, skip: 40, sortBy: 'createdAt', sortDir: 'desc', includeCount: true }))[1],
    { limit: 20, skip: 40, sortBy: 'createdAt', sortDir: 'desc', includeCount: true },
    'flat keys become options'
  )
  t.deepEqual(
    (await listArgs({ filter: 'T1', options: { limit: 20, skip: 40 } }))[1],
    { limit: 20, skip: 40 },
    'options pack passes through'
  )
  t.deepEqual(
    (await listArgs({ ticketId: 'T1', limit: 20, offset: 40, workspaceId: 'ws_1' }))[1],
    { limit: 20 },
    'keys the route does not read are not lifted into options'
  )
  t.end()
})

test('tickets.comments create keeps the CRUD payload map', async (t) => {
  const calls = []
  await createEntityDispatcher(makeSdk(calls))('tickets.comments', 'create', { payload: 'hi' })
  t.deepEqual(calls[0].args, ['hi'], 'payload positional')
  t.end()
})
