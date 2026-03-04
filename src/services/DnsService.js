import { BaseService } from './BaseService.js'

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
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(
        `Failed to update project custom domains: ${error.message}`, { cause: error }
      )
    }
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
      if (error.message.includes('not found') || error.message.includes('404')) {
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
      if (error.message.includes('not found') || error.message.includes('404')) {
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
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to get project domains: ${error.message}`, { cause: error })
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
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to remove project custom domain: ${error.message}`, { cause: error })
    }
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
