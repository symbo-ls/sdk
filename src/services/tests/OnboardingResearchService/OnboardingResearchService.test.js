import test from 'tape'
import sinon from 'sinon'
import { OnboardingResearchService } from '../../OnboardingResearchService.js'

// POB — the public website read before sign-up (server PLAN §7b).
// Pinned: paths + bodies; a refusal carries `.code` from the server body;
// the stream maps finding/done/failed to ONE event shape, is anonymous, and
// closes itself after done (no reconnect replay).

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new OnboardingResearchService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('startResearch POSTs { url } to /onboarding/research; getResearch GETs /:id', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ id: 'a'.repeat(24), domain: 'demo.example', status: 'running' })
  const out = await svc.startResearch({ url: 'demo.example' })
  t.equal(out.domain, 'demo.example')
  t.equal(stub.firstCall.args[0], '/onboarding/research')
  t.equal(stub.firstCall.args[1].method, 'POST')
  t.deepEqual(JSON.parse(stub.firstCall.args[1].body), { url: 'demo.example' })
  await svc.getResearch('abc')
  t.equal(stub.secondCall.args[0], '/onboarding/research/abc')
  sandbox.restore()
  t.end()
})

test('a refusal throws with .code from the server body', async t => {
  const svc = makeService()
  const err = new Error('That is a personal mailbox.', { cause: { error: 'free_mail_domain', message: 'x' } })
  err.status = 422
  sandbox.stub(svc, '_request').rejects(err)
  try {
    await svc.startResearch({ url: 'a@gmail.com' })
    t.fail('should throw')
  } catch (e) {
    t.equal(e.code, 'free_mail_domain')
    t.equal(e.status, 422)
  }
  const limited = new Error('x', { cause: { error: 'rate_limited', code: 'research_rate_limited' } })
  sandbox.restore()
  const svc2 = makeService()
  sandbox.stub(svc2, '_request').rejects(limited)
  try {
    await svc2.startResearch({ url: 'demo.example' })
  } catch (e) {
    t.equal(e.code, 'research_rate_limited', 'code wins over error')
  }
  sandbox.restore()
  t.end()
})

test('streamResearch: anonymous, one event shape, closes itself after done', t => {
  const svc = makeService()
  let handler = null
  let opts = null
  const closed = sinon.spy()
  sandbox.stub(svc, '_sseSubscribe').callsFake((path, filter, onEvent, o) => {
    t.equal(path, '/onboarding/research/abc/stream')
    handler = onEvent
    opts = o
    return closed
  })
  const got = []
  const stop = svc.streamResearch('abc', (e) => got.push(e))
  t.equal(opts.anonymous, true, 'no stream ticket for a public read')
  const frame = (name, data) => opts.events.find((e) => e.name === name).frame(data)
  handler(frame('finding', { key: 'platform', kind: 'platform' }))
  handler(frame('done', { profile: { domain: 'demo.example' } }))
  handler(frame('finding', { key: 'late' }))
  t.deepEqual(got, [
    { type: 'finding', finding: { key: 'platform', kind: 'platform' } },
    { type: 'done', profile: { domain: 'demo.example' } }
  ])
  t.equal(closed.callCount, 1, 'closed after done')
  t.deepEqual(frame('failed', {}), { type: 'failed', code: 'failed' })
  stop()
  sandbox.restore()
  t.end()
})

test('after sign-up: build board, retry, delete research, team rows — paths + workspace pin', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ ok: true })
  await svc.getOnboardingBuild('ws1')
  await svc.retryOnboardingBuildStep('ws1', 'apps')
  await svc.deleteOnboardingResearch('ws1')
  await svc.listOnboardingPeople('ws1')
  await svc.removeOnboardingPerson('ws1', 'p1')
  await svc.inviteOnboardingPerson('ws1', 'p1', { email: 'nino@demo.example', recipientName: 'Nino' })
  t.deepEqual(stub.getCalls().map((c) => [c.args[1].method, c.args[0]]), [
    ['GET', '/onboarding/build?workspaceId=ws1'],
    ['POST', '/onboarding/build/apps/retry?workspaceId=ws1'],
    ['DELETE', '/onboarding/workspace-research?workspaceId=ws1'],
    ['GET', '/onboarding/people?workspaceId=ws1'],
    ['DELETE', '/onboarding/people/p1?workspaceId=ws1'],
    ['POST', '/onboarding/people/p1/invite?workspaceId=ws1']
  ])
  t.deepEqual(JSON.parse(stub.lastCall.args[1].body), { email: 'nino@demo.example', recipientName: 'Nino' })
  sandbox.restore()
  t.end()
})

