import { BaseService } from './BaseService.js'

const TERMINAL_CUSTOM_DOMAIN_STATES = new Set(['active', 'failed', 'orphaned'])

function readErrorBody (error) {
  const candidate = error?.cause?.cause ?? error?.cause ?? null
  if (candidate && typeof candidate === 'object' && !(candidate instanceof Error)) {
    return candidate
  }
  return {}
}

function wrapProjectDomainError (message, error) {
  const body = readErrorBody(error)
  const wrapped = new Error(`${message}: ${error.message}`, { cause: error })
  if (error?.status) wrapped.status = error.status
  if (body?.error) wrapped.code = body.error
  if (body && Object.keys(body).length) wrapped.body = body
  if (body?.conflicts) wrapped.conflicts = body.conflicts
  if (body?.failures) wrapped.failures = body.failures
  if (body?.operations) wrapped.operations = body.operations
  if (body?.warnings) wrapped.warnings = body.warnings
  return wrapped
}

function unwrapProjectDomainResponse (response) {
  if (!response?.success) {
    throw new Error(response?.message || response?.error || 'Project domain request failed')
  }

  const data = response.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...data,
      ...(response.warnings && !data.warnings ? { warnings: response.warnings } : {})
    }
  }
  return data
}

function findOnboardingForDomain (result, domain) {
  const target = String(domain || '').toLowerCase()
  const onboarding = Array.isArray(result?.onboarding)
    ? result.onboarding
    : Array.isArray(result?.domains?.statuses)
      ? result.domains.statuses
      : []
  return onboarding.find(entry => String(entry?.hostname || '').toLowerCase() === target) || onboarding[0] || null
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export class DnsService extends BaseService {
  // ==================== DNS METHODS ====================

  async createDnsRecord (domain, options = {}) {
    this._requireReady('createDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request('/dns/records', {
        method: 'POST',
        body: JSON.stringify({ domain, ...options }),
        methodName: 'createDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to create DNS record: ${error.message}`, { cause: error })
    }
  }

  async getDnsRecord (domain) {
    this._requireReady('getDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request(`/dns/records/${domain}`, {
        method: 'GET',
        methodName: 'getDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get DNS record: ${error.message}`, { cause: error })
    }
  }

  async getCustomHost (hostname) {
    this._requireReady('getCustomHost')
    if (!hostname) {
      throw new Error('Hostname is required')
    }
    try {
      const response = await this._request(`/dns/custom-hosts/${encodeURIComponent(hostname)}`, {
        method: 'GET',
        methodName: 'getCustomHost'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get custom host: ${error.message}`, { cause: error })
    }
  }

  async removeDnsRecord (domain) {
    this._requireReady('removeDnsRecord')
    if (!domain) {
      throw new Error('Domain is required')
    }
    try {
      const response = await this._request(`/dns/records/${domain}`, {
        method: 'DELETE',
        methodName: 'removeDnsRecord'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove DNS record: ${error.message}`, { cause: error })
    }
  }

  // customDomains could be a string or an array of strings
  async addProjectCustomDomains (projectId, customDomains, options = {}) {
    this._requireReady('addProjectCustomDomains')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (
      !customDomains ||
      (Array.isArray(customDomains) && !customDomains.length)
    ) {
      throw new Error(
        'customDomains is required and must be a non-empty string or array'
      )
    }

    const { envKey, headers } = options

    try {
      const response = await this._request(`/projects/${projectId}/domains`, {
        method: 'PATCH',
        body: JSON.stringify({
          customDomains,
          ...(envKey ? { envKey } : {})
        }),
        ...(headers ? { headers } : {}),
        methodName: 'addProjectCustomDomains'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to update project custom domains', error)
    }
  }

  /**
   * Singular alias for the self-serve custom-domain add flow.
   */
  async addProjectCustomDomain (projectId, domain, options = {}) {
    return await this.addProjectCustomDomains(projectId, domain, options)
  }

  // ==================== DNS HELPER METHODS ====================

  /**
   * Helper method to validate domain format
   */
  validateDomain (domain) {
    if (!domain || typeof domain !== 'string') {
      return {
        isValid: false,
        error: 'Domain must be a non-empty string'
      }
    }

    // Basic domain validation regex
    const domainRegex = /^[a-zA-Z0-9](?:(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)?(?:\.[a-zA-Z0-9](?:(?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)?)*$/u

    if (!domainRegex.test(domain)) {
      return {
        isValid: false,
        error: 'Invalid domain format'
      }
    }

    // Check for valid TLD
    const tldRegex = /\.[a-zA-Z]{2,}$/u
    if (!tldRegex.test(domain)) {
      return {
        isValid: false,
        error: 'Domain must have a valid top-level domain'
      }
    }

    return {
      isValid: true,
      error: null
    }
  }

  /**
   * Helper method to create DNS record with validation
   */
  async createDnsRecordWithValidation (domain, options = {}) {
    const validation = this.validateDomain(domain)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    return await this.createDnsRecord(domain, options)
  }

  /**
   * Helper method to get DNS record with validation
   */
  async getDnsRecordWithValidation (domain) {
    const validation = this.validateDomain(domain)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    return await this.getDnsRecord(domain)
  }

  /**
   * Helper method to remove DNS record with validation
   */
  async removeDnsRecordWithValidation (domain) {
    const validation = this.validateDomain(domain)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    return await this.removeDnsRecord(domain)
  }

  /**
   * Helper method to add project custom domains with validation
   */
  async addProjectCustomDomainsWithValidation (projectId, customDomains, options = {}) {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Project ID must be a valid string')
    }

    if (!customDomains) {
      throw new Error('Custom domains are required')
    }

    // Handle both string and array inputs
    const domainsArray = Array.isArray(customDomains) ? customDomains : [customDomains]

    if (domainsArray.length === 0) {
      throw new Error('At least one custom domain is required')
    }

    // Validate each domain
    for (const domain of domainsArray) {
      const validation = this.validateDomain(domain)
      if (!validation.isValid) {
        throw new Error(`Invalid domain '${domain}': ${validation.error}`)
      }
    }

    return await this.addProjectCustomDomains(projectId, customDomains, options)
  }

  /**
   * Helper method to check if domain is available
   */
  async isDomainAvailable (domain) {
    try {
      await this.getDnsRecord(domain)
      return false // Domain exists
    } catch (error) {
      if (error?.status === 404 || /not.?found/i.test(error?.message || '')) {
        return true // Domain is available
      }
      throw error // Other error occurred
    }
  }

  /**
   * Helper method to get domain status
   */
  async getDomainStatus (domain) {
    try {
      const record = await this.getDnsRecord(domain)
      return {
        exists: true,
        active: record.active || false,
        verified: record.verified || false,
        record
      }
    } catch (error) {
      if (error?.status === 404 || /not.?found/i.test(error?.message || '')) {
        return {
          exists: false,
          active: false,
          verified: false,
          error: 'Domain not found'
        }
      }
      throw error
    }
  }

  /**
   * Helper method to verify domain ownership
   */
  async verifyDomainOwnership (domain) {
    try {
      const record = await this.getDnsRecord(domain)

      if (!record.verified) {
        // Domain needs verification
        return {
          verified: false,
          needsVerification: true,
          verificationMethod: record.verificationMethod || 'dns',
          verificationRecord: record.verificationRecord
        }
      }

      return {
        verified: true,
        needsVerification: false
      }
    } catch (error) {
      throw new Error(`Failed to verify domain ownership: ${error.message}`, { cause: error })
    }
  }

  /**
   * Helper method to get project domains
   */
  async getProjectDomains (projectId) {
    this._requireReady('getProjectDomains')
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/domains`, {
        method: 'GET',
        methodName: 'getProjectDomains'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to get project domains', error)
    }
  }

  /**
   * Helper method to remove project custom domain
   */
  async removeProjectCustomDomain (projectId, domain) {
    this._requireReady('removeProjectCustomDomain')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/domains/${encodeURIComponent(domain)}`, {
        method: 'DELETE',
        methodName: 'removeProjectCustomDomain'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to remove project custom domain', error)
    }
  }

  /**
   * Pre-add onboarding check for a custom domain (server PR #440) — returns
   * frontend-ready DNS instructions + routing mode WITHOUT mutating state.
   * GET /projects/:projectId/domains/check/:domain
   */
  async checkProjectDomain (projectId, domain) {
    this._requireReady('checkProjectDomain')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/domains/check/${encodeURIComponent(domain)}`, {
        method: 'GET',
        methodName: 'checkProjectDomain'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to check project domain', error)
    }
  }

  /**
   * Alias that mirrors the server controller name.
   */
  async checkProjectCustomDomain (projectId, domain) {
    return await this.checkProjectDomain(projectId, domain)
  }

  /**
   * Refresh + persist the Cloudflare validation/SSL state for a configured
   * custom domain (server PR #440). Poll this while onboarding is pending —
   * `state` walks needs_dns → pending_hostname_validation → pending_ssl →
   * active (or failed / orphaned).
   * GET /projects/:projectId/domains/status/:domain
   */
  async getProjectCustomDomainStatus (projectId, domain) {
    this._requireReady('getProjectCustomDomainStatus')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/domains/status/${encodeURIComponent(domain)}`, {
        method: 'GET',
        methodName: 'getProjectCustomDomainStatus'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to get project domain status', error)
    }
  }

  /**
   * DNS instructions for a configured custom domain from stored state
   * (server PR #440) — no Cloudflare round-trip.
   * GET /projects/:projectId/domains/instructions/:domain
   */
  async getProjectDomainInstructions (projectId, domain) {
    this._requireReady('getProjectDomainInstructions')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    try {
      const response = await this._request(`/projects/${projectId}/domains/instructions/${encodeURIComponent(domain)}`, {
        method: 'GET',
        methodName: 'getProjectDomainInstructions'
      })
      return unwrapProjectDomainResponse(response)
    } catch (error) {
      throw wrapProjectDomainError('Failed to get project domain instructions', error)
    }
  }

  /**
   * Alias that mirrors the server controller name.
   */
  async getProjectCustomDomainInstructions (projectId, domain) {
    return await this.getProjectDomainInstructions(projectId, domain)
  }

  /**
   * High-level frontend helper for the self-serve add flow:
   * 1. preflight DNS/instruction check
   * 2. Cloudflare-backed add/provision
   * 3. return the selected onboarding row for immediate rendering
   */
  async startProjectCustomDomainSetup (projectId, domain, options = {}) {
    this._requireReady('startProjectCustomDomainSetup')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    const check = await this.checkProjectDomain(projectId, domain)
    const add = await this.addProjectCustomDomains(projectId, domain, options)
    const status = findOnboardingForDomain(add, domain)

    return {
      projectId,
      domain,
      hostname: status?.hostname || check?.hostname || domain,
      env: status?.env || options.envKey || check?.env || null,
      state: status?.state || check?.state || null,
      configured: status?.configured ?? check?.configured ?? false,
      check,
      add,
      status,
      instructions: status?.instructions || check?.instructions || null,
      records: status?.records || check?.records || [],
      warnings: [
        ...(Array.isArray(add?.warnings) ? add.warnings : []),
        ...(Array.isArray(status?.warnings) ? status.warnings : [])
      ]
    }
  }

  /**
   * Poll the authoritative API status endpoint until the domain reaches a
   * terminal state or the timeout elapses.
   */
  async pollProjectCustomDomainStatus (projectId, domain, options = {}) {
    this._requireReady('pollProjectCustomDomainStatus')
    if (!projectId) {
      throw new Error('Project ID is required')
    }
    if (!domain) {
      throw new Error('Domain is required')
    }

    const {
      intervalMs = 2000,
      timeoutMs = 120000,
      terminalStates = TERMINAL_CUSTOM_DOMAIN_STATES
    } = options
    const terminals = terminalStates instanceof Set ? terminalStates : new Set(terminalStates)
    const deadline = Date.now() + timeoutMs
    let lastStatus = null

    while (Date.now() <= deadline) {
      lastStatus = await this.getProjectCustomDomainStatus(projectId, domain)
      if (terminals.has(lastStatus?.state)) {
        return lastStatus
      }
      await sleep(intervalMs)
    }

    const error = new Error(`Timed out waiting for custom domain '${domain}' to become ready`)
    error.code = 'custom_domain_status_timeout'
    error.lastStatus = lastStatus
    throw error
  }

  /**
   * Helper method to format domain for display
   */
  formatDomain (domain) {
    if (!domain) {
      return ''
    }

    // Remove protocol if present
    const cleanDomain = domain.replace(/^https?:\/\//u, '')

    // Remove trailing slash
    return cleanDomain.replace(/\/$/u, '')
  }

  /**
   * Helper method to extract domain from URL
   */
  extractDomainFromUrl (url) {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return null
    }
  }
}
