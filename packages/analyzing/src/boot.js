// bootAnalyzing — the PUBLIC-MODE entry point the mermaid track stub calls.
//
// mermaid's HTMLRewriter injects `<script async src="/v1/track.js" data-…>`
// into every served tenant page (analytics_enabled gate); the stub reads its
// data-* config and dynamic-imports /v1/analyzing.mjs (this package, bundled
// by server/workers/mermaid-server/build.mjs), then calls
// `bootAnalyzing(cfg)`.
//
// HISTORY: the stub has called `bootAnalyzing` since the tracker shipped,
// but this package only exported `createAnalyzing` — the stub's
// `typeof b === 'function'` guard silently no-opped, so NO published site
// ever ingested a single visitor event (bisected live 2026-08-14 on
// bellforge--landing.dev.symbo.ls: script + bundle load, zero ingest
// POSTs, zero errors). This file is that missing seam.
//
// Scope values here are ADVISORY — mermaid re-resolves project identity
// from the request Origin on every ingest (see analytics-proxy.js), so a
// page cannot lie about which project it is.

import { createAnalyzing } from './client.js'

let _instance = null

const _pageData = () => {
  try {
    return {
      path: location.pathname + location.search,
      title: (typeof document !== 'undefined' && document.title) || undefined,
      referrer:
        (typeof document !== 'undefined' && document.referrer) || undefined
    }
  } catch {
    return {}
  }
}

export const bootAnalyzing = (cfg = {}) => {
  // Idempotent — the stub can run more than once (bfcache restores,
  // double-injection through an edge-cached + origin response).
  if (_instance) return _instance
  if (typeof window === 'undefined') return null

  const client = createAnalyzing({
    mode: 'public',
    appKey:
      cfg.projectId ||
      cfg.domain ||
      (typeof location !== 'undefined' ? location.host : 'public'),
    projectId: cfg.projectId || undefined,
    workspaceId: cfg.workspaceId || undefined,
    projectEnv: cfg.projectEnv || 'production',
    domain: cfg.domain || undefined,
    ingestUrl: cfg.ingestUrl || '/v1/analytics/ingest',
    // Visitor sessions are short — flush well before the app-mode default
    // so a bounce still lands its page_view.
    batchMs: typeof cfg.batchMs === 'number' ? cfg.batchMs : 5000
  })
  _instance = client

  // Activate the analyze state NOW. In an smbls app the analyze PLUGIN
  // calls state.activate() during create(); a plain published site has no
  // smbls app, and pre-activation emit() silently DROPS every non-error
  // event — the tracker would capture nothing forever. Activation also
  // attaches the browser error/visibility listeners, which is exactly
  // what a visitor tracker wants.
  try {
    if (typeof client.state?.activate === 'function')
      client.state.activate(null)
  } catch {}

  // Initial page view.
  try {
    client.capture('info', 'page_view', _pageData())
  } catch {}

  // SPA navigations — history API is the only signal a static tracker gets.
  // Standard tracker practice: wrap pushState/replaceState + listen to
  // popstate; capture a lightweight page_view per route change.
  try {
    const fire = () => {
      try {
        client.capture('info', 'page_view', _pageData())
      } catch {}
    }
    const wrap = (name) => {
      const orig = history[name]
      if (typeof orig !== 'function' || orig.__analyzingWrapped) return
      const wrapped = function (...args) {
        const out = orig.apply(this, args)
        fire()
        return out
      }
      wrapped.__analyzingWrapped = true
      history[name] = wrapped
    }
    wrap('pushState')
    wrap('replaceState')
    window.addEventListener('popstate', fire)
  } catch {}

  // Terminal flush — the public transport POSTs with `keepalive: true`, so
  // a flush kicked at pagehide survives the unload for sub-64KB batches.
  try {
    window.addEventListener('pagehide', () => {
      try {
        client.flush()
      } catch {}
    })
  } catch {}

  return client
}

// Test seam.
export const _resetBootForTests = () => {
  _instance = null
}
