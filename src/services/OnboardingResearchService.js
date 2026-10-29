import { BaseService } from './BaseService.js'

// POB — personalized onboarding (2026-10-29). The public read of a company's
// OWN website before sign-up (server: /core/onboarding/research, PLAN §7b)
// and the workspace's build state after it (§7b-2).
//
// Errors: a refusal throws with `.code` = the server's code
// (`invalid_url`, `free_mail_domain`, `unsafe_url`, `research_rate_limited`,
// `not_found`, …) and `.status` = the HTTP status — clients branch on
// `.code`, never on the message text.

const withCode = (error) => {
  const body = error?.cause && typeof error.cause === 'object' ? error.cause : null
  if (body && !error.code) error.code = body.code || body.error || null
  return error
}

export class OnboardingResearchService extends BaseService {
  // GET /core/onboarding/config — PUBLIC. `{ freeMailDomains, caps:
  // { pagesPerSite, runsPerHour, softCapSeconds } }`. UI hints only; the
  // server is the guard.
  async getOnboardingConfig () {
    try {
      return await this._call('getOnboardingConfig', '/onboarding/config')
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/research — PUBLIC. `{ url }` (a URL, a bare host,
  // or a work e-mail: only its domain is used) → `{ id, domain, status }`.
  async startResearch ({ url } = {}) {
    if (!url || typeof url !== 'string') throw new Error('url is required')
    try {
      const response = await this._request('/onboarding/research', {
        method: 'POST',
        body: JSON.stringify({ url }),
        methodName: 'startResearch'
      })
      return response
    } catch (error) {
      throw withCode(error)
    }
  }

  // GET /core/onboarding/research/:id — PUBLIC. `{ id, domain, status,
  // startedAt, finishedAt, findings: [Finding], profile }`.
  async getResearch (id) {
    if (!id) throw new Error('id is required')
    try {
      return await this._request(`/onboarding/research/${encodeURIComponent(id)}`, {
        method: 'GET',
        methodName: 'getResearch'
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // GET /core/onboarding/research/:id/stream — PUBLIC SSE. `onEvent` gets
  // ONE shape: `{ type: 'finding', finding }` | `{ type: 'done', profile }` |
  // `{ type: 'failed', code }`. A finding whose `key` was seen before
  // REPLACES the earlier line. Nothing fires after done / failed: the
  // subscription closes itself (a closed stream must not reconnect and
  // replay). Returns a stop function.
  streamResearch (id, onEvent) {
    if (!id) throw new Error('id is required')
    if (typeof onEvent !== 'function') throw new Error('onEvent must be a function')
    let over = false
    let stop = null
    const end = () => {
      over = true
      if (stop) stop()
    }
    stop = this._sseSubscribe(
      `/onboarding/research/${encodeURIComponent(id)}/stream`,
      {},
      (event) => {
        if (over) return
        onEvent(event)
        if (event.type === 'done' || event.type === 'failed') end()
      },
      {
        anonymous: true,
        events: [
          { name: 'finding', frame: (data) => ({ type: 'finding', finding: data }) },
          { name: 'done', frame: (data) => ({ type: 'done', profile: data?.profile ?? null }) },
          { name: 'failed', frame: (data) => ({ type: 'failed', code: data?.code || 'failed' }) }
        ]
      }
    )
    if (over) stop()
    return () => end()
  }
}
