import test from 'tape'
import sinon from 'sinon'
import { VoiceService } from '../../VoiceService.js'
import { SERVICE_METHODS } from '../../../utils/services.js'

// voiceVoices — GET /core/ai/voice/voices: the ElevenLabs account's voices
// the workspace settings Voice card offers. `{ voices, defaultVoiceId }`
// verbatim; a refusal keeps the route's typed code on `err.code` (the 503
// `elevenlabs_not_configured` is how the card knows voice is not set up),
// the same error shape voiceTts gives its callers.

const sandbox = sinon.createSandbox()
const makeService = () => {
  const svc = new VoiceService()
  sandbox.stub(svc, '_requireReady').returns(undefined)
  return svc
}

test('voiceVoices GETs /ai/voice/voices and returns the payload verbatim', async t => {
  t.plan(4)
  const svc = makeService()
  const payload = { voices: [{ id: 'AbCdEfGhIj0123456789', name: 'Nino' }], defaultVoiceId: 'x' }
  const stub = sandbox.stub(svc, '_request').resolves(payload)
  const out = await svc.voiceVoices()
  t.equal(stub.firstCall.args[0], '/ai/voice/voices', 'path')
  t.equal(stub.firstCall.args[1].method, 'GET', 'GET')
  t.equal(stub.firstCall.args[1].methodName, 'voiceVoices', 'method name for telemetry')
  t.deepEqual(out, payload, 'verbatim')
  sandbox.restore()
  t.end()
})

test('voiceVoices keeps the route code on err.code (503 elevenlabs_not_configured)', async t => {
  t.plan(3)
  const svc = makeService()
  const httpErr = new Error('Voice playback is unavailable', {
    cause: { error: 'elevenlabs_not_configured', message: 'Voice playback is unavailable' }
  })
  httpErr.status = 503
  sandbox.stub(svc, '_request').rejects(httpErr)
  try {
    await svc.voiceVoices()
    t.fail('should throw')
  } catch (err) {
    t.equal(err.status, 503, 'status kept')
    t.equal(err.code, 'elevenlabs_not_configured', 'typed code')
    t.ok(/unavailable/.test(err.message), 'operator message kept')
  }
  sandbox.restore()
  t.end()
})

test('voiceVoices is registered on the SDK method map beside voiceTts', t => {
  t.plan(2)
  t.equal(SERVICE_METHODS.voiceVoices, 'voice', 'sdk.voiceVoices routes to the voice service')
  t.equal(SERVICE_METHODS.voiceTts, 'voice', 'control: voiceTts is there too')
  t.end()
})
