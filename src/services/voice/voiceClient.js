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
// reject(), status, on('state') — a live call the caller cancels before accept
// ends at once: 'canceled' + a local call frame }), 'error'.
//
// ERRORS: every error this client throws or emits carries err.code (the
// original on err.cause): microphone_denied, call_not_connected,
// voice_device_unavailable, voice_device_error, call_error,
// voice_sdk_unavailable, voice_token_unavailable, call_not_started,
// invalid_digits, not_found — and the server's codes from the channels
// service (ChannelService sets err.code on every refusal).
//
// A CALL HANDLE (call(), accept(), attach()): callId, call (the row, the
// panel's truth), status, on('state' | 'digits' | 'hold'), and — when THIS
// tab carries the call's audio — mute(on) / isMuted(), sendDigits(keys)
// (0-9 * # w), hold(on) / isHeld() (simulated always; live only when the
// server reports capabilities.hold). hangup() settles the handle at once (a
// terminal 'state': completed when answered, else canceled); the stream frame
// confirms. attach(callId) follows a call started elsewhere: no audio here
// (media 'none' — no mute / keypad / hold), hang-up through the server.

// The ONE place the Twilio Voice JS SDK is loaded — a literal specifier, so a
// bundler code-splits it and loads it only when a live voice session starts.
export const loadTwilioVoiceSdk = () => import('@twilio/voice-sdk')

