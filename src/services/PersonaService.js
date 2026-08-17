import { BaseService } from './BaseService.js'
import { rootBus } from '../state/rootEventBus.js'
import { logger } from '../utils/logger.js'

// PersonaService — the SDK surface for persona sessions (tickets/sonnet.md
// PERSONA-4). Persona is ROLE SIMULATION ONLY: an admin views the workspace
// through a role's permission level AS THEMSELVES. It is never per-person
// impersonation — Nika's hard invariant (2026-08-11): "admins cant access
// users profiles and their data/chats etc with impersonating - its just
// permission view". There is no user id anywhere in this feature, by
// construction, and this service enforces that structurally (see
// startPersona's validation + the negative tests).
//
// Server contract (the SHIPPED one — server 886a9b27, not the ticket's
// pre-scope-cut sketch):
//   - The JWT `persona` claim is STRICTLY `{ role, sid, startedAt }` — any
//     other key is rejected server-side (`PERSONA_CLAIM_ALLOWED_KEYS` in
//     server/workers/workspace-project/src/auth.js). The `{ type, id }`
//     shape from the original PERSONA-4 draft is structurally
//     unrepresentable, so this service does not accept it either.
//   - Valid persona TARGET roles are the workspace tiers minus owner:
//     admin / editor / viewer / guest (`PERSONA_TARGET_ROLES` below mirrors
//     the server's literal table). 'owner' is the ceiling an owner already
//     has — never a target.
//   - Resolution happens server-side in claimsToScope on every request:
//     narrowing only, rank re-checked live, ended/unknown sessions FAIL
//     CLOSED (never silently full-admin). The claim in the active access
//     token therefore IS the client's source of truth for "am I in a
//     persona" — which is why getPersona() decodes locally instead of
//     spending a round trip.
//
// Routes (main server, /core prefix added by BaseService._request; the
// session store + these write endpoints are PERSONA-2/3's server half —
// tickets/opus.md PERSONA-1 DONE note names them):
//   POST /core/persona/start  { role }  → { success, data: { persona,
//                                          accessToken, refreshToken? } }
//   POST /core/persona/end    {}        → { success, data: { accessToken? } }
//
// Token mechanics: the persona ACCESS token replaces the active one via
// TokenManager.setTokens — which PRESERVES the stored refresh token when
// none is supplied (TokenManager.js: `refreshToken || this.tokens
// .refreshToken`). The refresh token stays the admin's own, persona-free
// credential, so `refreshTokens()` always mints a clean admin token — that
// is endPersona's local escape hatch when the server can't be reached, and
// it is what makes "exiting can never strand the admin" true. Persistence
// through TokenManager also gives PERSONA-3's reload-survival for free: a
// hard reload restores the persisted persona token and the session resumes
// AS persona, never silently as admin.
//
// ⚠ Every flat sdk.* method returns a Promise (workspace init gate — and
// getPersona is async here for uniformity across environments), so
// `if (sdk.getPersona())` is ALWAYS truthy. Await the resolved value. This
// has bitten this codebase before (workspace a0a81ea6); the tests pin it.

// Mirrors the server's PERSONA_TARGET_ROLES literal (server/workers/
// workspace-project/src/auth.js, 886a9b27) — the four workspace tiers an
// admin can view as. Exported for pickers that need a synchronous role
// list (same rationale as the PERMISSION_MAP main-entry export). UI labels
// ("view as [team member]") are product copy layered on top by the picker —
// the wire only ever speaks these enum values.
export const PERSONA_TARGET_ROLES = Object.freeze([
  'admin',
  'editor',
  'viewer',
  'guest'
])

// Argument keys capable of naming a person. Presenting ANY of these to
// startPersona is refused before a single byte reaches the network — the
// invariant's regression test asserts exactly this ("the persona resolver
// must have no parameter capable of naming a user").
const USER_NAMING_KEYS = ['userId', 'user', 'memberId', 'email', 'sub']

