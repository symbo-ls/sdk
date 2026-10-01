// comms-phone CONTRACT v3 — the call panel's gaps, SDK side:
//   (1) the call handle has sendDigits + hold (simulated); live: sendDigits on the Twilio call, hold only when the
//       server reports it (capabilities.hold)
//   (2) voice.attach(callId) — follow a call started elsewhere; hang-up through the server
//   (5) one voice session per member for every number of one Twilio account (accountIds; a call names its number)
//   (6) a live hang-up (or a remote end) settles the handle locally — a terminal 'state' without waiting for the stream
//   (7) one error field: err.code (the server's code; http_<status> when the server sent none)
import test from 'tape'
import sinon from 'sinon'
import { createVoiceClient } from '../../voice/voiceClient.js'
import { ChannelService } from '../../ChannelService.js'

function fakeChannels ({ mode = 'simulated', capabilities, accountIds = ['a1', 'a2'] } = {}) {
  const log = []
  let onEvent = null
  const svc = {
    log,
    emit: (frame) => onEvent && onEvent(frame),
    async voiceToken (payload, opts) {
      log.push(['voiceToken', payload, opts])
      return { mode, accountId: 'a1', accountIds, identity: 'wsW_uU', ttl: 3600, ...(mode === 'live' ? { edge: 'roaming', token: 'tok' } : {}), ...(capabilities ? { capabilities } : {}) }
    },
    async startCall (payload, opts) {
      log.push(['startCall', payload, opts])
      return { call: { id: 'c1', kind: 'call', call: { status: mode === 'simulated' ? 'ringing' : 'initiated', direction: 'out', via: 'browser' } }, conversation: { id: 'v1' }, connect: { params: { callId: 'c1' } } }
    },
    async getCall (id, opts) {
      log.push(['getCall', id, opts])
      if (id === 'missing') {
        const err = new Error('call not found')
        err.status = 404
        err.code = 'not_found'
        throw err
      }
      return { call: { id, kind: 'call', call: { status: 'answered', direction: 'in', via: 'browser' }, party: { id: 'p9', name: 'Nino' } }, conversation: { id: 'v9' } }
    },
    async simulateCall (id, payload, opts) { log.push(['simulateCall', id, payload, opts]); return { id, call: { status: payload.status } } },
    async hangupCall (id, opts) { log.push(['hangupCall', id, opts]); return { call: { id, call: { status: 'completed' } } } },
    async logCallOutcome (id, payload, opts) { log.push(['logCallOutcome', id, payload, opts]); return { id } },
    subscribe (filter, fn) { onEvent = fn; return () => { onEvent = null } }
  }
  return svc
}

class FakeCall {
  constructor () { this.handlers = {}; this.digits = []; this.disconnected = 0; this.muted = false }
  on (ev, fn) { (this.handlers[ev] ||= []).push(fn) }
  fire (ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a) }
  sendDigits (d) { this.digits.push(d) }
  mute (on) { this.muted = !!on }
  isMuted () { return this.muted }
  disconnect () { this.disconnected += 1 }
}
function fakeTwilio () {
  const calls = []
  class Device {
    constructor () { this.handlers = {} }
    on (ev, fn) { (this.handlers[ev] ||= []).push(fn) }
    async register () {}
    updateToken () {}
    async connect () { const c = new FakeCall(); calls.push(c); return c }
    destroy () {}
  }
  return { calls, module: { Device } }
}
const frame = (id, status, extra = {}) => ({ type: 'channels.call', id, call: { id, kind: 'call', call: { status, direction: extra.direction || 'out', via: 'browser' } }, conversation: 'v1', ring: false })

test('(1) simulated handle: sendDigits records the keys, hold toggles a held flag; bad keys are refused', async t => {
  const channels = fakeChannels()
  const vc = createVoiceClient({ channels, workspaceId: 'ws1' })
  await vc.start()
  const h = await vc.call({ partyId: 'p1' })
  t.equal(typeof h.sendDigits, 'function')
  t.equal(typeof h.hold, 'function')
  const seen = []
  h.on('digits', (d) => seen.push(['digits', d]))
  h.on('hold', (on) => seen.push(['hold', on]))
  h.sendDigits('12#')
  h.sendDigits('*')
  t.equal(h.digits, '12#*')
  t.throws(() => h.sendDigits('9a'), (e) => e.code === 'invalid_digits')
  await h.hold(true)
  t.equal(h.isHeld(), true)
  await h.hold(false)
  t.equal(h.isHeld(), false)
  t.deepEqual(seen, [['digits', '12#'], ['digits', '*'], ['hold', true], ['hold', false]])
  vc.stop()
  t.end()
})

