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
