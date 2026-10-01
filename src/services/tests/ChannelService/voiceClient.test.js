// The browser call panel's one object — channels.voiceClient(). A SIMULATED
// number plays the whole contract with no Twilio (the server's /simulate
// states); a LIVE number loads the Twilio Voice JS SDK LAZILY (the injected
// loader stands in for the dynamic import) and dials through the Device.
import test from 'tape'
import { createVoiceClient } from '../../voice/voiceClient.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function fakeChannels ({ mode = 'simulated', token = 'tok-1' } = {}) {
  const log = []
  let onEvent = null
  let tokens = 0
  const svc = {
    log,
    emit: (frame) => onEvent && onEvent(frame),
    async voiceToken (payload, opts) {
      tokens += 1
      log.push(['voiceToken', payload, opts])
      return mode === 'simulated'
        ? { mode, accountId: 'a1', identity: 'wsW_uU', ttl: 3600 }
        : { mode, accountId: 'a1', identity: 'wsW_uU', ttl: 3600, edge: 'roaming', token: `${token}-${tokens}` }
    },
    async startCall (payload, opts) {
      log.push(['startCall', payload, opts])
      return {
        call: { id: 'c1', kind: 'call', call: { status: mode === 'simulated' ? 'ringing' : 'initiated', via: 'browser' } },
        conversation: { id: 'v1' },
        connect: { params: { callId: 'c1' } }
      }
    },
    async simulateCall (id, payload, opts) {
      log.push(['simulateCall', id, payload, opts])
      return { id, call: { status: payload.status } }
    },
    async logCallOutcome (id, payload, opts) {
      log.push(['logCallOutcome', id, payload, opts])
      return { id, call: { status: payload.status } }
    },
    subscribe (filter, fn) {
      log.push(['subscribe', filter])
      onEvent = fn
      return () => { log.push(['unsubscribe']); onEvent = null }
    }
  }
  return svc
}

const frame = (id, status, extra = {}) => ({
  type: 'channels.call',
  id,
  call: { id, kind: 'call', call: { status, direction: extra.direction || 'out', via: 'browser' } },
  conversation: 'v1',
  ring: !!extra.ring
})

test('voiceClient, simulated: no Twilio loaded; a call rings, answers and hangs up through /simulate; the stream is the truth', async t => {
  const channels = fakeChannels()
  let loaded = 0
  const vc = createVoiceClient({ channels, workspaceId: 'ws1', accountId: 'a1', loadVoiceSdk: async () => { loaded += 1; return {} } })
  const ready = await vc.start()
  t.deepEqual(ready, { mode: 'simulated', identity: 'wsW_uU', accountId: 'a1', accountIds: ['a1'], capabilities: {} })
  t.equal(loaded, 0, 'a simulated number never loads the Twilio SDK')
  t.deepEqual(channels.log.find((l) => l[0] === 'subscribe'), ['subscribe', { workspaceId: 'ws1' }])

  const handle = await vc.call({ partyId: 'p1', regarding: { type: 'deal', id: 'd1' } })
  const start = channels.log.find((l) => l[0] === 'startCall')
  t.deepEqual(start[1], { via: 'browser', channel: 'phone', accountId: 'a1', partyId: 'p1', regarding: { type: 'deal', id: 'd1' } })
  t.deepEqual(start[2], { workspaceId: 'ws1' })
  t.equal(handle.callId, 'c1')
  t.equal(handle.status, 'ringing')
  const states = []
  handle.on('state', (s) => states.push(s))
  channels.emit(frame('c1', 'answered'))
  t.equal(handle.status, 'answered')
  handle.mute(true)
  t.equal(handle.isMuted(), true, 'mute is local')
  await handle.hangup()
  t.deepEqual(channels.log.find((l) => l[0] === 'simulateCall'), ['simulateCall', 'c1', { status: 'completed' }, { workspaceId: 'ws1' }])
  channels.emit(frame('c1', 'completed'))
  t.deepEqual(states, ['answered', 'completed'])
  t.equal(handle.status, 'completed')

  // A ringing call that was never answered: hang-up cancels it.
  const second = await vc.call({ partyId: 'p1' })
  channels.emit(frame('c1', 'ringing'))
  second._status = 'ringing'
  await second.hangup()
  t.deepEqual(channels.log.filter((l) => l[0] === 'simulateCall').pop(), ['simulateCall', 'c1', { status: 'canceled' }, { workspaceId: 'ws1' }])
  vc.stop()
  t.ok(channels.log.some((l) => l[0] === 'unsubscribe'))
  t.end()
})

test('voiceClient, simulated: an inbound call that rings THIS member raises one incoming; accept / reject drive /simulate', async t => {
  const channels = fakeChannels()
  const vc = createVoiceClient({ channels, workspaceId: 'ws1', accountId: 'a1' })
  await vc.start()
  const incoming = []
  vc.on('incoming', (i) => incoming.push(i))
  channels.emit(frame('c7', 'ringing', { direction: 'in', ring: false }))
  t.equal(incoming.length, 0, 'a call that rings someone else is not incoming here')
  channels.emit(frame('c8', 'ringing', { direction: 'in', ring: true }))
  channels.emit(frame('c8', 'ringing', { direction: 'in', ring: true }))
  t.equal(incoming.length, 1, 'once per call')
  t.equal(incoming[0].callId, 'c8')
  const answered = await incoming[0].accept()
  t.deepEqual(channels.log.filter((l) => l[0] === 'simulateCall').pop(), ['simulateCall', 'c8', { status: 'answered' }, { workspaceId: 'ws1' }])
  t.equal(answered.callId, 'c8')
  t.equal(answered.status, 'answered', 'accept returns the call handle, answered')
  await answered.hangup()
  t.deepEqual(channels.log.filter((l) => l[0] === 'simulateCall').pop(), ['simulateCall', 'c8', { status: 'completed' }, { workspaceId: 'ws1' }], 'hanging up an answered inbound call completes it')
  channels.emit(frame('c8', 'completed', { direction: 'in' }))
  t.equal(answered.status, 'completed')
  channels.emit(frame('c9', 'ringing', { direction: 'in', ring: true }))
  await incoming[1].reject()
  t.deepEqual(channels.log.filter((l) => l[0] === 'simulateCall').pop(), ['simulateCall', 'c9', { status: 'no_answer' }, { workspaceId: 'ws1' }])
  vc.stop()
  t.end()
})

