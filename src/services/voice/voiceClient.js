// The browser call panel's ONE object — `sdk.getService('channels').voiceClient(
// { workspaceId, accountId })`. Calls run INSIDE the workspace, in the member's
// browser, on a Twilio Voice number (server: /core/channels/voice/token,
// POST /core/channels/calls via 'browser', the TwiML hooks, the stream).
//
//   live number       the Twilio Voice JS SDK loads LAZILY — a dynamic import,
//                     its own chunk, on start() only; shell code never imports
//                     it. A Device registers with the server-minted token
//                     (refreshed before it expires); a call writes its row
//                     (POST /calls via 'browser') and the Device dials with the
//                     row id only — the server picks the number. Mute and
//                     hang-up act on the Twilio call.
//   simulated number  no Device, no Twilio: the same calls, driven through the
//                     server's POST /calls/:id/simulate states (ringing →
//                     answered → completed | canceled | no_answer).
//   both              the server stream (channels.subscribe) is the call
//                     state's truth: each `channels.call` frame updates the
//                     call handle; an inbound call that rings THIS member
//                     raises `incoming` (live: the Device's own incoming call).
//
// Events: 'open' (the stream (re)connected — re-read what you show), 'call'
// (every frame), 'incoming' ({ callId, call, accept() → a call handle,
// reject() }), 'error'.

// The ONE place the Twilio Voice JS SDK is loaded — a literal specifier, so a
// bundler code-splits it and loads it only when a live voice session starts.
export const loadTwilioVoiceSdk = () => import('@twilio/voice-sdk')

const TERMINAL = ['completed', 'no_answer', 'busy', 'failed', 'canceled']

function voiceError (code, message, cause) {
  const err = new Error(message)
  err.code = code
  if (cause) err.cause = cause
  return err
}

function emitter () {
  const map = new Map()
  return {
    on (ev, fn) {
      if (typeof fn !== 'function') return () => {}
      if (!map.has(ev)) map.set(ev, new Set())
      map.get(ev).add(fn)
      return () => map.get(ev)?.delete(fn)
    },
    off (ev, fn) { map.get(ev)?.delete(fn) },
    emit (ev, arg) {
      for (const fn of map.get(ev) || []) {
        try { fn(arg) } catch (_) { /* a listener error never breaks the panel */ }
      }
    }
  }
}