// HTTP statuses meaning "that persona session is already gone server-side"
// (double-end, end-after-expiry, unknown sid). These are SUCCESS cases for
// endPersona — the ticket's idempotency requirement.
const PERSONA_GONE_STATUSES = new Set([404, 409, 410])

export class PersonaService extends BaseService {
  /**
   * Start a persona session — view the workspace as `role`, server-enforced.
   *
   * POST /core/persona/start. The server re-checks the REAL actor is
   * admin-or-above, persists the session bound to (actor, workspace, role),
   * and mints an access token carrying the `persona: { role, sid,
   * startedAt }` claim. That token is adopted into TokenManager (replacing
   * the active access token; the admin's refresh token is preserved).
   *
   * @param {object} args
   * @param {string} args.role - one of PERSONA_TARGET_ROLES
   *   (admin/editor/viewer/guest). Never 'owner', never a user — any
   *   user-naming key throws without touching the network.
   * @returns {Promise<object>} the server payload ({ persona, accessToken, … })
   */
  async startPersona (args = {}) {
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(
        'startPersona requires an argument object: startPersona({ role })'
      )
    }
    // ── Structural invariant: no parameter capable of naming a user ──────
    const userKeys = USER_NAMING_KEYS.filter((k) => k in args)
    if (args.type === 'user' || userKeys.length) {
      throw new Error(
        'persona is role simulation only — it can never name a user. ' +
          'No user-identifying argument is accepted ' +
          `(got: ${[...(args.type === 'user' ? ['type: "user"'] : []), ...userKeys].join(', ')}). ` +
          'Pass { role } with one of: ' + PERSONA_TARGET_ROLES.join(', ')
      )
    }
    // Legacy `{ type: 'role', id }` sketch from the pre-scope-cut draft —
    // removed along with the type axis (the only other type was the
    // forbidden one). Point migrators at the role-only shape.
    if ('type' in args || 'id' in args) {
      throw new Error(
        "the { type, id } persona shape was removed with the per-person scope cut — pass { role: '<role>' } " +
          `(one of: ${PERSONA_TARGET_ROLES.join(', ')})`
      )
    }
    const { role } = args
    if (typeof role !== 'string' || !role) {
      throw new Error(
        'startPersona requires a role — one of: ' +
          PERSONA_TARGET_ROLES.join(', ')
      )
    }
    if (role === 'owner') {
      throw new Error(
        "'owner' is structurally excluded as a persona target — it is the baseline an owner already has, not a lens to switch into"
      )
    }
    if (!PERSONA_TARGET_ROLES.includes(role)) {
      throw new Error(
        `invalid persona role '${role}' — must be one of: ${PERSONA_TARGET_ROLES.join(', ')}`
      )
    }

    const previous = this._decodePersonaClaim()

    const data = await this._call('startPersona', '/persona/start', {
      method: 'POST',
      body: { role }
    })

    this._installPersonaOverlay(data)

