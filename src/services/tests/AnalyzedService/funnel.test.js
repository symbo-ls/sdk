import test from 'tape'
import sinon from 'sinon'
import { AnalyzedService } from '../../AnalyzedService.js'

// Shaker program CONTRACT §8 (lane CORE-C): AnalyzedService.funnel builds
// GET /analyzed/funnel with the full param set, and listEvents forwards the
// exact `message` filter. Asserts the CONDITION (what is on the wire), never
// the absence of an error.

const sandbox = sinon.createSandbox()
const WS = '6aadb5e0d03299e6a0719dcc'

const stubbed = () => {
  const svc = new AnalyzedService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  return { svc, stub }
}
const urlOf = (stub) => stub.firstCall.args[1]
const pathOf = (stub) => urlOf(stub).split('?')[0]
const paramsOf = (stub) => new URLSearchParams(urlOf(stub).split('?')[1] || '')

test('funnel: GET /analyzed/funnel with family, projectId, window, tz, steps and the routing workspaceId', async (t) => {
  const { svc, stub } = stubbed()
  await svc.funnel({
    workspaceId: WS,
    family: 'projects',
    projectId: 'shaker',
    since: '2026-10-01',
    until: '2026-10-17',
    tz: 'Asia/Tbilisi',
    steps: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase']
  })
  t.equal(stub.firstCall.args[0], 'analyzed.funnel', 'method name')
  t.equal(pathOf(stub), '/analyzed/funnel', 'literal path')
  const p = paramsOf(stub)
  t.equal(p.get('workspaceId'), WS)
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('projectId'), 'shaker')
  t.equal(p.get('since'), '2026-10-01', 'a bare day is sent as is (the server reads it in tz)')
  t.equal(p.get('until'), '2026-10-17')
  t.equal(p.get('tz'), 'Asia/Tbilisi')
  t.equal(p.get('steps'), 'view_item,add_to_cart,begin_checkout,purchase', 'an array joins with ","')
  t.equal(stub.firstCall.args[2], undefined, 'a GET — no body, no method override')
  sandbox.restore()
  t.end()
})

test('funnel: Date bounds go out as ISO; a steps string passes through; excludeProjectId is forwarded', async (t) => {
  const { svc, stub } = stubbed()
  const since = new Date('2026-09-18T00:00:00.000Z')
  const until = new Date('2026-10-18T00:00:00.000Z')
  await svc.funnel({ since, until, steps: 'view_item,purchase', excludeProjectId: 'workspace' })
  const p = paramsOf(stub)
  t.equal(p.get('since'), since.toISOString())
  t.equal(p.get('until'), until.toISOString())
  t.equal(p.get('steps'), 'view_item,purchase')
  t.equal(p.get('excludeProjectId'), 'workspace')
  sandbox.restore()
  t.end()
})

test('funnel: absent / empty values emit NO param and no stray "?"', async (t) => {
  for (const v of [undefined, null, '']) {
    const { svc, stub } = stubbed()
    await svc.funnel({
      family: v,
      projectId: v,
      since: v,
      until: v,
      tz: v,
      steps: v,
      workspaceId: v
    })
    t.equal(urlOf(stub), '/analyzed/funnel', `all ${String(v)} → bare path`)
    sandbox.restore()
  }
  const { svc, stub } = stubbed()
  await svc.funnel()
  t.equal(urlOf(stub), '/analyzed/funnel', 'no filter at all → bare path (the server answers 400 invalid_steps)')
  sandbox.restore()
  t.end()
})

test('listEvents: filter.message is forwarded exactly; absent / empty emits nothing', async (t) => {
  let r = stubbed()
  await r.svc.listEvents(
    { message: 'purchase', logType: 'log', projectId: 'shaker', family: 'projects', workspaceId: WS },
    { limit: 50 }
  )
  let p = paramsOf(r.stub)
  t.equal(pathOf(r.stub), '/analyzed/events')
  t.equal(p.get('message'), 'purchase')
  t.equal(p.get('logType'), 'log')
  t.equal(p.get('projectId'), 'shaker')
  t.equal(p.get('family'), 'projects')
  t.equal(p.get('workspaceId'), WS)
  t.equal(p.get('limit'), '50')
  sandbox.restore()

  for (const v of [undefined, null, '']) {
    r = stubbed()
    await r.svc.listEvents({ message: v })
    t.equal(paramsOf(r.stub).has('message'), false, `message ${String(v)} → no param`)
    sandbox.restore()
  }
  t.end()
})
