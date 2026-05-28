// Supabase auth federation: one user credentials → N Supabase sessions.
// Each project's symbols-auth-bridge edge function independently verifies
// credentials against the Symbols server and mints its own session.
// The client calls every enabled bridge in parallel.
//
// Two-phase login:
//   Phase 1 — required projects. All run in parallel; all must succeed.
//             Returns merged claims.
//   Phase 2 — optional extensions. Each extension's shouldActivate(claims)
//             predicate decides whether to fire its bridge. Skipped
//             extensions are reported with status:'not-applicable' so
//             the UI can distinguish "didn't try" from "failed".

const BRIDGE_TIMEOUT_MS = 15000

const projectResult = (key, status, data = null, error = null) => ({
  key, status, data, error
})

const callBridge = async (cfg, body, signal) => {
  const res = await fetch(cfg.bridgeUrl, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`
    },
    body: JSON.stringify(body)
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.supabase?.accessToken) {
    const message = json?.error || `bridge ${cfg.key} returned ${res.status}`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return json
}

// Factory — binds the federation registry + app config to a set of
// login/logout/switch operations. Consumer wires this once at boot:
//
//   const auth = createAuthBridge({ registry, appConfig })
//   await auth.loginAll({ email, password })
//
// `registry` is the createRegistry() return; `appConfig` is the
// createAppConfig() return (both from @symbo.ls/sdk-bridge /
// @symbo.ls/sdk-supabase-bridge).
//
// `tokenStorageKey` / `tokenExpiryKey` override the localStorage keys
// where the Symbols access token is stashed — defaults are
// `symbols_bridge_access_token` / `symbols_bridge_expires_at` for
// backwards compat with the original sdk-bridge.
export function createAuthBridge ({
  registry,
  appConfig,
  tokenStorageKey = 'symbols_bridge_access_token',
  tokenExpiryKey = 'symbols_bridge_expires_at',
  fallbackTokenKey = 'symbols_access_token',
  bridgeTimeoutMs = BRIDGE_TIMEOUT_MS
} = {}) {
  if (!registry) throw new Error('createAuthBridge: registry required')
  if (!appConfig) throw new Error('createAuthBridge: appConfig required')

  const _setSession = async (r) => {
    const client = registry.getClient(r.key)
    const s = r.data?.supabase
    if (!client || !s) return
    try {
      await client.auth.setSession({
        access_token: s.accessToken,
        refresh_token: s.refreshToken
      })
    } catch (err) {
      console.error(`[sdk-supabase-bridge] setSession failed on ${r.key}:`, err)
      r.status = 'error'
      r.error = err
    }
    const symbolsToken = r.data?.symbols?.tokens?.accessToken
    if (symbolsToken && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(tokenStorageKey, symbolsToken)
        const exp = r.data?.symbols?.tokens?.expiresAt
        if (exp) window.localStorage.setItem(tokenExpiryKey, String(exp))
      } catch {}
    }
  }

  // Federation entry point. Two auth modes:
  //   - email+password: primary signin path (Symbols server's
  //     `/auth/login` verifies credentials, returns full session).
  //   - symbolsAccessToken: OAuth fan-out path (Symbols server's
  //     `/auth/me` validates the token + returns the same user
  //     payload). Either mode flows through the same Edge Function
  //     (`symbols-auth-bridge`) and ends with a Supabase session
  //     whose `app_metadata` carries the federated claims.
  // Pre-existing `email+password` callers keep working unchanged;
  // OAuth callers pass `{symbolsAccessToken}` instead.
  const loginAll = async ({ email, password, symbolsAccessToken, claimsHint } = {}) => {
    const keys = registry.listConfiguredProjects()
    const app = appConfig.get()
    const requiredSet = new Set(
      app.required != null
        ? app.required.filter((k) => keys.includes(k))
        : keys.filter((k) => registry.getProjectConfig(k)?.required)
    )
    const requiredKeys = keys.filter((k) => requiredSet.has(k))
    const extensionKeys = keys.filter((k) => !requiredSet.has(k))

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), bridgeTimeoutMs)

    const requiredSettled = await Promise.allSettled(
      requiredKeys.map(async (key) => {
        const cfg = registry.getProjectConfig(key)
        try {
          const data = await callBridge(cfg, symbolsAccessToken ? { symbols_access_token: symbolsAccessToken } : { email, password }, ac.signal)
          return projectResult(key, 'ok', data)
        } catch (err) {
          return projectResult(key, 'error', null, err)
        }
      })
    )
    const requiredResults = requiredSettled.map((s, i) =>
      s.status === 'fulfilled' ? s.value : projectResult(requiredKeys[i], 'error', null, s.reason)
    )
    for (const r of requiredResults) {
      if (r.status !== 'ok') {
        clearTimeout(timer)
        return { ok: false, results: requiredResults, error: r.error || new Error(`required project ${r.key} failed`) }
      }
    }

    const mergedClaims = requiredResults.reduce(
      (acc, r) => ({ ...acc, ...(r.data?.claims || {}) }),
      claimsHint ? { ...claimsHint } : {}
    )

    await Promise.all(requiredResults.map((r) => _setSession(r)))

    // _setSession may have downgraded a required project's status to 'error'
    // (e.g. supabase-js rejected setSession). Abort the login so callers
    // never observe ok:true for a partial session.
    const setSessionFailure = requiredResults.find((r) => r.status !== 'ok')
    if (setSessionFailure) {
      clearTimeout(timer)
      return {
        ok: false,
        results: requiredResults,
        error: setSessionFailure.error || new Error(`required project ${setSessionFailure.key} setSession failed`)
      }
    }

    const optionalFilter = app.optional != null ? new Set(app.optional) : null
    const extensionResults = await Promise.all(
      extensionKeys.map(async (key) => {
        if (optionalFilter && !optionalFilter.has(key)) {
          return projectResult(key, 'not-configured')
        }
        const cfg = registry.getProjectConfig(key)
        let applicable = true
        try { applicable = !!cfg.shouldActivate(mergedClaims) } catch { applicable = false }
        if (!applicable) return projectResult(key, 'not-applicable')
        try {
          const data = await callBridge(cfg, symbolsAccessToken ? { symbols_access_token: symbolsAccessToken } : { email, password }, ac.signal)
          const r = projectResult(key, 'ok', data)
          await _setSession(r)
          return r
        } catch (err) {
          const skip = cfg.roleGate && err.status === 403
          return projectResult(key, skip ? 'skipped' : 'error', null, err)
        }
      })
    )

    clearTimeout(timer)

    return {
      ok: true,
      results: [...requiredResults, ...extensionResults],
      claims: mergedClaims
    }
  }

  const activateExtension = async (projectKey, { email, password, symbolsAccessToken } = {}) => {
    const cfg = registry.getProjectConfig(projectKey)
    if (!cfg) return { ok: false, error: new Error(`unknown project ${projectKey}`) }
    if (cfg.required) return { ok: false, error: new Error(`${projectKey} is required, not an extension`) }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), bridgeTimeoutMs)
    // Mirror loginAll's mode selection: explicit token arg → localStorage
    // token (persisted by a prior loginAll) → email+password. OAuth flows
    // (Google / GitHub) have no password to surrender, and the workspace
    // UI typically calls this without args after federation has already
    // set `symbols_access_token` in localStorage. Without the token
    // fallback, the bridge edge function 400s with
    // "email+password or symbols_access_token required".
    const symbolsToken = symbolsAccessToken || getSymbolsToken()
    const body = symbolsToken
      ? { symbols_access_token: symbolsToken }
      : { email, password }
    try {
      const data = await callBridge(cfg, body, ac.signal)
      const r = projectResult(projectKey, 'ok', data)
      await _setSession(r)
      return { ok: true, result: r }
    } catch (err) {
      return { ok: false, error: err }
    } finally {
      clearTimeout(timer)
    }
  }

  const logoutAll = async () => {
    const promises = []
    registry.forEachClient((client) => promises.push(client.auth.signOut().catch(() => null)))
    await Promise.all(promises)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(tokenStorageKey)
        window.localStorage.removeItem(tokenExpiryKey)
      } catch {}
    }
  }

  const postRefreshClaims = async (cfg, client, body) => {
    const { data: sess } = await client.auth.getSession()
    const jwt = sess?.session?.access_token
    if (!jwt) return { ok: false, error: new Error('no session') }
    const url = `${cfg.url}/functions/v1/symbols-refresh-claims`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${jwt}`
      },
      body: JSON.stringify(body || {})
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      // Surface the diagnostics that SERVER-FED-CLAIMS-NULL-1 added so
      // operators tracing 503s see the upstream cause (HMAC mismatch,
      // empty claims fetch, transient timeout) instead of just
      // "claims_fetch_failed". The edge fn populates these only on
      // failures where it knows more than the top-level error code.
      const parts = [json?.error || `refresh-claims ${res.status}`]
      if (json?.message) parts.push(json.message)
      if (json?.upstream_status) parts.push(`upstream_status=${json.upstream_status}`)
      if (json?.upstream_error) parts.push(`upstream_error=${json.upstream_error}`)
      if (json?.upstream_body) parts.push(`upstream_body=${String(json.upstream_body).slice(0, 200)}`)
      const err = new Error(parts.join(' — '))
      // Attach the raw payload too so callers that want structured access
      // can inspect without re-parsing the message.
      err.payload = json
      err.status = res.status
      return { ok: false, error: err }
    }
    return { ok: true, data: json }
  }

  const switchWorkspace = async (workspaceId) => {
    if (!workspaceId) throw new Error('workspaceId required')
    const keys = registry.listConfiguredProjects()
    const symbolsToken = getSymbolsToken()
    const body = symbolsToken
      ? { active_workspace_id: workspaceId, symbols_access_token: symbolsToken }
      : { active_workspace_id: workspaceId }
    const results = await Promise.all(
      keys.map(async (key) => {
        const cfg = registry.getProjectConfig(key)
        const client = registry.getClient(key)
        if (!client) return { key, status: 'skipped' }
        const resp = await postRefreshClaims(cfg, client, body)
        if (!resp.ok) {
          if (!cfg.required) return { key, status: 'skipped', error: resp.error }
          return { key, status: 'error', error: resp.error }
        }
        try { await client.auth.refreshSession() } catch (err) {
          return { key, status: 'error', error: err }
        }
        return { key, status: 'ok', data: resp.data }
      })
    )
    const failed = results.find((r) => r.status === 'error')
    if (failed) return { ok: false, results, error: failed.error }
    return { ok: true, results }
  }

  const refreshClaims = async () => {
    const keys = registry.listConfiguredProjects()
    const symbolsToken = getSymbolsToken()
    const body = symbolsToken ? { symbols_access_token: symbolsToken } : {}
    await Promise.all(
      keys.map(async (key) => {
        const cfg = registry.getProjectConfig(key)
        const client = registry.getClient(key)
        if (!client) return
        await postRefreshClaims(cfg, client, body).catch(() => null)
        try { await client.auth.refreshSession() } catch {}
      })
    )
  }

  const getSymbolsToken = () => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(tokenStorageKey)
        || window.localStorage.getItem(fallbackTokenKey)
        || null
    } catch { return null }
  }

  const getSessionStatus = async () => {
    const out = {}
    for (const key of registry.listConfiguredProjects()) {
      const client = registry.getClient(key)
      if (!client) { out[key] = { signedIn: false }; continue }
      const { data } = await client.auth.getSession()
      out[key] = {
        signedIn: !!data?.session,
        email: data?.session?.user?.email || null,
        userId: data?.session?.user?.id || null
      }
    }
    return out
  }

  return {
    loginAll,
    logoutAll,
    activateExtension,
    switchWorkspace,
    refreshClaims,
    getSymbolsToken,
    getSessionStatus
  }
}