test('after sign-up: the active workspace is the default; none throws; refusals carry .code', async t => {
  const svc = makeService()
  svc._context = { activeWorkspaceId: 'wsA' }
  const stub = sandbox.stub(svc, '_request').resolves({})
  await svc.listOnboardingPeople()
  t.equal(stub.firstCall.args[0], '/onboarding/people?workspaceId=wsA')
  sandbox.restore()
  const bare = makeService()
  bare._context = {}
  try {
    await bare.getOnboardingBuild()
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /workspaceId is required/)
  }
  try {
    await bare.inviteOnboardingPerson('ws1', 'p1', {})
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /email is required/)
  }
  sandbox.restore()
  const svc3 = makeService()
  const err = new Error('x', { cause: { error: 'not_retryable' } })
  sandbox.stub(svc3, '_request').rejects(err)
  try {
    await svc3.retryOnboardingBuildStep('ws1', 'profile')
  } catch (e) {
    t.equal(e.code, 'not_retryable')
  }
  sandbox.restore()
  t.end()
})

test('after sign-up: profile reviewed + per-line research delete — paths + workspace pin', async t => {
  const svc = makeService()
  const stub = sandbox.stub(svc, '_request').resolves({ ok: true })
  await svc.markOnboardingProfileReviewed('ws1')
  for (const line of ['profile', 'offerings', 'faq', 'team']) {
    await svc.deleteOnboardingResearchLine('ws1', line)
  }
  t.deepEqual(stub.getCalls().map((c) => [c.args[1].method, c.args[0], c.args[1].methodName]), [
    ['POST', '/onboarding/build/profile/reviewed?workspaceId=ws1', 'markOnboardingProfileReviewed'],
    ['DELETE', '/onboarding/workspace-research/lines/profile?workspaceId=ws1', 'deleteOnboardingResearchLine'],
    ['DELETE', '/onboarding/workspace-research/lines/offerings?workspaceId=ws1', 'deleteOnboardingResearchLine'],
    ['DELETE', '/onboarding/workspace-research/lines/faq?workspaceId=ws1', 'deleteOnboardingResearchLine'],
    ['DELETE', '/onboarding/workspace-research/lines/team?workspaceId=ws1', 'deleteOnboardingResearchLine']
  ])
  sandbox.restore()
  t.end()
})

test('after sign-up: profile reviewed / line delete — active workspace default; no line throws; refusals carry .code', async t => {
  const svc = makeService()
  svc._context = { activeWorkspaceId: 'wsA' }
  const stub = sandbox.stub(svc, '_request').resolves({})
  await svc.markOnboardingProfileReviewed()
  t.equal(stub.firstCall.args[0], '/onboarding/build/profile/reviewed?workspaceId=wsA')
  sandbox.restore()
  const bare = makeService()
  bare._context = {}
  try {
    await bare.markOnboardingProfileReviewed()
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /workspaceId is required/)
  }
  try {
    await bare.deleteOnboardingResearchLine('ws1')
    t.fail('should throw')
  } catch (e) {
    t.match(e.message, /line is required/)
  }
  sandbox.restore()
  const svc3 = makeService()
  sandbox.stub(svc3, '_request').rejects(new Error('x', { cause: { error: 'unknown_line' } }))
  try {
    await svc3.deleteOnboardingResearchLine('ws1', 'hours')
    t.fail('should throw')
  } catch (e) {
    t.equal(e.code, 'unknown_line')
  }
  sandbox.restore()
  t.end()
})

test('getOnboardingBuild: a workspace with no build board answers null', async t => {
  const svc = makeService()
  sandbox.stub(svc, '_request').resolves(null)
  t.equal(await svc.getOnboardingBuild('ws1'), null)
  sandbox.restore()
  t.end()
})
