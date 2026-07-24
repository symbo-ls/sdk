import { BaseService } from './BaseService.js'

// ExamService wraps the main server's /core/exams/* routes (Mongo-backed) —
// the ICCA ISO/IEC 17024 certification exam platform (SPEC_legacy.md P1
// port). One service, many workspace-scoped sub-resources — the same
// collapsed-domain shape DocService uses for documents/kbArticles/notes/
// userDocs and TicketService uses for columns/comments/release/cycle.
//
// Reconciled 2026-07-24 against EXAMS_SERVER_CONTRACT.md — the SERVER is
// authoritative; every path/verb/body/filter below matches that document,
// not the original SPEC_legacy.md guess. Notable corrections from the
// first pass: `projectCategories`/`projectMistakes` are URL-nested under
// `/projects/:projectId/...` (not flat collections); `chapterQuotas` is
// URL-nested under `/exam-profiles/:profileId/...`; there is no dedicated
// project-activate route (`activateProject` PATCHes `isActive: true`);
// candidate registration rpcs are `/approve-registration` /
// `/reject-registration`; exam config mounts at `/exam-config` (not
// `/config`); the candidate-vs-staff projection on `questions`/`projects`
// (stripping `isCorrect`/`isViolation`) is 100% SERVER-DERIVED from the
// caller's own workspace role — there is no client-supplied "give me the
// candidate view" flag, so no `forCandidate` param exists on this surface.
//
// Workspace-scoped server-side (claim fallback; explicit `workspaceId`
// threaded as a query param via the shared `_qs` helper on every verb,
// mirroring InteractionService/PartyService/CompanyProfileService — the
// same services this domain's controllers are modeled on).
//
// CRUD sub-resource groups (`specializations`, `chapters`, `questions`,
// `projects`, `examProfiles`, `sessions`, `candidates`) all expose the
// uniform `{list(filter,opts), get(id,opts), create(payload,opts),
// update(id,payload,opts), remove(id,opts)}` shape. Reads of
// `specializations`/`chapters`/`examProfiles` (incl. `chapterQuotas`) are
// member-gated, writes manager-gated; `questions`/`projects`/`sessions`
// CRUD is editor-gated for writes; `candidates`/`eligibility`/`documents`
// have per-route gates — see EXAMS_SERVER_CONTRACT.md §3 for the exact
// table. `specializations.remove` soft-retires (`deactivatedAt`); nothing
// else in this P1 slice is a soft-delete (chapters/projects/exam-profiles/
// sessions/candidates/eligibility/documents `remove` are real deletes,
// some cascading — see §3 per-entity notes).
//
// `projectCategories` / `projectMistakes` (nested under a project) and
// `chapterQuotas` (nested under an exam profile) are NOT flat top-level
// collections — every method takes the parent id as its FIRST positional
// argument and builds the nested URL. None of the three expose a singular
// `get(id)` — the server has no route for it (list/create/update/remove
// only).
//
// RPC-shaped ops that don't fit the CRUD pentad are exposed FLAT on the
// service (not nested under a group) — `activateProject` (delegates to
// `projects.update` — no dedicated route exists), the session-seat
// lifecycle (`listSessionCandidates`/`addSessionCandidate`/
// `removeSessionCandidate`/`signProtocol`/`authorizeSeat`/`markNoShow`),
// registration review (`approveRegistration`/`rejectRegistration`), the
// `eligibility` list/get/grant/revoke quartet (no `update` — a grant is
// immutable), the `documents` (candidate identity/eligibility docs —
// distinct from the general-purpose sdk.docs surface) list/get/create/
// update/remove/review sextet, and the `examConfig` workspace singleton
// (`getExamConfig`/`updateExamConfig`, mirrors the `companyProfile`
// get/update shape). `questions.submit`/`questions.approve` stay NESTED in
// the `questions` group since the server groups them with the question
// CRUD lifecycle (DRAFT→PENDING→APPROVED).
//
// Exam-taking + scoring + attempts (generateExam/saveAnswer/
// saveProjectMistakes/finishExam), results/history/reports/exports,
// appeals, and the audit log are model-only on the server in this P1 build
// — no store/controller/route exists yet, so they are NOT wrapped here.
// See EXAMS_SDK_CONTRACT.md for the full surface + scope note.

