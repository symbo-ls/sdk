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

  // ── After sign-up: the workspace's build board, "Delete all research" and
  // the team rows (server PLAN §7b-2 / §7b-3). Authenticated, workspace-
  // scoped: `workspaceId` explicit, else the active workspace.

  _onboardingWorkspace (workspaceId) {
    const ws = this._resolveWorkspaceId(workspaceId)
    if (!ws) throw new Error('workspaceId is required')
    return encodeURIComponent(ws)
  }

  // GET /core/onboarding/build → `{ researchId, steps: [{ key, status,
  // label: { en, ka }, result?: { count }, error?: { code }, reason?: { code },
  // at, retryable }], done, checklist }`. `retryable` is true only for a
  // failed step "Try again" can run (retryOnboardingBuildStep). `checklist`
  // is the "Getting started" ticks, each `{ done, at }` from a server fact:
  // `profile` (markOnboardingProfileReviewed), `website` (the site step is
  // done), `team` (a POB invite used a team row), `import` (a finished
  // import run; v0 always `{ done: false, at: null }`). `null` when this
  // workspace has no build board (a sign-up without research).
  async getOnboardingBuild (workspaceId) {
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(`/onboarding/build?workspaceId=${ws}`, {
        method: 'GET',
        methodName: 'getOnboardingBuild'
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/build/:key/retry — a FAILED step only (409
  // `not_retryable` otherwise) → the new board (the getOnboardingBuild shape).
  async retryOnboardingBuildStep (workspaceId, key) {
    if (!key) throw new Error('key is required')
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(
        `/onboarding/build/${encodeURIComponent(key)}/retry?workspaceId=${ws}`,
        { method: 'POST', methodName: 'retryOnboardingBuildStep' }
      )
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/build/profile/reviewed — the owner confirmed the
  // research review (the `checklist.profile` tick). Idempotent: the first
  // time is kept. → the board (the getOnboardingBuild shape). A member.
  async markOnboardingProfileReviewed (workspaceId) {
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(`/onboarding/build/profile/reviewed?workspaceId=${ws}`, {
        method: 'POST',
        methodName: 'markOnboardingProfileReviewed'
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // DELETE /core/onboarding/workspace-research — ONE call: research values
  // still unchanged, the research records, the team rows →
  // `{ deleted: { records, people, profileFields } }`.
  async deleteOnboardingResearch (workspaceId) {
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(`/onboarding/workspace-research?workspaceId=${ws}`, {
        method: 'DELETE',
        methodName: 'deleteOnboardingResearch'
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // DELETE /core/onboarding/workspace-research/lines/:line — ONE line of the
  // research summary: `profile` (the CompanyProfile values research still
  // owns), `offerings`, `faq` (from the research record) or `team` (the team
  // rows) → `{ deleted: { line, records, people, profileFields } }`; 400
  // `unknown_line` for any other line. A manager.
  async deleteOnboardingResearchLine (workspaceId, line) {
    if (!line) throw new Error('line is required')
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(
        `/onboarding/workspace-research/lines/${encodeURIComponent(line)}?workspaceId=${ws}`,
        { method: 'DELETE', methodName: 'deleteOnboardingResearchLine' }
      )
    } catch (error) {
      throw withCode(error)
    }
  }

  // GET /core/onboarding/people → `{ people: [{ id, name, role, sourceUrl,
  // fetchedAt, expiresAt, invitedAt }] }` (names + job titles from the
  // company's own team page; never an e-mail).
  async listOnboardingPeople (workspaceId) {
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(`/onboarding/people?workspaceId=${ws}`, {
        method: 'GET',
        methodName: 'listOnboardingPeople'
      })
    } catch (error) {
      throw withCode(error)
    }
  }

  // DELETE /core/onboarding/people/:personId → `{ removed: true }`.
  async removeOnboardingPerson (workspaceId, personId) {
    if (!personId) throw new Error('personId is required')
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(
        `/onboarding/people/${encodeURIComponent(personId)}?workspaceId=${ws}`,
        { method: 'DELETE', methodName: 'removeOnboardingPerson' }
      )
    } catch (error) {
      throw withCode(error)
    }
  }

  // POST /core/onboarding/people/:personId/invite { email, recipientName }
  // → `{ invitation: { id, email, role }, person }`. The server sends the
  // normal workspace invitation with role `editor` and marks the row
  // (`invitedAt`). The owner types the address; 400 `invalid_email`.
  async inviteOnboardingPerson (workspaceId, personId, { email, recipientName } = {}) {
    if (!personId) throw new Error('personId is required')
    if (!email) throw new Error('email is required')
    const ws = this._onboardingWorkspace(workspaceId)
    try {
      return await this._request(
        `/onboarding/people/${encodeURIComponent(personId)}/invite?workspaceId=${ws}`,
        {
          method: 'POST',
          body: JSON.stringify({ email, ...(recipientName ? { recipientName } : {}) }),
          methodName: 'inviteOnboardingPerson'
        }
      )
    } catch (error) {
      throw withCode(error)
    }
  }
}