    const persona = data?.persona || this._decodePersonaClaim()
    rootBus.emit('sdk.personaChanged', { previous, persona })
    return data
  }

  /**
   * End the active persona session and restore the admin's own view.
   *
   * IDEMPOTENT AND NEVER REJECTS — exiting a persona is a security
   * affordance (tickets/opus.md PERSONA-3) and must not explode:
   *   - no persona on the active token → resolves { ok: true } with ZERO
   *     network traffic (double-end after a successful end lands here);
   *   - server says the session is already gone (404/409/410 — end after
   *     expiry) → still ok: the claim is shed locally via token refresh;
   *   - server unreachable / 5xx → the claim is shed locally the same way
   *     (the server row fails closed per 886a9b27 and expires on its own);
   *   - only when the active token STILL carries a persona claim after all
   *     recovery (unreachable server AND unrefreshable token) does this
   *     resolve { ok: false } — resolved, not rejected, and honest: the
   *     persona is genuinely still in force, so the UI must keep the exit
   *     affordance visible rather than drop the banner over a live lens.
   *
   * @returns {Promise<{ok: boolean, wasActive: boolean, endedRemotely:
   *   boolean, restored: boolean, persona: object|null, error?: string}>}
   *   ok — the active token now carries no persona claim;
   *   wasActive — a persona claim was present when called;
   *   endedRemotely — the server acknowledged the end (2xx or already-gone);
   *   restored — a clean access token was adopted/refreshed during this call.
   */
  async endPersona () {
    const result = {
      ok: false,
      wasActive: false,
      endedRemotely: false,
      restored: false,
      persona: null
    }
    let active = null
    try {
      active = this._decodePersonaClaim()
      if (!active) {
        result.ok = true
        return result
      }
      result.wasActive = true

      let data = null
      try {
        data = await this._call('endPersona', '/persona/end', {
          method: 'POST',
          body: {}
        })
        result.endedRemotely = true
      } catch (err) {
        if (PERSONA_GONE_STATUSES.has(err?.status)) {
          // Already ended/expired server-side — the idempotent success case.
          result.endedRemotely = true
        } else {
          logger.warn(
            '[persona] endPersona server call failed — recovering locally:',
            err?.message || err
          )
        }
      }

      // Shed the persona claim. With the per-tab overlay this is a DELETE,
      // not a recovery: the admin's own token was never overwritten, so
      // removing the overlay restores it exactly, with no network call and
      // nothing that can fail. That closes the old failure mode where an
      // unreachable server plus an unrefreshable token left the lens stuck
      // on — the whole reason endPersona used to need a refresh dance.
      if (typeof this._tokenManager?.clearPersonaToken === 'function') {
        this._tokenManager.clearPersonaToken()
        result.restored = true
      } else if (this._adoptTokens(data)) {
        // Legacy path — a TokenManager without overlay support (published
        // version skew). Keeps the old adopt/refresh recovery intact.
        result.restored = true
      } else if (this._tokenManager?.hasRefreshToken?.()) {
        try {
          await this._tokenManager.refreshTokens()
          result.restored = true
        } catch (err) {
          logger.warn(
            '[persona] token refresh during endPersona failed:',
            err?.message || err
          )
        }
      }

      const after = this._decodePersonaClaim()
      result.ok = !after
      result.persona = after
      if (!result.ok) {
        result.error =
          'persona still active on the current token — server unreachable and token not refreshable; retry endPersona()'
      }
    } catch (err) {
      // Belt-and-braces: endPersona never rejects.
      result.error = err?.message || String(err)
      logger.warn('[persona] endPersona failed unexpectedly:', result.error)
    }
    if (result.ok && result.wasActive) {
      rootBus.emit('sdk.personaChanged', { previous: active, persona: null })
    }
    return result
  }

  /**
   * The active persona claim, or null. Local decode of the active access
   * token — no network: the claim IS what the server enforces per request
   * (claimsToScope, server 886a9b27), and a revoked-but-unrefreshed session
   * still returning its claim is the SAFE direction (the exit affordance
   * stays visible; the server fails the stale session closed regardless).
   *
   * Async for cross-environment uniformity — ⚠ the return value is a
   * Promise and therefore ALWAYS truthy. `if (await sdk.getPersona())`,
   * never `if (sdk.getPersona())`.
   *
   * @returns {Promise<{role: string|null, sid: string|null, startedAt:
   *   number|string|null}|null>}
   */
  async getPersona () {
    return this._decodePersonaClaim()
  }

  // getPersonaSession — the SERVER-truth reload oracle — lives on
  // WorkspaceProjectService, NOT here: the oracle must present the SAME
  // Authorization header every other workspace-project call presents (the
  // `workspaceProjectTokenProvider` supplies the per-tab persona token in the
  // sessionStorage session model; TokenManager supplies it in the
  // adopted-token model). This service's plain TokenManager transport would
  // show the oracle a base token whenever the persona rides the provider —
  // reporting `active: false` for a live persona. See
  // WorkspaceProjectService.getPersonaSession.

  // A workspace/org switch mid-persona cannot carry the lens across: the
  // session row is bound to (actor, workspace, role) and the resolver
  // rejects cross-tenant sid reuse (886a9b27), so a carried claim would
  // brick every request in the new scope. End the persona as part of the
  // switch (sdk.switchOrg/switchWorkspace walk these hooks). No-ops in one
  // sync check when no persona is active — the universal case today.
  switchWorkspace () {
    if (!this._decodePersonaClaim()) return
    return this.endPersona()
  }

  switchOrg () {
    if (!this._decodePersonaClaim()) return
    return this.endPersona()
  }

  // ── internals ─────────────────────────────────────────────────────────

  // Adopt tokens from a start/end payload into TokenManager. Accepts both
  // house mint shapes — flat `{ accessToken, refreshToken }` (demo flow)
  // and nested `{ tokens: { accessToken, … } }` (login flow). Omitting the
  // refresh token PRESERVES the stored one (TokenManager contract) — the
  // admin's persona-free refresh credential must survive persona adoption.
  // Returns true when an access token was adopted.
  _adoptTokens (data) {
    const accessToken = data?.accessToken || data?.tokens?.accessToken || null
    if (!accessToken || !this._tokenManager) return false
    const refreshToken =
      data?.refreshToken || data?.tokens?.refreshToken || null
    const expiresIn =
      data?.expiresIn ?? data?.tokens?.accessTokenExp?.expiresIn
    this._tokenManager.setTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      ...(expiresIn != null ? { expires_in: expiresIn } : {}),
      token_type: 'Bearer'
    })
    return true
  }

  // Install the persona token as this tab's OVERLAY — never as the tab's
  // (and therefore the origin's) session token.
  //
  // This is the difference between "the admin is viewing as a viewer in this
  // tab" and "the admin is a viewer everywhere". `setTokens` writes
  // `symbols_access_token` in localStorage, which every tab on the origin
  // reads, so adopting a persona that way silently narrowed the admin's
  // OTHER tabs too. `setPersonaToken` writes a distinct sessionStorage key
  // that only this tab can see, and leaves the admin's own token untouched.
  //
  // Falls back to the old adopt-into-TokenManager behaviour when the
  // TokenManager predates the overlay (published-version skew) — a persona
  // that works cross-tab beats one that does not work at all, and the
  // caller's UI is identical either way.
  _installPersonaOverlay (data) {
    const accessToken = data?.accessToken || data?.tokens?.accessToken || null
    if (!accessToken || !this._tokenManager) return false
    if (typeof this._tokenManager.setPersonaToken === 'function') {
      return this._tokenManager.setPersonaToken(accessToken)
    }
    logger.warn(
      '[persona] TokenManager has no overlay support — falling back to cross-tab token adoption'
    )
    return this._adoptTokens(data)
  }

  // Decode the active access token's payload without verifying the
  // signature (mirrors TokenManager._decodeJwtExpMs). Null when there is
  // no token / not a JWT / unparseable.
  _decodeAccessTokenClaims () {
    const token = this._tokenManager?.getAccessToken?.()
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      while (payload.length % 4) payload += '='
      const json =
        typeof atob === 'function'
          ? atob(payload)
          : Buffer.from(payload, 'base64').toString('utf8')
      return JSON.parse(json)
    } catch {
      return null
    }
  }

  // The persona claim off the active token, normalized to
  // { role, sid, startedAt } — or null when absent. Deliberately PERMISSIVE
  // about inner shape (any truthy object counts): a malformed claim must
  // still read as "persona active" so exit paths run rather than strand the
  // admin — the same fail direction the exit affordance uses everywhere
  // (fail open toward showing the way out; the server independently fails
  // the actual request closed).
  _decodePersonaClaim () {
    const claims = this._decodeAccessTokenClaims()
    const p = claims?.persona
    if (!p || typeof p !== 'object') return null
    return {
      role: typeof p.role === 'string' ? p.role : null,
      sid: p.sid ?? null,
      startedAt: p.startedAt ?? null
    }
  }
}