const _qs = (workspaceId, extra) => {
  const params = new URLSearchParams(extra || undefined)
  if (workspaceId) params.set('workspaceId', String(workspaceId))
  const s = params.toString()
  return s ? `?${s}` : ''
}

export class ExamService extends BaseService {
  // ==================== SPECIALIZATIONS ====================
  // GET/POST /exams/specializations, GET/PATCH/DELETE /exams/specializations/:id
  // reads: member. writes: manager. remove = soft-retire (sets
  // deactivatedAt, idempotent) — send `deactivatedAt: null` via update to
  // reactivate.
  specializations = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.includeInactive ?? options.includeInactive) extra.includeInactive = 'true'
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.specializations.list', `/exams/specializations${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.specializations.get', `/exams/specializations/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.specializations.create', `/exams/specializations${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.specializations.update', `/exams/specializations/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.specializations.remove', `/exams/specializations/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== CHAPTERS ====================
  // GET/POST /exams/chapters, GET/PATCH/DELETE /exams/chapters/:id
  // reads: member. writes: manager. remove is a hard delete — 409
  // `chapter_in_use` server-side if any question still references it.
  chapters = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.specializationId) extra.specializationId = filter.specializationId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.chapters.list', `/exams/chapters${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.chapters.get', `/exams/chapters/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.chapters.create', `/exams/chapters${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.chapters.update', `/exams/chapters/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.chapters.remove', `/exams/chapters/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== QUESTIONS ====================
  // GET/POST /exams/questions, GET/PATCH/DELETE /exams/questions/:id,
  // POST /exams/questions/:id/submit, POST /exams/questions/:id/approve.
  // reads: member. create/update/remove/submit: editor. approve: manager.
  //
  // `answers[].isCorrect` is stripped from every read for candidate-
  // equivalent callers — this is SERVER-DERIVED from the caller's own
  // workspace role (`req.workspaceScope.role`), never a client-supplied
  // flag. There is no query param to request one shape or the other.
  //
  // Versioning: `update()` on a currently-APPROVED question does NOT edit
  // that row — it archives it and inserts a new `version + 1` DRAFT row
  // (same `questionGroupId`); the resolved promise's `id` will differ from
  // the `id` you called with. Non-APPROVED statuses update in place.
  questions = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.chapterId) extra.chapterId = filter.chapterId
      if (filter.status) extra.status = filter.status
      if (filter.questionGroupId) extra.questionGroupId = filter.questionGroupId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.questions.list', `/exams/questions${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.questions.get', `/exams/questions/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    // payload: { chapterId, content, imageUrl?, isActive?, answers: [{content, isCorrect}] }
    // (>=2 answers, exactly one isCorrect:true) — created DRAFT, version 1.
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.questions.create', `/exams/questions${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.questions.update', `/exams/questions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    // 409 question_not_deletable if status is APPROVED or ARCHIVED.
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.questions.remove', `/exams/questions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      }),
    // DRAFT|REJECTED → PENDING. No body.
    submit: (id, { workspaceId } = {}) =>
      this._call('exams.questions.submit', `/exams/questions/${encodeURIComponent(id)}/submit${_qs(workspaceId)}`, {
        method: 'POST'
      }),
    // PENDING → APPROVED (manager-only). No body.
    approve: (id, { workspaceId } = {}) =>
      this._call('exams.questions.approve', `/exams/questions/${encodeURIComponent(id)}/approve${_qs(workspaceId)}`, {
        method: 'POST'
      })
  }

  // ==================== PROJECTS (practical) ====================
  // GET/POST /exams/projects, GET/PATCH/DELETE /exams/projects/:id.
  // reads: member. writes: editor. remove cascade-deletes its categories +
  // mistakes.
  //
  // `mistakes[].isViolation`/`.explanation` are stripped from the nested
  // read for candidate-equivalent callers — same server-derived rule as
  // questions, no client flag.
  projects = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.specializationId) extra.specializationId = filter.specializationId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.projects.list', `/exams/projects${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.projects.get', `/exams/projects/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    // payload: { specializationId, title, description?, fileUrl?, isActive?,
    // interactionMode?('checklist'|'click'), practicalDurationMinutes? } —
    // `isActive: true` always 409s project_not_activatable at create time
    // (a brand-new project has zero mistakes yet).
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.projects.create', `/exams/projects${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    // Any write that would leave isActive:true is gated 409
    // project_not_activatable unless >=1 mistake with isViolation:true
    // exists for this project.
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.projects.update', `/exams/projects/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.projects.remove', `/exams/projects/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // No dedicated /activate route exists server-side — activation is just
  // PATCH /exams/projects/:id with { isActive: true }; the store enforces
  // the >=1-real-violation gate (409 project_not_activatable otherwise).
  // Delegates to projects.update so there's exactly one place building the
  // /projects/:id URL.
  activateProject (id, opts = {}) {
    return this.projects.update(id, { isActive: true }, opts)
  }

  // ==================== PROJECT CATEGORIES ====================
  // URL-NESTED under the parent project — every method takes `projectId`
  // as its first positional argument. No singular `get(id)` — the server
  // exposes list/create/update/remove only.
  // GET/POST /exams/projects/:projectId/categories,
  // PATCH/DELETE /exams/projects/:projectId/categories/:id.
  // reads: member. writes: editor. remove unlinks (does not delete) its
  // mistakes.
  projectCategories = {
    list: (projectId, options = {}) =>
      this._call(
        'exams.projectCategories.list',
        `/exams/projects/${encodeURIComponent(projectId)}/categories${_qs(options.workspaceId)}`
      ),
    // payload: { title, displayOrder? }
    create: (projectId, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.projectCategories.create',
        `/exams/projects/${encodeURIComponent(projectId)}/categories${_qs(workspaceId)}`,
        { method: 'POST', body: payload }
      ),
    update: (projectId, id, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.projectCategories.update',
        `/exams/projects/${encodeURIComponent(projectId)}/categories/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'PATCH', body: payload }
      ),
    remove: (projectId, id, { workspaceId } = {}) =>
      this._call(
        'exams.projectCategories.remove',
        `/exams/projects/${encodeURIComponent(projectId)}/categories/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'DELETE' }
      )
  }

  // ==================== PROJECT MISTAKES (checklist items) ====================
  // Same URL-nested-under-projectId shape as projectCategories, no
  // singular `get(id)`. `isViolation` (real violation vs. distractor)
  // lives here — NEVER sent to candidate-equivalent callers (server-
  // derived, see `projects` header above).
  // GET/POST /exams/projects/:projectId/mistakes,
  // PATCH/DELETE /exams/projects/:projectId/mistakes/:id.
  // reads: member (candidate-strip applies). writes: editor.
  projectMistakes = {
    list: (projectId, options = {}) =>
      this._call(
        'exams.projectMistakes.list',
        `/exams/projects/${encodeURIComponent(projectId)}/mistakes${_qs(options.workspaceId)}`
      ),
    // payload: { description, explanation?, penaltyPoints?, isViolation?,
    // categoryId? } — categoryId, if given, must belong to the same project.
    create: (projectId, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.projectMistakes.create',
        `/exams/projects/${encodeURIComponent(projectId)}/mistakes${_qs(workspaceId)}`,
        { method: 'POST', body: payload }
      ),
    update: (projectId, id, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.projectMistakes.update',
        `/exams/projects/${encodeURIComponent(projectId)}/mistakes/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'PATCH', body: payload }
      ),
    remove: (projectId, id, { workspaceId } = {}) =>
      this._call(
        'exams.projectMistakes.remove',
        `/exams/projects/${encodeURIComponent(projectId)}/mistakes/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'DELETE' }
      )
  }

  // ==================== EXAM PROFILES ====================
  // The config heart — questionCount, passingScore, durationMinutes,
  // verdictMode, mcqPassMode, aggregationMode, blend weights, per-profile
  // attempt/overlap/grace controls. Regulation lock enforced server-side
  // on create/update (409 regulation_lock_violated).
  // GET/POST /exams/exam-profiles, GET/PATCH/DELETE /exams/exam-profiles/:id
  // reads: member. writes: manager. remove cascade-deletes its chapter
  // quotas.
  examProfiles = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.specializationId) extra.specializationId = filter.specializationId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.examProfiles.list', `/exams/exam-profiles${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.examProfiles.get', `/exams/exam-profiles/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.examProfiles.create', `/exams/exam-profiles${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.examProfiles.update', `/exams/exam-profiles/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.examProfiles.remove', `/exams/exam-profiles/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // ==================== CHAPTER QUOTAS ====================
  // URL-NESTED under the parent exam profile — every method takes
  // `profileId` as its first positional argument. No singular `get(id)`.
  // GET/POST /exams/exam-profiles/:profileId/chapter-quotas,
  // PATCH/DELETE /exams/exam-profiles/:profileId/chapter-quotas/:id.
  // reads: member. writes: manager.
  chapterQuotas = {
    list: (profileId, options = {}) =>
      this._call(
        'exams.chapterQuotas.list',
        `/exams/exam-profiles/${encodeURIComponent(profileId)}/chapter-quotas${_qs(options.workspaceId)}`
      ),
    // payload: { chapterId, questionCount } — 409 conflict if the chapter
    // already has a quota on this profile.
    create: (profileId, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.chapterQuotas.create',
        `/exams/exam-profiles/${encodeURIComponent(profileId)}/chapter-quotas${_qs(workspaceId)}`,
        { method: 'POST', body: payload }
      ),
    update: (profileId, id, payload = {}, { workspaceId } = {}) =>
      this._call(
        'exams.chapterQuotas.update',
        `/exams/exam-profiles/${encodeURIComponent(profileId)}/chapter-quotas/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'PATCH', body: payload }
      ),
    remove: (profileId, id, { workspaceId } = {}) =>
      this._call(
        'exams.chapterQuotas.remove',
        `/exams/exam-profiles/${encodeURIComponent(profileId)}/chapter-quotas/${encodeURIComponent(id)}${_qs(workspaceId)}`,
        { method: 'DELETE' }
      )
  }

  // ==================== SESSIONS ====================
  // GET/POST /exams/sessions, GET/PATCH/DELETE /exams/sessions/:id.
  // reads: member. writes: editor. remove cascade-deletes its seats.
  // Seat lifecycle (list/add/remove a candidate, sign, authorize, no-show)
  // is exposed as FLAT methods below — mirrors PartyService's
  // addRole/removeRole convention for a parent-id-scoped sub-resource.
  // Seats are addressed by `candidateId` (an ExamCandidate id), not the
  // seat row's own `_id`.
  sessions = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.examProfileId) extra.examProfileId = filter.examProfileId
      if (filter.examinerId) extra.examinerId = filter.examinerId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.sessions.list', `/exams/sessions${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.sessions.get', `/exams/sessions/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    // payload: { examinerId?, examProfileId, scheduledTime, location?,
    // maxCandidates? } — examinerId defaults to the caller when omitted.
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.sessions.create', `/exams/sessions${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.sessions.update', `/exams/sessions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.sessions.remove', `/exams/sessions/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // GET /exams/sessions/:sessionId/candidates?workspaceId= (member) — list
  // seats (roster).
  listSessionCandidates (sessionId, { workspaceId } = {}) {
    return this._call(
      'exams.listSessionCandidates',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates${_qs(workspaceId)}`
    )
  }

  // POST /exams/sessions/:sessionId/candidates?workspaceId= (editor).
  // payload: { candidateId, candidateNumber }. Errors: 404 not_found
  // (candidate), 409 session_full, 409 conflict (seat/candidateNumber
  // already taken in this session).
  addSessionCandidate (sessionId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'exams.addSessionCandidate',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  // DELETE /exams/sessions/:sessionId/candidates/:candidateId?workspaceId=
  // (editor — frees the seat).
  removeSessionCandidate (sessionId, candidateId, { workspaceId } = {}) {
    return this._call(
      'exams.removeSessionCandidate',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}${_qs(workspaceId)}`,
      { method: 'DELETE' }
    )
  }

  // POST .../candidates/:candidateId/sign?workspaceId= (member — the
  // candidate's own action). No body.
  signProtocol (sessionId, candidateId, { workspaceId } = {}) {
    return this._call(
      'exams.signProtocol',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/sign${_qs(workspaceId)}`,
      { method: 'POST' }
    )
  }

  // POST .../candidates/:candidateId/authorize?workspaceId= (editor).
  // Requires identityVerified:true. Errors: 409 protocol_not_signed (seat
  // isProtocolSigned isn't true yet), 409 identity_not_verified.
  authorizeSeat (sessionId, candidateId, payload = { identityVerified: true }, { workspaceId } = {}) {
    return this._call(
      'exams.authorizeSeat',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/authorize${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  // POST .../candidates/:candidateId/no-show?workspaceId= (editor). No
  // body — stamps noShowAt. 409 already_authorized if startStatus is
  // already AUTHORIZED.
  markNoShow (sessionId, candidateId, { workspaceId } = {}) {
    return this._call(
      'exams.markNoShow',
      `/exams/sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(candidateId)}/no-show${_qs(workspaceId)}`,
      { method: 'POST' }
    )
  }

  // ==================== CANDIDATES ====================
  // GET/POST /exams/candidates, GET/PATCH/DELETE /exams/candidates/:id.
  // reads/create/update: member. remove: manager.
  // The registration-review pair is exposed FLAT below — filter the
  // self-registration queue via `candidates.list({ pendingApproval: true })`
  // rather than a dedicated endpoint.
  candidates = {
    list: (filter = {}, options = {}) => {
      const extra = {}
      if (filter.pendingApproval !== undefined) extra.pendingApproval = String(filter.pendingApproval)
      if (filter.specializationId) extra.specializationId = filter.specializationId
      const ws = filter.workspaceId || options.workspaceId
      return this._call('exams.candidates.list', `/exams/candidates${_qs(ws, extra)}`)
    },
    get: (id, { workspaceId } = {}) =>
      this._call('exams.candidates.get', `/exams/candidates/${encodeURIComponent(id)}${_qs(workspaceId)}`),
    // payload: { userId?, personalId, fullName, email, phone?,
    // pendingApprovalAt?, requestedSpecializationId? } — pendingApprovalAt
    // defaults to now when omitted; pass null explicitly for a pre-approved
    // staff-created candidate.
    create: (payload = {}, { workspaceId } = {}) =>
      this._call('exams.candidates.create', `/exams/candidates${_qs(workspaceId)}`, {
        method: 'POST',
        body: payload
      }),
    update: (id, payload = {}, { workspaceId } = {}) =>
      this._call('exams.candidates.update', `/exams/candidates/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'PATCH',
        body: payload
      }),
    remove: (id, { workspaceId } = {}) =>
      this._call('exams.candidates.remove', `/exams/candidates/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
        method: 'DELETE'
      })
  }

  // POST /exams/candidates/:id/approve-registration?workspaceId= (manager).
  // One Mongo transaction: clears pendingApprovalAt, and upserts an
  // ExamEligibility grant when requestedSpecializationId was set. 409
  // not_pending if pendingApprovalAt is already null. No body.
  approveRegistration (id, { workspaceId } = {}) {
    return this._call(
      'exams.approveRegistration',
      `/exams/candidates/${encodeURIComponent(id)}/approve-registration${_qs(workspaceId)}`,
      { method: 'POST' }
    )
  }

  // POST /exams/candidates/:id/reject-registration?workspaceId= (manager).
  // reason required (400 otherwise), 409 not_pending if not pending.
  // Clears pendingApprovalAt, stamps rejectedAt + rejectionReason.
  rejectRegistration (id, reason, { workspaceId } = {}) {
    return this._call(
      'exams.rejectRegistration',
      `/exams/candidates/${encodeURIComponent(id)}/reject-registration${_qs(workspaceId)}`,
      { method: 'POST', body: { reason } }
    )
  }

  // ==================== ELIGIBILITY ====================
  // ExamEligibility — explicit join, absence = not eligible (fail-closed).
  // No `update` — a grant is immutable, revoke + re-grant instead.
  // reads: member. create/remove: manager.

  // GET /exams/eligibility?workspaceId=&userId=&candidateId=&specializationId=
  listEligibility (filter = {}, options = {}) {
    const extra = {}
    if (filter.userId) extra.userId = filter.userId
    if (filter.candidateId) extra.candidateId = filter.candidateId
    if (filter.specializationId) extra.specializationId = filter.specializationId
    const ws = filter.workspaceId || options.workspaceId
    return this._call('exams.listEligibility', `/exams/eligibility${_qs(ws, extra)}`)
  }

  // GET /exams/eligibility/:id?workspaceId=
  getEligibility (id, { workspaceId } = {}) {
    return this._call('exams.getEligibility', `/exams/eligibility/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /exams/eligibility?workspaceId= (manager). payload: exactly one of
  // { userId } / { candidateId }, plus { specializationId } (400 bad_request
  // if zero or both userId/candidateId given). 409 conflict if that
  // (subject, specialization) pair is already granted.
  grantEligibility (payload = {}, { workspaceId } = {}) {
    return this._call('exams.grantEligibility', `/exams/eligibility${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // DELETE /exams/eligibility/:id?workspaceId= (manager). `id` is the
  // ExamEligibility row's own id (returned by listEligibility /
  // getEligibility / grantEligibility) — not a compound key.
  revokeEligibility (id, { workspaceId } = {}) {
    return this._call('exams.revokeEligibility', `/exams/eligibility/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // ==================== DOCUMENTS ====================
  // Candidate identity/eligibility documents (DIPLOMA | EXPERIENCE |
  // ID_CARD | PHOTO) — distinct from the general-purpose sdk.docs surface.
  // Unique per (candidateId, docType) — `create` upserts by that pair
  // rather than 409ing (re-submitting resets status to PENDING and clears
  // any rejectionReason). reads/create/update: member. remove/review:
  // manager.

  // GET /exams/documents?workspaceId=&candidateId=&status=&docType=
  listDocuments (filter = {}, options = {}) {
    const extra = {}
    if (filter.candidateId) extra.candidateId = filter.candidateId
    if (filter.status) extra.status = filter.status
    if (filter.docType) extra.docType = filter.docType
    const ws = filter.workspaceId || options.workspaceId
    return this._call('exams.listDocuments', `/exams/documents${_qs(ws, extra)}`)
  }

  // GET /exams/documents/:id?workspaceId=
  getDocument (id, { workspaceId } = {}) {
    return this._call('exams.getDocument', `/exams/documents/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  // POST /exams/documents?workspaceId= (member — self-upload or admin
  // on-behalf). Create/upsert by (candidateId, docType).
  // payload: { candidateId, docType, documentUrl } — the server stores a
  // URL, not raw file bytes; upload the file itself via a generic file
  // service first (e.g. sdk.getService('file').upload(...)) to obtain
  // documentUrl before calling this.
  createDocument (payload = {}, { workspaceId } = {}) {
    return this._call('exams.createDocument', `/exams/documents${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  // PATCH /exams/documents/:id?workspaceId= (member). Re-upload —
  // { documentUrl } only, resets status to PENDING and clears any
  // rejectionReason server-side.
  updateDocument (id, payload = {}, { workspaceId } = {}) {
    return this._call('exams.updateDocument', `/exams/documents/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // DELETE /exams/documents/:id?workspaceId= (manager).
  removeDocument (id, { workspaceId } = {}) {
    return this._call('exams.removeDocument', `/exams/documents/${encodeURIComponent(id)}${_qs(workspaceId)}`, {
      method: 'DELETE'
    })
  }

  // POST /exams/documents/:id/review?workspaceId= (manager). status:
  // 'APPROVED' | 'REJECTED' | 'RETURNED'; rejectionReason required (400
  // otherwise) when status is 'REJECTED' or 'RETURNED'.
  reviewDocument (id, { status, rejectionReason } = {}, { workspaceId } = {}) {
    return this._call('exams.reviewDocument', `/exams/documents/${encodeURIComponent(id)}/review${_qs(workspaceId)}`, {
      method: 'POST',
      body: { status, rejectionReason }
    })
  }

  // ==================== EXAM CONFIG (workspace singleton) ====================
  // Global exam-engine config — mirrors the companyProfile get/update
  // singleton shape (no id, no list/create/remove). Manager-gated on both
  // verbs. GET returns `data: null` when never configured.
  // GET /exams/exam-config?workspaceId=
  getExamConfig ({ workspaceId } = {}) {
    return this._call('exams.getExamConfig', `/exams/exam-config${_qs(workspaceId)}`)
  }

  // PATCH /exams/exam-config?workspaceId= (upserts the singleton).
  // payload: { maxAttemptsPerCandidate?, singleSessionMode?
  //            ('all'|'candidatesOnly'|'off'), loginMaxFailuresPerAccount?,
  //            loginMaxFailuresPerIp?, loginWindowMinutes? }
  updateExamConfig (payload = {}, { workspaceId } = {}) {
    return this._call('exams.updateExamConfig', `/exams/exam-config${_qs(workspaceId)}`, {
      method: 'PATCH',
      body: payload
    })
  }

  // ==================== ATTEMPTS (candidate exam engine — P2) ====================
  // Candidate-scoped: the server resolves the caller to their own ExamCandidate;
  // payloads are candidate-safe (no isCorrect/isViolation).
  examLobby ({ workspaceId } = {}) {
    return this._call('exams.examLobby', `/exams/attempts/lobby${_qs(workspaceId)}`)
  }

  activeAttempt ({ workspaceId } = {}) {
    return this._call('exams.activeAttempt', `/exams/attempts/active${_qs(workspaceId)}`)
  }

  generateAttempt (payload = {}, { workspaceId } = {}) {
    return this._call('exams.generateAttempt', `/exams/attempts/generate${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  getAttempt (id, { workspaceId } = {}) {
    return this._call('exams.getAttempt', `/exams/attempts/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  saveAnswer (attemptId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'exams.saveAnswer',
      `/exams/attempts/${encodeURIComponent(attemptId)}/answers${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  saveProjectMarks (attemptId, payload = {}, { workspaceId } = {}) {
    return this._call(
      'exams.saveProjectMarks',
      `/exams/attempts/${encodeURIComponent(attemptId)}/project-mistakes${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  finishAttempt (attemptId, { workspaceId } = {}) {
    return this._call(
      'exams.finishAttempt',
      `/exams/attempts/${encodeURIComponent(attemptId)}/finish${_qs(workspaceId)}`,
      { method: 'POST' }
    )
  }

  registerForSession (sessionId, { workspaceId } = {}) {
    return this._call(
      'exams.registerForSession',
      `/exams/sessions/${encodeURIComponent(sessionId)}/register${_qs(workspaceId)}`,
      { method: 'POST' }
    )
  }

  // ==================== REPORTS / APPEALS / AUDIT / ANALYTICS (P4) ==========
  // Attempt reports + history. `attemptHistory` is the candidate's own finished
  // attempts (member); `listAttempts` is the admin/examiner report surface
  // (editor) filtered by candidateId/sessionId/examProfileId. Result payloads
  // carry the EFFECTIVE verdict (server-resolved override) — never the answer key.
  attemptHistory ({ workspaceId } = {}) {
    return this._call('exams.attemptHistory', `/exams/attempts/history${_qs(workspaceId)}`)
  }

  listAttempts (filter = {}, { workspaceId } = {}) {
    const extra = {}
    if (filter.candidateId) extra.candidateId = String(filter.candidateId)
    if (filter.sessionId) extra.sessionId = String(filter.sessionId)
    if (filter.examProfileId) extra.examProfileId = String(filter.examProfileId)
    const ws = filter.workspaceId || workspaceId
    return this._call('exams.listAttempts', `/exams/attempts${_qs(ws, extra)}`)
  }

  // Appeals — file on own finished attempt (member); list/get/review are
  // manager (commission). `reviewAppeal` body: { decisionNotes, verdictOverride }.
  fileAppeal (payload = {}, { workspaceId } = {}) {
    return this._call('exams.fileAppeal', `/exams/appeals${_qs(workspaceId)}`, {
      method: 'POST',
      body: payload
    })
  }

  listAppeals (filter = {}, { workspaceId } = {}) {
    const extra = {}
    if (filter.status) extra.status = String(filter.status)
    const ws = filter.workspaceId || workspaceId
    return this._call('exams.listAppeals', `/exams/appeals${_qs(ws, extra)}`)
  }

  getAppeal (id, { workspaceId } = {}) {
    return this._call('exams.getAppeal', `/exams/appeals/${encodeURIComponent(id)}${_qs(workspaceId)}`)
  }

  reviewAppeal (id, payload = {}, { workspaceId } = {}) {
    return this._call(
      'exams.reviewAppeal',
      `/exams/appeals/${encodeURIComponent(id)}/review${_qs(workspaceId)}`,
      { method: 'POST', body: payload }
    )
  }

  // Audit log — manager read-only over the append-only hash-chained trail.
  // `listAudit` filter: tableName/recordId/limit; `verifyAudit` recomputes chain.
  listAudit (filter = {}, { workspaceId } = {}) {
    const extra = {}
    if (filter.tableName) extra.tableName = String(filter.tableName)
    if (filter.recordId) extra.recordId = String(filter.recordId)
    if (filter.limit) extra.limit = String(filter.limit)
    const ws = filter.workspaceId || workspaceId
    return this._call('exams.listAudit', `/exams/audit${_qs(ws, extra)}`)
  }

  verifyAudit ({ workspaceId } = {}) {
    return this._call('exams.verifyAudit', `/exams/audit/verify${_qs(workspaceId)}`)
  }

  // Analytics — manager dashboard summary (KPIs, per-specialization, monthly).
  examAnalytics ({ workspaceId } = {}) {
    return this._call('exams.examAnalytics', `/exams/analytics${_qs(workspaceId)}`)
  }

  // Whoami — caller's resolved exam role ('Admin' | 'Examiner' | 'Candidate')
  // from their workspace membership; the trusted source for client role gating.
  whoami ({ workspaceId } = {}) {
    return this._call('exams.whoami', `/exams/whoami${_qs(workspaceId)}`)
  }
}

export const createExamService = config => new ExamService(config)
