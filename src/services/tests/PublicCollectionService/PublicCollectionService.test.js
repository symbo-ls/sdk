import test from 'tape'
import sinon from 'sinon'
import { PublicCollectionService } from '../../PublicCollectionService.js'
import { BaseService } from '../../BaseService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'
import { createEntityDispatcher } from '../../EntityDispatcher.js'

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new PublicCollectionService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}
const WS = '6abf753bb2ad7ff22fd6954b'
const METHODS = ['listPublicRecords', 'getPublicRecord', 'submitPublicRecord', 'votePublicRecord']

test('listPublicRecords GETs the collection with no query string by default', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ items: [], pagination: {} })
  await svc.listPublicRecords(WS, 'startups')
  t.equal(stub.firstCall.args[0], 'listPublicRecords')
  t.equal(stub.firstCall.args[1], `/public/${WS}/collections/startups`)
  sandbox.restore()
  t.end()
})

test('listPublicRecords threads q / where / sort / limit / page', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.listPublicRecords(WS, 'startups', {
    q: 'pay & go',
    where: { sector: 'fintech', 'data.stage': 'seed', skip: undefined },
    sort: ['data.featured:-1', 'createdAt:-1'],
    limit: 10,
    page: 2
  })
  const url = new URL(`http://x${stub.firstCall.args[1]}`)
  t.equal(url.pathname, `/public/${WS}/collections/startups`)
  t.equal(url.searchParams.get('q'), 'pay & go')
  t.equal(url.searchParams.get('where[data.sector]'), 'fintech', 'data. prefix added')
  t.equal(url.searchParams.get('where[data.stage]'), 'seed', 'existing prefix kept')
  t.notOk(url.searchParams.has('where[data.skip]'), 'undefined where values dropped')
  t.equal(url.searchParams.get('sort'), 'data.featured:-1,createdAt:-1')
  t.equal(url.searchParams.get('limit'), '10')
  t.equal(url.searchParams.get('page'), '2')
  sandbox.restore()
  t.end()
})

test('scope accepts an org slug as well as a workspace id', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.listPublicRecords('ventures', 'startups')
  t.equal(stub.firstCall.args[1], '/public/ventures/collections/startups')
  await svc.votePublicRecord('ventures', 'launches', 'r1')
  t.equal(stub.secondCall.args[1], '/public/ventures/collections/launches/r1/vote')
  sandbox.restore()
  t.end()
})

test('getPublicRecord encodes the id-or-slug', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  await svc.getPublicRecord(WS, 'startups', 'a/b')
  t.equal(stub.firstCall.args[0], 'getPublicRecord')
  t.equal(stub.firstCall.args[1], `/public/${WS}/collections/startups/a%2Fb`)
  sandbox.restore()
  t.end()
})

test('submitPublicRecord POSTs { data, captchaToken, <honeypot> }', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ id: 'x', status: 'pending' })
  await svc.submitPublicRecord(WS, 'startups', { name: 'Acme' }, {
    captchaToken: 'tok',
    honeypot: { field: 'website_url', value: '' }
  })
  t.equal(stub.firstCall.args[0], 'submitPublicRecord')
  t.equal(stub.firstCall.args[1], `/public/${WS}/collections/startups/submissions`)
  t.deepEqual(stub.firstCall.args[2], {
    method: 'POST',
    body: { data: { name: 'Acme' }, captchaToken: 'tok', website_url: '' }
  })
  await svc.submitPublicRecord(WS, 'startups', { name: 'B' })
  t.deepEqual(stub.secondCall.args[2].body, { data: { name: 'B' } }, 'no token, no honeypot keys')
  sandbox.restore()
  t.end()
})

test('votePublicRecord POSTs to /:id/vote', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({ count: 1, voted: true })
  await svc.votePublicRecord(WS, 'launches', 'abc')
  t.equal(stub.firstCall.args[0], 'votePublicRecord')
  t.equal(stub.firstCall.args[1], `/public/${WS}/collections/launches/abc/vote`)
  t.equal(stub.firstCall.args[2].method, 'POST')
  sandbox.restore()
  t.end()
})

test('every method validates its required arguments', async t => {
  const svc = makeService()
  sandbox.stub(svc, '_call').resolves({})
  const cases = [
    () => svc.listPublicRecords(),
    () => svc.listPublicRecords(WS),
    () => svc.getPublicRecord(WS, 'k'),
    () => svc.submitPublicRecord(WS, 'k'),
    () => svc.submitPublicRecord(WS, 'k', ['x']),
    () => svc.votePublicRecord(WS, 'k')
  ]
  for (const fn of cases) t.throws(fn, /required|must be/)
  sandbox.restore()
  t.end()
})

test('all four methods are anonymous (no-auth set) and proxied at top level', t => {
  const base = new BaseService()
  for (const m of METHODS) {
    t.equal(base._requiresInit(m), false, `${m} needs no auth`)
    t.equal(SERVICE_METHODS[m], 'publicRecords', `${m} → publicRecords`)
  }
  t.end()
})

test('EntityDispatcher: publicRecords list/insert/vote + publicRecord single read', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_call').resolves({})
  const execute = createEntityDispatcher({ getService: () => svc })
  await execute('publicRecords', 'list', {
    filter: { workspaceId: WS, key: 'startups', q: 'x' },
    workspaceId: WS,
    key: 'startups',
    q: 'x',
    limit: 5
  })
  t.equal(stub.lastCall.args[1], `/public/${WS}/collections/startups?q=x&limit=5`)
  await execute('publicRecord', 'list', { scope: 'ventures', key: 'startups', slug: 'acme' })
  t.equal(stub.lastCall.args[1], '/public/ventures/collections/startups/acme')
  await execute('publicRecords', 'create', {
    payload: { name: 'A' },
    data: { name: 'A' },
    workspaceId: WS,
    key: 'startups',
    captchaToken: 't'
  })
  t.deepEqual(stub.lastCall.args[2].body, { data: { name: 'A' }, captchaToken: 't' })
  await execute('publicRecords', 'vote', { workspaceId: WS, collection: 'launches', id: 'r1' })
  t.equal(stub.lastCall.args[1], `/public/${WS}/collections/launches/r1/vote`)
  sandbox.restore()
  t.end()
})
