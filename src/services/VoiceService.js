import { BaseService } from './BaseService.js'

// VoiceService — /core/ai/voice/*. Backs the workspace voice overlay's v2
// engines (architecture/VOICE_COMMANDS.md): server-side STT via Groq
// whisper-large-v3-turbo and TTS via ElevenLabs, replacing v1's
// browser-only Web Speech + speechSynthesis (which Safari/Firefox don't
// implement usefully).
//
// Both routes answer 503 `{ error, message }` when their upstream key is
// missing from the API server's environment — the message names the exact
// env var and the operator step. Surface that text to the user rather than
// a generic failure; it's the difference between "voice is broken" and
// "voice isn't provisioned yet".
export class VoiceService extends BaseService {
  /**
   * POST /ai/voice/transcribe — audio clip → text.
   *
   * `audio` is a Blob/File straight off MediaRecorder (typically
   * `audio/webm;codecs=opus`). Sent as multipart under the field name
   * `audio`, which is what the route's multer instance expects.
   * `_request` passes a FormData body through untouched (no JSON
   * stringify, no Content-Type header — the browser sets the multipart
   * boundary itself), so this needs no special transport handling.
   *
   * @param {{ audio: Blob|File, filename?: string }} opts
   * @returns {Promise<{ text: string, … }>} the route's JSON verbatim
   */
  voiceTranscribe({ audio, filename = 'clip.webm' } = {}) {
    if (!audio) throw new Error('audio is required')
    const form = new FormData()
    form.append('audio', audio, filename)
    return this._call('voiceTranscribe', '/ai/voice/transcribe', {
      method: 'POST',
      body: form
    })
  }

  /**
   * POST /ai/voice/tts — text → streamed audio.
   *
   * Returns the raw `Response` (NOT parsed JSON) so the caller owns the
   * stream: `new Audio(URL.createObjectURL(await res.blob()))` for
   * simple playback, or `res.body.getReader()` to start playing before the
   * clip finishes — which is the whole point of the server streaming it.
   * That's why this bypasses `_call` (which would parse + unwrap a JSON
   * envelope) and issues the fetch directly with the same auth + base URL
   * resolution every other method uses.
   *
   * @param {{ text: string, voiceId?: string, modelId?: string, signal?: AbortSignal }} opts
   * @returns {Promise<Response>} streaming audio response
   */
  async voiceTts({ text, voiceId, modelId, signal } = {}) {
    this._requireReady('voiceTts')
    if (!text || typeof text !== 'string') throw new Error('text is required')

    const url = `${this._apiUrl}/core/ai/voice/tts`
    const headers = { 'Content-Type': 'application/json' }
    const token = this._tokenManager?.getAccessToken?.()
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voiceId, modelId }),
      signal
    })

    if (!res.ok) {
      // The route's error envelope is `{ error, message }` — surface the
      // operator-facing message (e.g. the 503 naming ELEVENLABS_API_KEY)
      // rather than a bare status code.
      const detail = await res.json().catch(() => null)
      const err = new Error(
        detail?.message || `voiceTts failed (HTTP ${res.status})`
      )
      err.status = res.status
      err.code = detail?.error
      throw err
    }
    return res
  }
}

export const createVoiceService = (config) => new VoiceService(config)

export default VoiceService
