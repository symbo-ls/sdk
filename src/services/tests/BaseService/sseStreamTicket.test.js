import test from 'tape'
import sinon from 'sinon'
import { BaseService } from '../../BaseService.js'

// CORE-SSE-BEARER-TOKEN-IN-QUERY-STRING-1 — the SSE leak fix, pinned.
//
// Before this fix `_sseSubscribe` put the member's LONG-LIVED BEARER in the
// stream URL (`?access_token=<jwt>`), because EventSource cannot set an
// Authorization header — and a URL lands in CDN/proxy access logs, browser
// history and Referer headers. The fix: each (re)connect first POSTs
// /auth/stream-ticket over normal header auth for a ≤60s SINGLE-USE ticket
// and passes THAT as `?ticket=`. These tests run the REAL `_sseSubscribe`
// against a stubbed `_call` (the mint) and a stubbed global EventSource, so
// they FAIL against the pre-fix source (access_token in the URL, no mint)
// and pass against the fix.

const sandbox = sinon.createSandbox()

class FakeEventSource {
  constructor (url) {
    this.url = url
    this._listeners = {}
    FakeEventSource.instances.push(this)
  }

  addEventListener (name, fn) {
    (this._listeners[name] = this._listeners[name] || []).push(fn)
  }

  emit (name, evt = {}) {
    for (const fn of this._listeners[name] || []) fn(evt)
  }

  close () {
    this.closed = true
  }
}
FakeEventSource.instances = []

const realEventSource = global.EventSource

function setup ({ token = 'jwt-LONG-LIVED-BEARER', tickets = ['tkt-1', 'tkt-2', 'tkt-3'] } = {}) {
  FakeEventSource.instances = []
  global.EventSource = FakeEventSource
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'
  svc._initialized = true
  if (token) {
    svc._tokenManager = { getAccessToken: () => token }
  }
  let mintCount = 0
  const mint = sandbox.stub(svc, '_call').callsFake(async () => ({
    ticket: tickets[Math.min(mintCount++, tickets.length - 1)],
    expiresIn: 60
  }))
  return { svc, mint }
}

function teardown () {
  sandbox.restore()
  global.EventSource = realEventSource
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('_sseSubscribe builds a ?ticket= URL and NEVER puts the bearer (access_token) in it', async (t) => {
  const { svc, mint } = setup()
  const unsub = svc._sseSubscribe('/mail/stream', { workspaceId: 'ws1' }, () => {}, { flatParams: true })
  await tick()

  t.equal(FakeEventSource.instances.length, 1, 'one EventSource opened')
  const url = FakeEventSource.instances[0].url
  t.ok(url.includes('ticket=tkt-1'), `single-use ticket rides the URL (${url})`)
  t.ok(url.includes('workspaceId=ws1'), 'filter params intact')
  t.notOk(url.includes('access_token='), 'no access_token= query is ever built')
  t.notOk(url.includes('jwt-LONG-LIVED-BEARER'), 'the bearer itself never reaches the URL')

  t.equal(mint.calledOnce, true, 'one mint per connect')
  const [methodName, endpoint, init] = mint.firstCall.args
  t.equal(methodName, 'mintStreamTicket')
  t.equal(endpoint, '/auth/stream-ticket', 'mint goes to the authenticated POST route')
  t.equal(init.method, 'POST')
  t.deepEqual(init.body, { workspace: 'ws1' }, 'workspace binding sent from the filter')

  unsub()
  t.end()
  teardown()
})

test('every reconnect mints a FRESH ticket — a redeemed URL is never reused', async (t) => {
  const clock = sandbox.useFakeTimers()
  const { svc, mint } = setup()
  const unsub = svc._sseSubscribe('/tickets/stream', { workspaceId: 'ws1' }, () => {}, { flatParams: true })
  await clock.tickAsync(0)

  t.equal(FakeEventSource.instances.length, 1, 'first connection open')
  t.ok(FakeEventSource.instances[0].url.includes('ticket=tkt-1'))

  // Drop the connection → backoff (1s) → reconnect.
  FakeEventSource.instances[0].emit('error')
  await clock.tickAsync(1100)

  t.equal(FakeEventSource.instances.length, 2, 'reconnected after backoff')
  const url2 = FakeEventSource.instances[1].url
  t.ok(url2.includes('ticket=tkt-2'), 'second connect carries a NEW ticket')
  t.notOk(url2.includes('tkt-1'), 'the redeemed ticket is never replayed')
  t.equal(mint.callCount, 2, 'one mint per connect, every connect')

  unsub()
  t.end()
  teardown()
})

test('a failed mint reuses the stream backoff instead of dying or leaking', async (t) => {
  const clock = sandbox.useFakeTimers()
  FakeEventSource.instances = []
  global.EventSource = FakeEventSource
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'
  svc._tokenManager = { getAccessToken: () => 'jwt-x' }
  let calls = 0
  const mint = sandbox.stub(svc, '_call').callsFake(async () => {
    calls++
    if (calls === 1) throw new Error('mint 503')
    return { ticket: 'tkt-after-retry', expiresIn: 60 }
  })

  const unsub = svc._sseSubscribe('/docs/stream', {}, () => {})
  await clock.tickAsync(0)
  t.equal(FakeEventSource.instances.length, 0, 'no connection opened on a failed mint')

  await clock.tickAsync(1100)
  t.equal(mint.callCount, 2, 'mint retried on the backoff')
  t.equal(FakeEventSource.instances.length, 1, 'connection opened after the retry')
  t.ok(FakeEventSource.instances[0].url.includes('ticket=tkt-after-retry'))

  unsub()
  t.end()
  teardown()
})

test('an unauthenticated session skips the mint and builds a credential-free URL', async (t) => {
  const { svc, mint } = setup({ token: null })
  const unsub = svc._sseSubscribe('/meet/stream', { roomId: 'r1' }, () => {}, { flatParams: true })
  await tick()

  t.equal(mint.called, false, 'no mint without a session')
  t.equal(FakeEventSource.instances.length, 1)
  const url = FakeEventSource.instances[0].url
  t.notOk(url.includes('ticket='), 'no ticket param')
  t.notOk(url.includes('access_token='), 'no bearer param')
  t.ok(url.includes('roomId=r1'), 'filter still serialized')

  unsub()
  t.end()
  teardown()
})

test('unsubscribe during the mint aborts cleanly — no EventSource leaks', async (t) => {
  FakeEventSource.instances = []
  global.EventSource = FakeEventSource
  const svc = new BaseService({})
  svc._apiUrl = 'https://api.test'
  svc._tokenManager = { getAccessToken: () => 'jwt-x' }
  let resolveMint
  sandbox.stub(svc, '_call').returns(new Promise(resolve => { resolveMint = resolve }))

  const unsub = svc._sseSubscribe('/mail/stream', {}, () => {})
  unsub()
  resolveMint({ ticket: 'tkt-late', expiresIn: 60 })
  await tick()

  t.equal(FakeEventSource.instances.length, 0, 'no connection opened after unsubscribe')
  t.end()
  teardown()
})
