import test from 'tape'
import sinon from 'sinon'
import { AnalyzedService } from '../../AnalyzedService.js'

// ANALYTICS-WS-SCOPE-1 (tickets/analytics.md): every analyzed read must
// forward the tab's `workspaceId` — the server honours it only for members
// (attachExplicitWorkspaceIfMember) and otherwise falls back to the caller's
// active claim, which is the exact "zero rows, clean 200" symptom this pins.
// Asserts the CONDITION (the param is on the wire), not absence of error.

const sandbox = sinon.createSandbox()
const WS = '6a5d537c40799ea23a704560'

const stubbed = () => {
  const svc = new AnalyzedService()
  const stub = sandbox.stub(svc, '_call').resolves({ ok: true })
  return { svc, stub }
}
const urlOf = (stub) => stub.firstCall.args[1]
const paramsOf = (stub) => new URLSearchParams(urlOf(stub).split('?')[1] || '')

test('rollups forward filter.workspaceId next to projectId', async (t) => {
  for (const m of ['now', 'weekly', 'changes', 'demographics']) {
    const { svc, stub } = stubbed()
    await svc[m]({ projectId: 'landing', workspaceId: WS })
    const p = paramsOf(stub)
    t.equal(p.get('workspaceId'), WS, `${m} carries workspaceId`)
    t.equal(p.get('projectId'), 'landing', `${m} keeps projectId`)
    sandbox.restore()
  }
  t.end()
})

test('lists forward workspaceId from filter OR options (routing param on either bag)', async (t) => {
  for (const m of ['listSessions', 'listEvents', 'listUsers', 'activeUsers', 'listBugs']) {
    let r = stubbed()
    await r.svc[m]({ projectId: 'landing', workspaceId: WS }, { limit: 5 })
    t.equal(paramsOf(r.stub).get('workspaceId'), WS, `${m} via filter`)
    sandbox.restore()
    r = stubbed()
    await r.svc[m]({ projectId: 'landing' }, { limit: 5, workspaceId: WS })
    t.equal(paramsOf(r.stub).get('workspaceId'), WS, `${m} via options`)
    sandbox.restore()
  }
  t.end()
})

test('getSession forwards workspaceId and keeps the bare path without it', async (t) => {
  let r = stubbed()
  await r.svc.getSession('sess-1', { workspaceId: WS })
  t.equal(urlOf(r.stub), `/analyzed/sessions/sess-1?workspaceId=${WS}`)
  sandbox.restore()
  r = stubbed()
  await r.svc.getSession('sess-1')
  t.equal(urlOf(r.stub), '/analyzed/sessions/sess-1', 'no stray "?" when unscoped')
  sandbox.restore()
  t.end()
})

test('absent / empty workspaceId emits NO param (server falls back to the claim, unchanged behaviour)', async (t) => {
  for (const ws of [undefined, null, '']) {
    const { svc, stub } = stubbed()
    await svc.now({ projectId: 'landing', workspaceId: ws })
    t.equal(paramsOf(stub).has('workspaceId'), false, `now with ${String(ws)}`)
    sandbox.restore()
  }
  t.end()
})

test('teardown', (t) => {
  sandbox.restore()
  t.end()
})
