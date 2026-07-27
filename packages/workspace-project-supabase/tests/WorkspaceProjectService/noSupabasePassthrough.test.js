import test from 'tape'
import { WorkspaceProjectService } from '../../src/WorkspaceProjectService.js'

// The `/sb` PostgREST passthrough is GONE. This file is the lock.
//
// It existed so a workspace-tenant table could be exposed on the SDK without a
// curated server route. That convenience was the failure mode: a table joined
// in one line and then kept the proxy alive with no visible owner. file_canvas
// outlived its own /core route by three weeks that way, and nothing failed —
// which is precisely why an assertion is needed rather than a code comment.
//
// Every table it used to serve now has a real route:
//   file_canvas      → /core/file-canvas/*
//   standup_activity → /core/workspaces/:id/standups
//   activity_events  → /core/workspaces/:id/activity-log
//   user_profiles    → /core/user-profile
//
// If a future change reintroduces `_sb` / `_sbCrud`, these fail — go add a
// /core route instead.

test('the PostgREST passthrough helpers do not exist', (t) => {
  const svc = new WorkspaceProjectService()
  t.equal(typeof svc._sb, 'undefined', '_sb() is gone')
  t.equal(typeof svc._sbCrud, 'undefined', '_sbCrud() factory is gone')
  t.end()
})

// A namespace could regress by calling a passthrough URL directly rather than
// through the removed helpers, so assert on the shape of what is left too.
test('no namespace addresses a /sb REST path', (t) => {
  const svc = new WorkspaceProjectService()
  const offenders = []
  for (const key of Object.keys(svc)) {
    const ns = svc[key]
    if (!ns || typeof ns !== 'object') continue
    for (const op of Object.keys(ns)) {
      const fn = ns[op]
      if (typeof fn !== 'function') continue
      const src = Function.prototype.toString.call(fn)
      if (/\/sb\/rest\/v1|rest\/v1\//.test(src)) offenders.push(`${key}.${op}`)
    }
  }
  t.deepEqual(offenders, [], 'no namespace builds a PostgREST URL')
  t.end()
})

// userProfiles kept only the op that had a caller. list/get were dead surface
// (every apparent hit was the EntityDispatcher's own method map), and reviving
// them would mean reviving a read path with no consumer.
test('userProfiles exposes only the live op', (t) => {
  const svc = new WorkspaceProjectService()
  t.deepEqual(Object.keys(svc.userProfiles), ['update'], 'update only')
  t.end()
})