test('(1) live handle: sendDigits goes to the Twilio call; no hold until the server reports it', async t => {
  const tw = fakeTwilio()
  const vc = createVoiceClient({ channels: fakeChannels({ mode: 'live' }), workspaceId: 'ws1', loadVoiceSdk: async () => tw.module })
  await vc.start()
  const h = await vc.call({ partyId: 'p1' })
  h.sendDigits('5')
  t.deepEqual(tw.calls[0].digits, ['5'])
  t.equal(h.hold, undefined, 'no hold on a live call yet — the panel hides the button')
  vc.stop()
  const tw2 = fakeTwilio()
  const vc2 = createVoiceClient({ channels: fakeChannels({ mode: 'live', capabilities: { hold: true } }), workspaceId: 'ws1', loadVoiceSdk: async () => tw2.module })
  await vc2.start()
  const h2 = await vc2.call({ partyId: 'p1' })
  t.equal(typeof h2.hold, 'function', 'hold appears when the server reports capabilities.hold')
  vc2.stop()
  t.end()
})

test('(2) attach(callId): a call started elsewhere is followed from the stream and hung up through the server', async t => {
  const channels = fakeChannels()
  const vc = createVoiceClient({ channels, workspaceId: 'ws1' })
  await vc.start()
  const h = await vc.attach('c9')
  t.deepEqual(channels.log.find((l) => l[0] === 'getCall'), ['getCall', 'c9', { workspaceId: 'ws1' }])
  t.equal(h.callId, 'c9')
  t.equal(h.status, 'answered')
  t.equal(h.call.party.name, 'Nino')
  t.equal(h.attached, true)
  channels.emit(frame('c9', 'completed', { direction: 'in' }))
  t.equal(h.status, 'completed', 'the stream moves an attached handle')
  const h2 = await vc.attach('c10')
  await h2.hangup()
  t.deepEqual(channels.log.filter((l) => l[0] === 'hangupCall').pop(), ['hangupCall', 'c10', { workspaceId: 'ws1' }])
  try {
    await vc.attach('missing')
    t.fail('attach of an unknown call rejects')
  } catch (err) {
    t.equal(err.code, 'not_found')
  }
  vc.stop()
  t.end()
})

test('(2) attach in live mode: no audio here — no mute, no keypad, no hold; hang-up through the server', async t => {
  const tw = fakeTwilio()
  const channels = fakeChannels({ mode: 'live' })
  const vc = createVoiceClient({ channels, workspaceId: 'ws1', loadVoiceSdk: async () => tw.module })
  await vc.start()
  const h = await vc.attach('c9')
  t.equal(h.media, 'none')
  t.equal(h.mute, undefined)
  t.equal(h.sendDigits, undefined)
  t.equal(h.hold, undefined)
  await h.hangup()
  t.deepEqual(channels.log.filter((l) => l[0] === 'hangupCall').pop(), ['hangupCall', 'c9', { workspaceId: 'ws1' }])
  vc.stop()
  t.end()
})

test('(5) one session serves every number of the Twilio account: accountIds; a call names its number, else the default', async t => {
  const channels = fakeChannels()
  const vc = createVoiceClient({ channels, workspaceId: 'ws1' })
  const s = await vc.start()
  t.deepEqual(channels.log.find((l) => l[0] === 'voiceToken')[1], {}, 'no accountId needed')
  t.deepEqual(s.accountIds, ['a1', 'a2'])
  t.deepEqual(vc.accountIds, ['a1', 'a2'])
  await vc.call({ partyId: 'p1', accountId: 'a2' })
  t.equal(channels.log.filter((l) => l[0] === 'startCall').pop()[1].accountId, 'a2')
  await vc.call({ partyId: 'p1' })
  t.equal(channels.log.filter((l) => l[0] === 'startCall').pop()[1].accountId, 'a1', 'the session default')
  vc.stop()
  t.end()
})

