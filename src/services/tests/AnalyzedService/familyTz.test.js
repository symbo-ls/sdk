import test from 'tape'
import sinon from 'sinon'
import { AnalyzedService } from '../../AnalyzedService.js'

// CORE-ANALYZED-KIND-UTC-TOTALS-ROLLUPS-1: every analyzed read forwards the
// session FAMILY (`filter.family` → `?family=`), the calendar rollups
// forward the viewer's zone (`filter.tz` → `?tz=`), and the overall-totals
// section (totals / pages / referrers) builds its URLs in the same style.
// Asserts the CONDITION (the param is on the wire), never absence of error.

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

const ROLLUPS = ['now', 'weekly', 'changes', 'demographics', 'totals']
const LISTS = ['listSessions', 'listEvents', 'listUsers', 'activeUsers', 'listBugs', 'pages', 'referrers']

test('every read forwards filter.family', async (t) => {
  for (const m of ROLLUPS) {
    const { svc, stub } = stubbed()
    await svc[m]({ family: 'projects', projectId: 'landing' })
    t.equal(paramsOf(stub).get('family'), 'projects', `${m} carries family`)
    t.equal(paramsOf(stub).get('projectId'), 'landing', `${m} keeps projectId`)
    sandbox.restore()
  }
  for (const m of LISTS) {
    const { svc, stub } = stubbed()
    await svc[m]({ family: 'workspace' }, { limit: 5 })
    t.equal(paramsOf(stub).get('family'), 'workspace', `${m} carries family`)
    sandbox.restore()
  }
  t.end()
})

test('now / weekly / changes / totals forward filter.tz; no other read emits tz', async (t) => {
  for (const m of ['now', 'weekly', 'changes', 'totals']) {
    const { svc, stub } = stubbed()
    await svc[m]({ tz: 'Asia/Tbilisi', workspaceId: WS })
    t.equal(paramsOf(stub).get('tz'), 'Asia/Tbilisi', `${m} carries tz`)
    t.equal(paramsOf(stub).get('workspaceId'), WS, `${m} still carries workspaceId`)
    sandbox.restore()
  }
  for (const m of ['demographics']) {
    const { svc, stub } = stubbed()
    await svc[m]({ tz: 'Asia/Tbilisi' })
    t.equal(paramsOf(stub).has('tz'), false, `${m} has no calendar → no tz`)
    sandbox.restore()
  }
  for (const m of LISTS) {
    const { svc, stub } = stubbed()
    await svc[m]({ tz: 'Asia/Tbilisi' }, {})
    t.equal(paramsOf(stub).has('tz'), false, `${m} has no calendar → no tz`)
    sandbox.restore()
  }
  t.end()
})

test('absent / empty family or tz emit NO param (server-side default = unfiltered / UTC)', async (t) => {
  for (const v of [undefined, null, '']) {
    const { svc, stub } = stubbed()
    await svc.totals({ family: v, tz: v })
    t.equal(paramsOf(stub).has('family'), false, `family ${String(v)}`)
    t.equal(paramsOf(stub).has('tz'), false, `tz ${String(v)}`)
    t.equal(urlOf(stub), '/analyzed/totals', 'bare path, no stray "?"')
    sandbox.restore()
  }
  t.end()
})

test('totals builds GET /analyzed/totals with the full param set; a Date since is sent as ISO', async (t) => {
  let r = stubbed()
  await r.svc.totals({
    family: 'projects',
    projectId: 'landing',
    since: '2026-09-01T00:00:00.000Z',
    tz: 'Asia/Tbilisi',
    workspaceId: WS
  })
  t.equal(r.stub.firstCall.args[0], 'analyzed.totals', 'op name')
  t.equal(pathOf(r.stub), '/analyzed/totals')
  let p = paramsOf(r.stub)
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('projectId'), 'landing')
  t.equal(p.get('since'), '2026-09-01T00:00:00.000Z')
  t.equal(p.get('tz'), 'Asia/Tbilisi')
  t.equal(p.get('workspaceId'), WS)
  sandbox.restore()

  r = stubbed()
  await r.svc.totals({ excludeProjectId: 'workspace', since: new Date('2026-09-01T00:00:00Z') })
  p = paramsOf(r.stub)
  t.equal(p.get('excludeProjectId'), 'workspace')
  t.equal(p.get('since'), '2026-09-01T00:00:00.000Z', 'Date → ISO')
  sandbox.restore()
  t.end()
})

test('pages builds GET /analyzed/pages with filter + limit/offset options', async (t) => {
  const { svc, stub } = stubbed()
  await svc.pages(
    { family: 'projects', projectId: 'landing', since: '2026-09-01T00:00:00.000Z' },
    { limit: 20, offset: 40, workspaceId: WS }
  )
  t.equal(stub.firstCall.args[0], 'analyzed.pages')
  t.equal(pathOf(stub), '/analyzed/pages')
  const p = paramsOf(stub)
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('projectId'), 'landing')
  t.equal(p.get('since'), '2026-09-01T00:00:00.000Z')
  t.equal(p.get('limit'), '20')
  t.equal(p.get('offset'), '40')
  t.equal(p.get('workspaceId'), WS, 'workspaceId from the options bag')
  sandbox.restore()
  t.end()
})

test('referrers builds GET /analyzed/referrers with filter + limit (no offset — hosts are reduced server-side)', async (t) => {
  const { svc, stub } = stubbed()
  await svc.referrers({ family: 'workspace', workspaceId: WS }, { limit: 5, offset: 10 })
  t.equal(stub.firstCall.args[0], 'analyzed.referrers')
  t.equal(pathOf(stub), '/analyzed/referrers')
  const p = paramsOf(stub)
  t.equal(p.get('family'), 'workspace')
  t.equal(p.get('limit'), '5')
  t.equal(p.has('offset'), false, 'offset is not part of the referrers contract')
  t.equal(p.get('workspaceId'), WS)
  sandbox.restore()
  t.end()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
