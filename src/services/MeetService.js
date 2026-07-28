import { BaseService } from './BaseService.js'

// MeetService — wraps the core server's /core/meet/* surface (the meet
// domain on the main API server).
//
// Routes:
//   POST /core/meet/guest/request  → { waitingId, status, autoAdmitted,
//                                      transcribeEnabled, roomName }
//   POST /core/meet/guest/status   → { status: 'waiting'|'admitted'|'rejected',
//                                      roomId, guestName }
//   POST /core/meet/guest/token    → { token, url, identity, roomName }
//   POST /core/meet/mute           → { ok: true }
//
// The three guest methods are ANONYMOUS — they are listed in
// BaseService._requiresInit's noInitMethods set (same unauthenticated
// path login/register use), so no bearer token is attached and a
// signed-out visitor can call them. `meetMuteParticipant` is
// authenticated (host-only on the server).
//
// The API base resolves per environment through BaseService/_apiUrl like
// every other SDK request (its legacy raw-fetch predecessor was pinned to
// a hardcoded local-dev host — broken on every deployed env).

export class MeetService extends BaseService {
  /**
   * Guest asks to join a public meet room (lands in the waiting room, or
   * is auto-admitted when the room allows it). Anonymous.
   *
   * @param {object} args
   * @param {string} args.roomId
   * @param {string} [args.name]     - guest display name
   * @param {string} [args.email]    - guest email, if the room requires it
   * @param {string} [args.password] - room guest password, if required
   * @returns {Promise<{waitingId: number, status: 'waiting'|'admitted', autoAdmitted: boolean, transcribeEnabled: boolean, roomName: string}>}
   */
  meetGuestRequest ({ roomId, name, email, password } = {}) {
    if (!roomId) throw new Error('roomId is required')
    return this._call('meetGuestRequest', '/meet/guest/request', {
      method: 'POST',
      body: { roomId, name, email, password }
    })
  }

  /**
   * Public-safe room metadata for the guest join form (room name, which
   * fields are required, whether a password is needed — as a BOOLEAN, the
   * raw password never leaves the server). Anonymous.
   *
   * @param {object} args
   * @param {string} args.roomId
   * @returns {Promise<{name: string, isPrivate: boolean, endedAt: string|null, requireName: boolean, requireEmail: boolean, requirePassword: boolean, autoAdmit: boolean}>}
   */
  meetGuestMeta ({ roomId } = {}) {
    if (!roomId) throw new Error('roomId is required')
    return this._call('meetGuestMeta', '/meet/guest/meta', {
      method: 'POST',
      body: { roomId }
    })
  }

  /**
   * Poll the guest's admission status. Anonymous.
   *
   * @param {object} args
   * @param {number|string} args.waitingId
   * @returns {Promise<{status: 'waiting'|'admitted'|'rejected', roomId: string, guestName: string}>}
   */
  meetGuestStatus ({ waitingId } = {}) {
    if (!waitingId) throw new Error('waitingId is required')
    return this._call('meetGuestStatus', '/meet/guest/status', {
      method: 'POST',
      body: { waitingId }
    })
  }

  /**
   * Mint a LiveKit token for an admitted guest. Anonymous.
   *
   * @param {object} args
   * @param {string} args.roomId
   * @param {number|string} args.waitingId
   * @returns {Promise<{token: string, url: string, identity: string, roomName: string}>}
   */
  meetGuestToken ({ roomId, waitingId } = {}) {
    if (!roomId) throw new Error('roomId is required')
    return this._call('meetGuestToken', '/meet/guest/token', {
      method: 'POST',
      body: { roomId, waitingId }
    })
  }

  /**
   * Host-only: remotely mute/unmute a participant's published track.
   * Authenticated — the server verifies the caller is the room creator.
   *
   * @param {object} args
   * @param {string} args.roomId
   * @param {string} args.participantIdentity
   * @param {string} args.trackSid
   * @param {boolean} args.muted
   * @returns {Promise<{ok: true}>}
   */
  meetMuteParticipant ({ roomId, participantIdentity, trackSid, muted } = {}) {
    if (!roomId) throw new Error('roomId is required')
    if (!participantIdentity) throw new Error('participantIdentity is required')
    if (!trackSid) throw new Error('trackSid is required')
    if (typeof muted !== 'boolean') throw new Error('muted must be a boolean')
    return this._call('meetMuteParticipant', '/meet/mute', {
      method: 'POST',
      body: { roomId, participantIdentity, trackSid, muted }
    })
  }
}