test('(6) a live hang-up settles the handle at once — a terminal state event, before any stream frame; a remote end too', async t => {
  const tw = fakeTwilio()
  const vc = createVoiceClient({ channels: fakeChannels({ mode: 'live' }), workspaceId: 'ws1', loadVoiceSdk: async () => tw.module })
  await vc.start()
  const h = await vc.call({ partyId: 'p1' })
  const states = []
  h.on('state', (s) => states.push(s))
  await h.hangup()
  t.equal(tw.calls[0].disconnected, 1)
  t.equal(h.status, 'canceled', 'not answered yet → canceled')
  t.equal(h.call.call.status, 'canceled', 'the row the panel reads moved too')
  t.deepEqual(states, ['canceled'])

  const h2 = await vc.call({ partyId: 'p1' })
  h2._update({ id: 'c1', call: { status: 'answered', direction: 'out' } })
  const s2 = []
  h2.on('state', (s) => s2.push(s))
  tw.calls[1].fire('disconnect')
  t.equal(h2.status, 'completed', 'the other side hung up an answered call → completed')
  t.deepEqual(s2, ['completed'])
  vc.stop()
  t.end()
})

test('(7) one error field: err.code carries the server code (http_<status> when none); err.status stays', async t => {
  const svc = new ChannelService()
  sinon.stub(svc, '_requireReady').returns(undefined)
  const coded = new Error('this number cannot place a call from the browser', { cause: { error: 'browser_calling_not_available', message: 'x' } })
  coded.status = 409
  const bare = new Error('Request failed', { cause: {} })
  bare.status = 502
  const req = sinon.stub(svc, '_request')
  req.onCall(0).rejects(coded)
  req.onCall(1).rejects(bare)
  const e1 = await svc.startCall({ via: 'browser' }, { workspaceId: 'ws1' }).catch((e) => e)
  t.equal(e1.code, 'browser_calling_not_available')
  t.equal(e1.status, 409)
  const e2 = await svc.voiceToken({}, { workspaceId: 'ws1' }).catch((e) => e)
  t.equal(e2.code, 'http_502')
  t.equal(e2.status, 502)
  sinon.restore()
  t.end()
})

test('ChannelService.hangupCall POSTs /channels/calls/:id/hangup; sdk.execute channels.calls hangup', async t => {
  const svc = new ChannelService()
  sinon.stub(svc, '_requireReady').returns(undefined)
  const call = sinon.stub(svc, '_call').resolves({})
  await svc.hangupCall('c1', { workspaceId: 'ws1' })
  t.deepEqual(call.getCall(0).args, ['channels.hangupCall', '/channels/calls/c1/hangup?workspaceId=ws1', { method: 'POST', body: {} }])
  const calls = []
  const proxy = new Proxy({}, { get: (_o, m) => (...a) => { calls.push([m, ...a]); return {} } })
  const { createEntityDispatcher } = await import('../../EntityDispatcher.js')
  const dispatch = createEntityDispatcher({ getService: (name) => (name === 'channels' ? proxy : null) })
  await dispatch('channels.calls', 'hangup', { id: 'c1', workspaceId: 'ws1' })
  t.deepEqual(calls[0], ['hangupCall', 'c1', { workspaceId: 'ws1' }])
  sinon.restore()
  t.end()
})

test('(6) a simulated hang-up settles the handle on the server answer, before any stream frame', async t => {
  const channels = fakeChannels()
  const vc = createVoiceClient({ channels, workspaceId: 'ws1' })
  await vc.start()
  const h = await vc.call({ partyId: 'p1' })
  h._update({ id: 'c1', call: { status: 'answered', direction: 'out' } })
  const states = []
  h.on('state', (s) => states.push(s))
  await h.hangup()
  t.equal(h.status, 'completed')
  t.deepEqual(states, ['completed'])
  vc.stop()
  t.end()
})