export function createVoiceClient ({
  channels,
  workspaceId,
  accountId,
  loadVoiceSdk = loadTwilioVoiceSdk,
  deviceOptions = {}
} = {}) {
  if (!channels) throw new Error('voiceClient: channels service is required')
  const events = emitter()
  const opts = { workspaceId }
  const handles = new Map() // callId → call handle
  const incomingSeen = new Set()
  let session = null // { mode, identity, accountId, edge }
  let device = null
  let unsubscribe = null
  let stopped = false

  function onFrame (evt) {
    if (!evt || stopped) return
    if (evt.type === 'channels.open') {
      events.emit('open', evt)
      return
    }
    if (evt.type !== 'channels.call' || !evt.call) return
    events.emit('call', evt)
    const h = handles.get(evt.id)
    if (h) h._update(evt.call)
    const status = evt.call?.call?.status
    if (session?.mode === 'simulated' && evt.ring === true && status === 'ringing' && !incomingSeen.has(evt.id)) {
      incomingSeen.add(evt.id)
      events.emit('incoming', incomingFor(evt.id, evt.call, null))
    }
  }

  // An inbound call ringing THIS member. accept() answers it and returns the
  // call handle (hang-up, mute, state) — the Twilio call's in live mode, the
  // server's /simulate states in simulated mode.
  function incomingFor (callId, row, twilioCall) {
    return {
      callId,
      call: row,
      async accept () {
        let answered = null
        if (twilioCall) twilioCall.accept()
        else answered = await channels.simulateCall(callId, { status: 'answered' }, opts)
        const h = makeHandle(row || { id: callId, call: { status: 'ringing' } }, twilioCall)
        h._update(answered || { ...(row || { id: callId }), call: { ...((row && row.call) || {}), status: 'answered' } })
        handles.set(callId, h)
        return h
      },
      async reject () {
        if (twilioCall) twilioCall.reject()
        else await channels.simulateCall(callId, { status: 'no_answer' }, opts)
      }
    }
  }

  function makeHandle (row, twilioCall) {
    const local = emitter()
    let muted = false
    const h = {
      callId: row.id,
      call: row,
      _status: row.call?.status || 'initiated',
      get status () { return h._status },
      on: local.on,
      off: local.off,
      isMuted: () => (twilioCall ? !!twilioCall.isMuted?.() : muted),
      mute (on) {
        if (twilioCall) twilioCall.mute?.(!!on)
        else muted = !!on
      },
      async hangup () {
        if (twilioCall) {
          twilioCall.disconnect?.()
          return
        }
        if (TERMINAL.includes(h._status)) return
        const status = h._status === 'answered' ? 'completed' : 'canceled'
        await channels.simulateCall(h.callId, { status }, opts)
      },
      _update (call) {
        h.call = call
        const next = call?.call?.status
        if (next && next !== h._status) {
          h._status = next
          local.emit('state', next)
        }
      }
    }
    return h
  }

  async function mintSession () {
    const t = await channels.voiceToken(accountId ? { accountId } : {}, opts)
    if (!t || !t.mode) throw voiceError('voice_token_unavailable', 'the server did not answer a voice session')
    return t
  }

  return {
    get mode () { return session?.mode ?? null },
    get identity () { return session?.identity ?? null },
    on: events.on,
    off: events.off,

    async start () {
      if (session) return { mode: session.mode, identity: session.identity, accountId: session.accountId }
      const t = await mintSession()
      session = { mode: t.mode, identity: t.identity, accountId: t.accountId, edge: t.edge }
      unsubscribe = channels.subscribe({ workspaceId }, onFrame)
      if (t.mode === 'live') {
        let sdk
        try {
          sdk = await loadVoiceSdk()
        } catch (err) {
          throw voiceError('voice_sdk_unavailable', 'the Twilio Voice SDK could not be loaded', err)
        }
        const Device = sdk?.Device || sdk?.default?.Device
        if (!Device) throw voiceError('voice_sdk_unavailable', 'the Twilio Voice SDK has no Device')
        device = new Device(t.token, { edge: t.edge, ...deviceOptions })
        device.on('error', (err) => events.emit('error', err))
        device.on('tokenWillExpire', async () => {
          try {
            const next = await mintSession()
            if (next?.token) device.updateToken(next.token)
          } catch (err) {
            events.emit('error', err)
          }
        })
        device.on('incoming', (twilioCall) => {
          const callId = twilioCall?.customParameters?.get?.('callId') || null
          if (callId) incomingSeen.add(callId)
          events.emit('incoming', incomingFor(callId, null, twilioCall))
        })
        await device.register()
      }
      return { mode: session.mode, identity: session.identity, accountId: session.accountId }
    },

    // A call from the browser to a contact: { partyId | conversationId, to?, regarding? }.
    async call ({ partyId, conversationId, to, regarding } = {}) {
      if (!session) await this.start()
      const payload = {
        via: 'browser',
        channel: 'phone',
        ...(session.accountId || accountId ? { accountId: session.accountId || accountId } : {}),
        ...(partyId ? { partyId } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(to ? { to } : {}),
        ...(regarding ? { regarding } : {})
      }
      const started = await channels.startCall(payload, opts)
      const row = started?.call
      if (!row?.id) throw voiceError('call_not_started', 'the server did not start the call')
      if (session.mode !== 'live') {
        const h = makeHandle(row, null)
        handles.set(row.id, h)
        return h
      }
      let twilioCall
      try {
        twilioCall = await device.connect({ params: started.connect?.params || { callId: row.id } })
      } catch (err) {
        await channels.logCallOutcome(row.id, { status: 'failed' }, opts).catch(() => {})
        throw err
      }
      const h = makeHandle(row, twilioCall)
      handles.set(row.id, h)
      return h
    },

    stop () {
      stopped = true
      if (typeof unsubscribe === 'function') unsubscribe()
      unsubscribe = null
      if (device) {
        try { device.destroy() } catch (_) { /* already gone */ }
      }
      device = null
      handles.clear()
    }
  }
}

export default createVoiceClient
