import { BaseService } from './BaseService.js'

// McpConnectorService — /core/mcp-connectors/*. The workspace's MCP registry
// (shared/mcp/index.js) used to speak to these routes through its own
// hand-rolled `_serverFetch` (channel base + localStorage token + bare
// `{ error }` returns) — the last of the three raw-fetch leaves called out in
// tickets/server.md "Integrations remediation follow-ups #6" as blocking the
// response-envelope normalisation. This service is that consumer's SDK
// replacement: same routes, same request bodies, auth through the
// TokenManager.
//
// Every route is workspace-scoped server-side (the controller derives the
// active workspace from the caller's claims and requires membership), so no
// workspaceId parameter is threaded here — the same contract the raw reader
// relied on.
//
// Method names are the FLAT SDK names verbatim (`mcpConnectorList`, not
// `list`): _createServiceProxies looks the method up on the service BY the
// same key it exposes on the SDK, so a bare `list` here would make
// `sdk.mcpConnectorList` throw "Method not found".
//
// Response shapes are the server's own, passed through verbatim (never
// reshaped here): list → { connectors }, get/create/update → { connector }
// (+ `existed` on create), discover → { tools, … }, setStatus →
// { connector }, remove → { ok } / 204. Consumers that historically read
// those keys keep working unchanged.
export class McpConnectorService extends BaseService {
  // GET /mcp-connectors[?<query>] — every connector visible in the caller's
  // active workspace. `query` is an optional plain object of filters, folded
  // into the query string (unset/null entries are skipped).
  mcpConnectorList(query = {}) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    }
    const qs = params.toString()
    return this._call(
      'mcpConnector.list',
      `/mcp-connectors${qs ? `?${qs}` : ''}`
    )
  }

  // GET /mcp-connectors/:id
  mcpConnectorGet(connectorId) {
    if (!connectorId) throw new Error('connectorId is required')
    return this._call(
      'mcpConnector.get',
      `/mcp-connectors/${encodeURIComponent(connectorId)}`
    )
  }

  // POST /mcp-connectors — body is sent VERBATIM (the controller owns
  // validation + the natural-key upsert semantics, including `existed`).
  mcpConnectorCreate(payload = {}) {
    return this._call('mcpConnector.create', '/mcp-connectors', {
      method: 'POST',
      body: payload
    })
  }

  // PUT /mcp-connectors/:id
  mcpConnectorUpdate(connectorId, payload = {}) {
    if (!connectorId) throw new Error('connectorId is required')
    return this._call(
      'mcpConnector.update',
      `/mcp-connectors/${encodeURIComponent(connectorId)}`,
      { method: 'PUT', body: payload }
    )
  }

  // POST /mcp-connectors/:id/discover — probe the upstream MCP server and
  // refresh its cached tool list.
  mcpConnectorDiscover(connectorId, payload = {}) {
    if (!connectorId) throw new Error('connectorId is required')
    return this._call(
      'mcpConnector.discover',
      `/mcp-connectors/${encodeURIComponent(connectorId)}/discover`,
      { method: 'POST', body: payload }
    )
  }

  // PATCH /mcp-connectors/:id/status — enable/disable without a full update.
  mcpConnectorSetStatus(connectorId, payload = {}) {
    if (!connectorId) throw new Error('connectorId is required')
    return this._call(
      'mcpConnector.setStatus',
      `/mcp-connectors/${encodeURIComponent(connectorId)}/status`,
      { method: 'PATCH', body: payload }
    )
  }

  // DELETE /mcp-connectors/:id
  mcpConnectorRemove(connectorId) {
    if (!connectorId) throw new Error('connectorId is required')
    return this._call(
      'mcpConnector.remove',
      `/mcp-connectors/${encodeURIComponent(connectorId)}`,
      { method: 'DELETE' }
    )
  }
}

export const createMcpConnectorService = (config) =>
  new McpConnectorService(config)

export default McpConnectorService