test('(7) a microphone refusal is err.code microphone_denied (Twilio 31208 / 31401 / 31402, NotAllowedError); the original rides err.cause; any other connect failure is call_not_connected', async t => {
  const cases = [
    [Object.assign(new Error('UserMediaDenied'), { code: 31208 }), 'microphone_denied'],
    [Object.assign(new Error('Permission denied'), { code: 31401 }), 'microphone_denied'],
    [Object.assign(new Error('Acquisition failed'), { code: 31402 }), 'microphone_denied'],
    [Object.assign(new Error('Permission denied by user'), { name: 'NotAllowedError' }), 'microphone_denied'],
    [Object.assign(new Error('wrapped'), { code: 31400, originalError: { name: 'NotAllowedError' } }), 'microphone_denied'],
    [Object.assign(new Error('Signaling failed'), { code: 31005 }), 'call_not_connected']
  ]
  for (const [raw, want] of cases) {
    const channels = fakeChannels({ mode: 'live' })
    class Device {
      on () {}
      async register () {}
      updateToken () {}
      async connect () { throw raw }
      destroy () {}
    }
    const vc = createVoiceClient({ channels, workspaceId: 'ws1', loadVoiceSdk: async () => ({ Device }) })
    await vc.start()
    const err = await vc.call({ partyId: 'p1' }).catch((e) => e)
    t.equal(err.code, want, `${raw.message} → ${want}`)
    t.equal(err.cause, raw, 'the Twilio error stays on err.cause')
    t.deepEqual(channels.log.find((l) => l[0] === 'logCallOutcome'), ['logCallOutcome', 'c1', { status: 'failed' }, { workspaceId: 'ws1' }])
    vc.stop()
  }
  t.end()
})

test('(7) every voice client error carries err.code', async t => {
  const noToken = createVoiceClient({ channels: { ...fakeChannels(), voiceToken: async () => null }, workspaceId: 'ws1' })
  t.equal((await noToken.start().catch((e) => e)).code, 'voice_token_unavailable')
  const noDevice = createVoiceClient({ channels: fakeChannels({ mode: 'live' }), workspaceId: 'ws1', loadVoiceSdk: async () => ({}) })
  t.equal((await noDevice.start().catch((e) => e)).code, 'voice_sdk_unavailable')
  const badRegister = createVoiceClient({
    channels: fakeChannels({ mode: 'live' }),
    workspaceId: 'ws1',
    loadVoiceSdk: async () => ({ Device: class { on () {} async register () { throw Object.assign(new Error('token invalid'), { code: 20101 }) } destroy () {} } })
  })
  const e3 = await badRegister.start().catch((e) => e)
  t.equal(e3.code, 'voice_device_unavailable')
  t.equal(e3.cause.code, 20101)
  const errors = []
  const tw = fakeTwilio()
  const vc = createVoiceClient({ channels: fakeChannels({ mode: 'live' }), workspaceId: 'ws1', loadVoiceSdk: async () => tw.module, deviceOptions: {} })
  vc.on('error', (e) => errors.push(e))
  await vc.start()
  const h = await vc.call({ partyId: 'p1' })
  tw.calls[0].fire('error', Object.assign(new Error('media'), { code: 31402 }))
  t.equal(errors[0].code, 'microphone_denied', 'an error event carries err.code too')
  t.ok(h)
  for (const e of [noToken, noDevice, badRegister, vc]) e.stop()
  t.end()
})

test('(6) a live INCOMING call cancelled by the caller before accept ends at once: incoming state + a local call frame', async t => {
  const handlers = {}
  class Device {
    on (ev, fn) { handlers[ev] = fn }
    async register () {}
    updateToken () {}
    destroy () {}
  }
  const vc = createVoiceClient({ channels: fakeChannels({ mode: 'live' }), workspaceId: 'ws1', loadVoiceSdk: async () => ({ Device }) })
  await vc.start()
  const incoming = []
  const frames = []
  vc.on('incoming', (i) => incoming.push(i))
  vc.on('call', (f) => frames.push(f))
  const twCall = new FakeCall()
  twCall.customParameters = new Map([['callId', 'c7']])
  handlers.incoming(twCall)
  const states = []
  incoming[0].on('state', (s) => states.push(s))
  t.equal(incoming[0].status, 'ringing')
  twCall.fire('cancel')
  t.equal(incoming[0].status, 'canceled')
  t.deepEqual(states, ['canceled'])
  t.equal(frames.length, 1)
  t.equal(frames[0].id, 'c7')
  t.equal(frames[0].local, true)
  t.equal(frames[0].call.call.status, 'canceled')
  t.equal(frames[0].call.call.direction, 'in')
  vc.stop()
  t.end()
})
