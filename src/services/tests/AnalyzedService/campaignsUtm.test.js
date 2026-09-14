import test from 'tape'
import sinon from 'sinon'
import { AnalyzedService, UTM_FILTER_KEYS, UTM_NONE } from '../../AnalyzedService.js'

// CORE-ANALYZED-UTM-ATTRIBUTION-1: the first-touch attribution surface.
// listSessions / totals forward the utm filters (utmSource / utmMedium /
// utmCampaign → same-named params, the `__none__` sentinel verbatim);
// campaigns builds GET /analyzed/campaigns with groupBy + the family /
// project / window params + limit / offset, and never a tz. Asserts the
// CONDITION (the param is on the wire), never absence of error.

const sandbox = sinon.createSandbox()
const WS = '6a5d537c40799ea23a704560'

const stubbed = () => {
  const svc = new AnalyzedService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  return { svc, stub }
}
const urlOf = (stub) => stub.firstCall.args[1]
const pathOf = (stub) => urlOf(stub).split('?')[0]
const paramsOf = (stub) => new URLSearchParams(urlOf(stub).split('?')[1] || '')

test('listSessions / totals forward utmSource / utmMedium / utmCampaign verbatim (the server normalises)', async (t) => {
  t.deepEqual(UTM_FILTER_KEYS, ['utmSource', 'utmMedium', 'utmCampaign'])
  for (const m of ['listSessions', 'totals']) {
    const { svc, stub } = stubbed()
    await svc[m]({ family: 'projects', utmSource: ' Google ', utmMedium: 'CPC', utmCampaign: 'Spring Sale' })
    const p = paramsOf(stub)
    t.equal(p.get('utmSource'), ' Google ', `${m} utmSource as given`)
    t.equal(p.get('utmMedium'), 'CPC', `${m} utmMedium`)
    t.equal(p.get('utmCampaign'), 'Spring Sale', `${m} utmCampaign`)
    t.equal(p.get('family'), 'projects', `${m} keeps family`)
    sandbox.restore()
  }
  t.end()
})

test('the __none__ sentinel travels as-is; absent / empty utm emit no param; term / content are not filters', async (t) => {
  t.equal(UTM_NONE, '__none__')
  let r = stubbed()
  await r.svc.listSessions({ utmSource: UTM_NONE })
  t.equal(paramsOf(r.stub).get('utmSource'), '__none__')
  sandbox.restore()

  for (const v of [undefined, null, '']) {
    r = stubbed()
    await r.svc.totals({ utmSource: v, utmMedium: v, utmCampaign: v })
    t.equal(urlOf(r.stub), '/analyzed/totals', `no stray param for ${String(v)}`)
    sandbox.restore()
  }

  r = stubbed()
  await r.svc.listSessions({ utmTerm: 'x', utmContent: 'y' })
  t.equal(paramsOf(r.stub).has('utmTerm'), false)
  t.equal(paramsOf(r.stub).has('utmContent'), false)
  sandbox.restore()
  t.end()
})

test('campaigns builds GET /analyzed/campaigns with the full param set', async (t) => {
  const { svc, stub } = stubbed()
  await svc.campaigns(
    {
      family: 'projects',
      groupBy: 'source',
      projectId: 'landing',
      since: new Date('2026-09-01T00:00:00Z'),
      utmCampaign: 'Launch',
      tz: 'Asia/Tbilisi',
      workspaceId: WS
    },
    { limit: 50, offset: 100 }
  )
  t.equal(stub.firstCall.args[0], 'analyzed.campaigns', 'op name')
  t.equal(pathOf(stub), '/analyzed/campaigns')
  const p = paramsOf(stub)
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('groupBy'), 'source')
  t.equal(p.get('projectId'), 'landing')
  t.equal(p.get('since'), '2026-09-01T00:00:00.000Z', 'Date → ISO')
  t.equal(p.get('utmCampaign'), 'Launch')
  t.equal(p.get('limit'), '50')
  t.equal(p.get('offset'), '100')
  t.equal(p.get('workspaceId'), WS)
  t.equal(p.has('tz'), false, 'no calendar bucket → no tz')
  sandbox.restore()
  t.end()
})

test('campaigns: excludeProjectId, options.workspaceId, bare path with nothing', async (t) => {
  let r = stubbed()
  await r.svc.campaigns({ excludeProjectId: 'workspace' }, { workspaceId: WS })
  t.equal(paramsOf(r.stub).get('excludeProjectId'), 'workspace')
  t.equal(paramsOf(r.stub).get('workspaceId'), WS, 'workspaceId from the options bag')
  sandbox.restore()

  r = stubbed()
  await r.svc.campaigns()
  t.equal(urlOf(r.stub), '/analyzed/campaigns', 'bare path, no stray "?"')
  sandbox.restore()
  t.end()
})

test('listSessions forwards filter.visitorId (addendum); absent → no param', async (t) => {
  let r = stubbed()
  await r.svc.listSessions({ visitorId: 'vid-1', family: 'projects' })
  t.equal(paramsOf(r.stub).get('visitorId'), 'vid-1')
  sandbox.restore()
  r = stubbed()
  await r.svc.listSessions({ family: 'projects' })
  t.equal(paramsOf(r.stub).has('visitorId'), false)
  sandbox.restore()
  t.end()
})

test('daily builds GET /analyzed/daily with family / tz / days / project params (addendum 2)', async (t) => {
  let r = stubbed()
  await r.svc.daily({
    family: 'projects',
    tz: 'Asia/Tbilisi',
    days: 30,
    projectId: 'landing',
    workspaceId: WS
  })
  t.equal(r.stub.firstCall.args[0], 'analyzed.daily', 'op name')
  t.equal(pathOf(r.stub), '/analyzed/daily')
  let p = paramsOf(r.stub)
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('tz'), 'Asia/Tbilisi')
  t.equal(p.get('days'), '30')
  t.equal(p.get('projectId'), 'landing')
  t.equal(p.get('workspaceId'), WS)
  sandbox.restore()

  r = stubbed()
  await r.svc.daily({ excludeProjectId: 'workspace' })
  p = paramsOf(r.stub)
  t.equal(p.get('excludeProjectId'), 'workspace')
  t.equal(p.has('days'), false, 'server default applies')
  t.equal(p.has('tz'), false, 'UTC by default')
  sandbox.restore()

  r = stubbed()
  await r.svc.daily()
  t.equal(urlOf(r.stub), '/analyzed/daily', 'bare path, no stray "?"')
  sandbox.restore()
  t.end()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
