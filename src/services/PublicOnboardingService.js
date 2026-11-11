import { BaseService } from './BaseService.js'

// PublicOnboardingService (service name `onboarding`) wraps the server's
// generic, per-workspace public-onboarding surface — every behaviour comes
// from the target workspace's own `settings.publicOnboarding`, nothing here
// names a tenant:
//
//   GET  /core/onboarding/options  — PUBLIC. The role picker a landing page
//                                    or sign-up form draws.
//   POST /core/onboarding/request  — PUBLIC. A request to join: an invitation
//                                    email, or a mail to the workspace's inbox
//                                    (the workspace's `delivery` decides).
//   POST /core/onboarding/join     — SIGNED IN. Self-join: the caller joins at
//                                    once, when the workspace AND the picked
//                                    role opt in (`selfJoin`).
//
// `scope` / `workspace` is a workspace id, its `ws_` key, or
// '<org-slug>/<workspace-slug>' (a published site addresses it by slug and
// carries no hardcoded id). `options` and `request` also take a bare
// workspace slug; `join` does not (a bare slug is unique only within an org).
//
// `options` and `request` are in BaseService._requiresInit's no-auth set: a
// visitor is anonymous there, and a signed-in browser must not look
// different. `join` sends the session's bearer token.
//
// Errors: a refusal throws with `.code` = the server's `error` code
// (`not_found`, `invalid_role`, `self_join_not_allowed`, `consent_required`,
// `email_unverified`, `account_not_eligible`, `host_scope_mismatch`,
// `captcha_failed`, …) and `.status` = the HTTP status. Branch on `.code`,
// never on the message text.

const _enc = encodeURIComponent

const withCode = (error) => {
  const body = error?.cause && typeof error.cause === 'object' ? error.cause : null
  if (body && !error.code) error.code = body.code || body.error || null
  return error
}

const _need = (v, name) => {
  if (v === undefined || v === null || v === '') throw new Error(`${name} is required`)
}

export class PublicOnboardingService extends BaseService {
  // GET /core/onboarding/options?workspace=<scope>
  // → { enabled: false } when the workspace has no public onboarding (one
  //   answer for "no such workspace" and "off"), else
  //   { enabled: true, roles: [{ key, label, description, selfJoin? }],
  //     captcha?: { provider, siteKey },
  //     selfJoin?: true, consentRequired?: boolean, consentVersion?: string }.
  // The self-join keys appear only on a workspace that opted in; then every
  // role carries `selfJoin` (true = `join` accepts it).
  async getOnboardingOptions (scope) {
    _need(scope, 'scope')
    try {
      return await this._call(
        'getOnboardingOptions',
        `/onboarding/options?workspace=${_enc(scope)}`
      )
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/request
  // payload: { workspace, email, role, name?, captchaToken? }
  // → { ok: true, emailSent, alreadyInvited? }.
  async requestOnboarding (payload = {}) {
    const { workspace, email, role, name, captchaToken } = payload || {}
    _need(workspace, 'workspace')
    _need(email, 'email')
    _need(role, 'role')
    const body = { workspace, email, role }
    if (name !== undefined && name !== null) body.name = name
    if (captchaToken) body.captchaToken = captchaToken
    try {
      return await this._call('requestOnboarding', '/onboarding/request', {
        method: 'POST',
        body
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/join — SIGNED IN (bearer).
  // { workspace, role, consent?: { terms: true, privacy: true, at? } }
  // → { ok: true, joined, alreadyMember, role, accountType,
  //     workspace: { id, key, slug, name }, organization: { id, slug, name } }.
  // Idempotent: a member already (any role) gets `alreadyMember: true` and
  // the current state; nothing changes. `consent.at` defaults to now (the
  // server keeps its own time too). After a join, call `sdk.getMe()` (or
  // `boot`) to read the new membership and `preferences.accountType`.
  async joinOnboarding ({ workspace, role, consent } = {}) {
    _need(workspace, 'workspace')
    _need(role, 'role')
    const body = { workspace, role }
    if (consent && typeof consent === 'object') {
      body.consent = {
        terms: consent.terms === true,
        privacy: consent.privacy === true,
        at: consent.at || new Date().toISOString()
      }
    }
    try {
      return await this._call('joinOnboarding', '/onboarding/join', {
        method: 'POST',
        body
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // Short names for `sdk.getService('onboarding')` — same calls.
  options (scope) {
    return this.getOnboardingOptions(scope)
  }

  request (payload) {
    return this.requestOnboarding(payload)
  }

  join (payload) {
    return this.joinOnboarding(payload)
  }
}
