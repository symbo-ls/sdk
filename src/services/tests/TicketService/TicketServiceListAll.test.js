// PLATFORM-TICKETS-LIST-15S-LOSES-THE-CLIENT-RACE-1 — the SDK side of "a
// partial read must never look like a complete one".
//
// `tickets.list()` returns ONE PAGE. The server caps a page at 500 rows, so a
// caller that wants a whole board and calls `list()` gets 500 of 524 back with
// HTTP 200 and no exception. Every caller that wanted the whole set had to
// hand-roll a pager, and the ones that did not are silently wrong: the live
// workspace UI asks `list(filter, { limit: 2000 })`, `{ limit: 3000 }` and
// `{ limit: 10000 }` and receives 500 rows each time.
//
// `listAll()` is the exhaustive read, and it is honest in BOTH directions: it
// pages to the end using the server's own `nextSkip`, and when it cannot
// finish it returns `complete: false` rather than a short array that reads
// like the end of the list.
import test from 'tape'
import sinon from 'sinon'
import { TicketService } from '../../TicketService.js'

const sandbox = sinon.createSandbox()

const makeService = () => {
  const svc = new TicketService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

// A fake server holding `total` tickets, honouring options.limit/skip and
// answering with the honesty envelope the route now returns.
const fakeServer = (total, { cap = 500, defaultLimit = 100 } = {}) => (name, path, opts) => {
  const options = (opts.body && opts.body.options) || {}
  const limit = Math.min(Number(options.limit) || defaultLimit, cap)
  const skip = Number(options.skip) || 0
  const data = Array.from({ length: Math.max(0, Math.min(limit, total - skip)) },
    (_, i) => ({ ticketId: `T-${skip + i}` }))
  const hasMore = skip + data.length < total
  return Promise.resolve({
    data,
    count: total,
    complete: skip === 0 && data.length === total,
    limit,
    skip,
    hasMore,
    nextSkip: hasMore ? skip + data.length : null
  })
}

test('tickets.listAll pages to exhaustion and reports the read complete', async t => {
  t.plan(5)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').callsFake(fakeServer(524))
  const r = await svc.listAll({ workspaceId: 'w1' })

  t.equal(r.items.length, 524, 'every row, not the first page')
  t.equal(r.count, 524, 'the server total')
  t.equal(r.complete, true, 'the read is declared complete')
  t.equal(new Set(r.items.map(i => i.ticketId)).size, 524, 'no duplicate rows across pages')
  t.equal(stub.callCount, 2, 'two pages at the 500 cap')
  sandbox.restore()
  t.end()
})

test('tickets.listAll on a board that fits in one page makes one call', async t => {
  t.plan(3)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').callsFake(fakeServer(337))
  const r = await svc.listAll({ workspaceId: 'w1' })
  t.equal(r.items.length, 337, 'all rows')
  t.equal(r.complete, true, 'complete')
  t.equal(stub.callCount, 1, 'no wasted round trip')
  sandbox.restore()
  t.end()
})

test('tickets.listAll REFUSES to report a partial read as complete', async t => {
  t.plan(3)
  const svc = makeService()
  // maxPages exhausted before the board is: the honest answer is a partial,
  // clearly marked — never a short array that reads as the end of the list.
  sandbox.stub(svc, '_call').callsFake(fakeServer(5000))
  const r = await svc.listAll({ workspaceId: 'w1' }, {}, { maxPages: 2 })

  t.equal(r.complete, false, 'a read that did not finish is complete:false')
  t.equal(r.items.length, 1000, 'the rows it did read are still returned')
  t.ok(/1000/.test(r.incomplete || '') && /5000/.test(r.incomplete || ''),
    'it says how far it got and how far it had to go')
  sandbox.restore()
  t.end()
})

test('tickets.listAll drives paging from the server nextSkip, not its own arithmetic', async t => {
  t.plan(2)
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').callsFake(fakeServer(250, { cap: 100 }))
  const r = await svc.listAll({ workspaceId: 'w1' })
  const skips = stub.getCalls().map(c => c.args[2].body.options.skip)
  t.deepEqual(skips, [0, 100, 200], 'each page starts where the last one ended')
  t.equal(r.items.length, 250, 'all rows')
  sandbox.restore()
  t.end()
})

test('tickets.listAll survives a server that sends no honesty envelope', async t => {
  t.plan(2)
  const svc = makeService()
  // An older deployment answers a bare { data, count }. A short page is still
  // the end of the list, so the read completes rather than looping forever.
  sandbox.stub(svc, '_call').callsFake((name, path, opts) => {
    const options = (opts.body && opts.body.options) || {}
    const limit = Math.min(Number(options.limit) || 100, 500)
    const skip = Number(options.skip) || 0
    return Promise.resolve({
      data: Array.from({ length: Math.max(0, Math.min(limit, 524 - skip)) },
        (_, i) => ({ ticketId: `T-${skip + i}` })),
      count: 524
    })
  })
  const r = await svc.listAll({ workspaceId: 'w1' })
  t.equal(r.items.length, 524, 'all rows without the envelope')
  t.equal(r.complete, true, 'complete by the count it did get')
  sandbox.restore()
  t.end()
})