class FakeCall {
  constructor (params) { this.params = params; this.muted = false; this.handlers = {}; this.disconnected = 0; this.accepted = 0; this.rejected = 0 }
  on (ev, fn) { (this.handlers[ev] ||= []).push(fn) }
  mute (on) { this.muted = !!on }
  isMuted () { return this.muted }
  disconnect () { this.disconnected += 1 }
  accept () { this.accepted += 1 }
  reject () { this.rejected += 1 }
}

function fakeTwilio ({ connectThrows = false } = {}) {
  const made = []
  class Device {
    constructor (token, options) { this.token = token; this.options = options; this.handlers = {}; this.registered = 0; this.destroyed = 0; this.calls = []; made.push(this) }
    on (ev, fn) { (this.handlers[ev] ||= []).push(fn) }
    fire (ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a) }
    async register () { this.registered += 1 }
    updateToken (token) { this.token = token }
    async connect ({ params }) {
      if (connectThrows) throw new Error('microphone denied')
      const c = new FakeCall(params)
      this.calls.push(c)
      return c
    }
    destroy () { this.destroyed += 1 }
  }
  return { made, module: { Device } }
}

test('voiceClient, live: loads the Twilio Voice SDK lazily, registers a Device with the server token, dials with the row id, hangs up and mutes through the Twilio call', async t => {
  const channels = fakeChannels({ mode: 'live' })
  const tw = fakeTwilio()
  let loads = 0
  const vc = createVoiceClient({
    channels,
    workspaceId: 'ws1',
    accountId: 'a1',
    loadVoiceSdk: async () => { loads += 1; return tw.module }
  })
  t.equal(loads, 0, 'nothing loads before start()')
  const ready = await vc.start()
  t.equal(ready.mode, 'live')
  t.equal(loads, 1)
  const device = tw.made[0]
  t.equal(device.token, 'tok-1-1')
  t.equal(device.options.edge, 'roaming')
  t.equal(device.registered, 1, 'registered for incoming calls')

  const handle = await vc.call({ partyId: 'p1' })
  t.deepEqual(device.calls[0].params, { callId: 'c1' }, 'the Device dials with the row id only')
  handle.mute(true)
  t.equal(device.calls[0].muted, true)
  t.equal(handle.isMuted(), true)
  await handle.hangup()
  t.equal(device.calls[0].disconnected, 1)
  channels.emit(frame('c1', 'completed'))
  t.equal(handle.status, 'completed')

  device.fire('tokenWillExpire')
  await tick()
  await tick()
  t.equal(device.token, 'tok-1-2', 'a fresh token before the old one expires')

  const incoming = []
  vc.on('incoming', (i) => incoming.push(i))
  const twCall = new FakeCall({})
  twCall.customParameters = new Map([['callId', 'c5']])
  device.fire('incoming', twCall)
  t.equal(incoming.length, 1)
  t.equal(incoming[0].callId, 'c5')
  channels.emit(frame('c5', 'ringing', { direction: 'in', ring: true }))
  t.equal(incoming.length, 1, 'the stream does not raise a second incoming in live mode')
  const inCall = await incoming[0].accept()
  t.equal(twCall.accepted, 1)
  t.equal(inCall.callId, 'c5')
  inCall.mute(true)
  t.equal(twCall.muted, true)
  await inCall.hangup()
  t.equal(twCall.disconnected, 1, 'hang-up of an accepted call acts on the Twilio call')
  vc.stop()
  t.equal(device.destroyed, 1)
  t.end()
})

test('voiceClient, live: a Device that cannot connect closes the row it opened', async t => {
  const channels = fakeChannels({ mode: 'live' })
  const tw = fakeTwilio({ connectThrows: true })
  const vc = createVoiceClient({ channels, workspaceId: 'ws1', accountId: 'a1', loadVoiceSdk: async () => tw.module })
  await vc.start()
  try {
    await vc.call({ partyId: 'p1' })
    t.fail('the call should reject')
  } catch (err) {
    t.match(err.message, /microphone/)
  }
  t.deepEqual(channels.log.find((l) => l[0] === 'logCallOutcome'), ['logCallOutcome', 'c1', { status: 'failed' }, { workspaceId: 'ws1' }])
  vc.stop()
  t.end()
})

test('voiceClient: a Twilio SDK that cannot load is reported, not thrown at construction', async t => {
  const channels = fakeChannels({ mode: 'live' })
  const vc = createVoiceClient({ channels, workspaceId: 'ws1', accountId: 'a1', loadVoiceSdk: async () => { throw new Error('Cannot find module') } })
  try {
    await vc.start()
    t.fail('start should reject')
  } catch (err) {
    t.equal(err.code, 'voice_sdk_unavailable')
  }
  vc.stop()
  t.end()
})