const TERMINAL = ['completed', 'no_answer', 'busy', 'failed', 'canceled']
const DIGITS = /^[0-9*#wW]+$/

// Every microphone refusal, whatever shape it arrives in: Twilio's codes
// (31208 user media denied, 31401 permission denied, 31402 acquisition
// failed) or the browser's NotAllowedError / PermissionDeniedError — also
// when wrapped (originalError / cause).
const MIC_CODES = [31208, 31401, 31402]
const MIC_NAMES = ['NotAllowedError', 'PermissionDeniedError']
export function isMicrophoneRefusal (err) {
  for (let e = err, i = 0; e && i < 4; e = e.originalError || e.cause, i += 1) {
    if (MIC_CODES.includes(Number(e.code)) || MIC_NAMES.includes(e.name)) return true
  }
  return false
}

// A Twilio / browser error → a voice error with err.code (the original on
// err.cause): microphone_denied, else `fallback`.
function fromTwilio (err, fallback, message) {
  if (err && typeof err === 'object' && typeof err.code === 'string' && err.code.length && !/^\d+$/.test(err.code)) return err
  return isMicrophoneRefusal(err)
    ? voiceError('microphone_denied', 'the microphone was refused', err)
    : voiceError(fallback, message, err)
}

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
    const local = emitter()
    let accepted = false
    const inc = {
      callId,
      call: row,
      status: 'ringing',
      on: local.on,
      off: local.off,
      async accept () {
        accepted = true
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
    if (twilioCall) {
      // The caller hung up before accept: end the ring at once — the
      // incoming's own 'state' and a LOCAL call frame (local: true) for
      // whoever follows the call by frames; the stream frame confirms.
      twilioCall.on?.('cancel', () => {
        if (accepted || inc.status !== 'ringing') return
        inc.status = 'canceled'
        local.emit('state', 'canceled')
        if (callId) {
          events.emit('call', {
            type: 'channels.call',
            id: callId,
            local: true,
            call: { ...(row || { id: callId }), call: { ...((row && row.call) || {}), direction: 'in', status: 'canceled' } },
            conversation: null,
            ring: false
          })
        }
      })
    }
    return inc
  }

  // `twilioCall` = the Twilio Voice SDK call when THIS tab carries the audio
  // (live); null for a simulated call; `attached` = followed only (no audio).
  function makeHandle (row, twilioCall, { attached = false } = {}) {
    const local = emitter()
    let muted = false
    let held = false
    let digits = ''
    const live = !!twilioCall
    const endedStatus = () => (h._status === 'answered' ? 'completed' : 'canceled')
    const h = {
      callId: row.id,
      call: row,
      attached,
      media: attached ? 'none' : live ? 'live' : 'simulated',
      _status: row.call?.status || 'initiated',
      get status () { return h._status },
      get digits () { return digits },
      on: local.on,
      off: local.off,
      async hangup () {
        if (attached) {
          const r = await channels.hangupCall(h.callId, opts)
          if (r?.call) h._update(r.call)
          return
        }
        if (TERMINAL.includes(h._status)) return
        if (live) {
          const status = endedStatus()
          twilioCall.disconnect?.()
          h._settle(status)
          return
        }
        // Simulated: the server's answer is the end — settle on it now.
        const r = await channels.simulateCall(h.callId, { status: endedStatus() }, opts)
        if (r?.call) h._update(r)
      },
      _update (call) {
        h.call = call
        const next = call?.call?.status
        if (next && next !== h._status) {
          h._status = next
          local.emit('state', next)
        }
      },
      // A local terminal state (the stream frame confirms it later).
      _settle (status) {
        if (TERMINAL.includes(h._status)) return
        h._update({ ...(h.call || { id: h.callId }), call: { ...((h.call && h.call.call) || {}), status } })
      }
    }
    if (attached) return h
    h.isMuted = () => (live ? !!twilioCall.isMuted?.() : muted)
    h.mute = (on) => {
      if (live) twilioCall.mute?.(!!on)
      else muted = !!on
    }
    h.sendDigits = (keys) => {
      const k = String(keys ?? '')
      if (!DIGITS.test(k)) throw voiceError('invalid_digits', 'digits are 0-9, *, # and w (a pause)')
      if (live) twilioCall.sendDigits?.(k)
      digits += k
      local.emit('digits', k)
    }
    if (!live || session?.capabilities?.hold === true) {
      h.isHeld = () => held
      h.hold = async (on) => {
        const next = !!on
        if (live) await channels.holdCall(h.callId, { on: next }, opts)
        held = next
        local.emit('hold', next)
      }
    }
    if (live) {
      // The other side hung up, or the network dropped: settle now.
      twilioCall.on?.('disconnect', () => h._settle(endedStatus()))
      twilioCall.on?.('cancel', () => h._settle('canceled'))
      twilioCall.on?.('error', (err) => events.emit('error', fromTwilio(err, 'call_error', 'the call reported an error')))
    }
    return h
  }

  function describe () {
    return {
      mode: session.mode,
      identity: session.identity,
      accountId: session.accountId,
      accountIds: [...session.accountIds],
      capabilities: { ...session.capabilities }
    }
  }

  async function mintSession () {
    const t = await channels.voiceToken(accountId ? { accountId } : {}, opts)
    if (!t || !t.mode) throw voiceError('voice_token_unavailable', 'the server did not answer a voice session')
    return t
  }

  return {
    get mode () { return session?.mode ?? null },
    get identity () { return session?.identity ?? null },
    // Every number this session calls from and rings on (one Twilio account).
    get accountIds () { return session?.accountIds ? [...session.accountIds] : [] },
    on: events.on,
    off: events.off,

    async start () {
      if (session) return describe()
      const t = await mintSession()
      session = {
        mode: t.mode,
        identity: t.identity,
        accountId: t.accountId,
        accountIds: Array.isArray(t.accountIds) && t.accountIds.length ? [...t.accountIds] : t.accountId ? [t.accountId] : [],
        edge: t.edge,
        capabilities: t.capabilities || {}
      }
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
        device.on('error', (err) => events.emit('error', fromTwilio(err, 'voice_device_error', 'the voice device reported an error')))
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
        try {
          await device.register()
        } catch (err) {
          throw fromTwilio(err, 'voice_device_unavailable', 'the voice device could not register')
        }
      }
      return describe()
    },

    // A call from the browser to a contact: { partyId | conversationId, to?,
    // regarding?, accountId? } — accountId = the number to call from (one of
    // accountIds); the session's default number when omitted.
    async call ({ partyId, conversationId, to, regarding, accountId: from } = {}) {
      if (!session) await this.start()
      const number = from || session.accountId || accountId
      const payload = {
        via: 'browser',
        channel: 'phone',
        ...(number ? { accountId: number } : {}),
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
        throw fromTwilio(err, 'call_not_connected', 'the call could not connect')
      }
      const h = makeHandle(row, twilioCall)
      handles.set(row.id, h)
      return h
    },

    // Follow a call started elsewhere (another tab, an adopted call): the row
    // now, the stream after; no audio in this tab; hang-up through the server.
    async attach (callId) {
      if (!session) await this.start()
      const r = await channels.getCall(callId, opts)
      const row = r?.call || (r?.id ? r : null)
      if (!row?.id) throw voiceError('not_found', 'call not found')
      const h = makeHandle(row, null, { attached: true })
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
