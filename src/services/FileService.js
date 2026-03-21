import { BaseService } from './BaseService.js'

export class FileService extends BaseService {
  // ==================== FILE METHODS ====================

  async uploadFile (file, options = {}) {
    this._requireReady('uploadFile')
    if (!file) {
      throw new Error('File is required for upload')
    }

    const formData = new FormData()
    formData.append('file', file)

    // Add optional parameters only if they exist
    const hasProjectIdOption = Object.hasOwn(options, 'projectId')
    const projectId = hasProjectIdOption ? options.projectId : this._context.project?.id
    if (projectId != null && projectId !== '') {
      formData.append('projectId', projectId)
    }
    if (options.tags) {
      formData.append('tags', JSON.stringify(options.tags))
    }
    if (options.visibility) {
      formData.append('visibility', options.visibility || 'public')
    }
    if (options.metadata) {
      formData.append('metadata', JSON.stringify(options.metadata))
    }

    try {
      const response = await this._request('/files/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        methodName: 'uploadFile'
      })

      if (!response.success) {
        throw new Error(response.message)
      }

      return response.data
    } catch (error) {
      throw new Error(`File upload failed: ${error.message}`, { cause: error })
    }
  }

  async updateProjectIcon (projectId, iconFile) {
    this._requireReady('updateProjectIcon')
    if (!projectId || !iconFile) {
      throw new Error('Project ID and icon file are required')
    }

    const formData = new FormData()
    formData.append('icon', iconFile)
    formData.append('projectId', projectId)

    try {
      const response = await this._request('/files/upload-project-icon', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        methodName: 'updateProjectIcon'
      })
      if (response.success) {
        return response.data
      }
      throw new Error(response.message)
    } catch (error) {
      throw new Error(`Failed to update project icon: ${error.message}`, { cause: error })
    }
  }

  // ==================== FILE HELPER METHODS ====================

  /**
   * Helper method to upload file with validation
   */
  async uploadFileWithValidation (file, options = {}) {
    if (!file) {
      throw new Error('File is required')
    }

    // Validate file size (optional)
    const maxSize = options.maxSize || 10 * 1024 * 1024 // 10MB default
    if (file.size > maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`)
    }

    // Validate file type (optional)
    const allowedTypes = options.allowedTypes || ['image/*', 'application/pdf', 'text/*']
    if (allowedTypes.length > 0) {
      const isValidType = allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', ''))
        }
        return file.type === type
      })

      if (!isValidType) {
        throw new Error(`File type '${file.type}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`)
      }
    }

    return await this.uploadFile(file, options)
  }

  /**
   * Helper method to upload image file specifically
   */
  async uploadImage (imageFile, options = {}) {
    const imageOptions = {
      ...options,
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxSize: options.maxSize || 5 * 1024 * 1024 // 5MB for images
    }

    return await this.uploadFileWithValidation(imageFile, imageOptions)
  }

  /**
   * Helper method to upload document file
   */
  async uploadDocument (documentFile, options = {}) {
    const documentOptions = {
      ...options,
      allowedTypes: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      maxSize: options.maxSize || 20 * 1024 * 1024 // 20MB for documents
    }

    return await this.uploadFileWithValidation(documentFile, documentOptions)
  }

  /**
   * Helper method to get file URL by ID
   */
  getFileUrl (fileId) {
    if (!fileId) {
      throw new Error('File ID is required')
    }
    return `${this._apiUrl}/core/files/public/${fileId}/download`
  }

  /**
   * Helper method to validate file before upload
   */
  validateFile (file, options = {}) {
    const errors = []

    if (!file) {
      errors.push('File is required')
      return errors
    }

    // Check file size
    const maxSize = options.maxSize || 10 * 1024 * 1024
    if (file.size > maxSize) {
      errors.push(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`)
    }

    // Check file type
    const allowedTypes = options.allowedTypes || []
    if (allowedTypes.length > 0) {
      const isValidType = allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', ''))
        }
        return file.type === type
      })

      if (!isValidType) {
        errors.push(`File type '${file.type}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`)
      }
    }

    return errors
  }

  /**
   * Helper method to create FormData with file and metadata
   */
  createFileFormData (file, metadata = {}) {
    const formData = new FormData()
    formData.append('file', file)

    // Add metadata as JSON string
    if (Object.keys(metadata).length > 0) {
      formData.append('metadata', JSON.stringify(metadata))
    }

    return formData
  }

  /**
   * Helper method to upload multiple files
   */
  async uploadMultipleFiles (files, options = {}) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required and must not be empty')
    }

    const uploadPromises = files.map(file => this.uploadFile(file, options))
    const results = await Promise.allSettled(uploadPromises)

    return results.map((result, index) => ({
      file: files[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }))
  }

  // ==================== PROJECT FILE UPLOAD ====================

  /**
   * Upload a file to the server and add its metadata to the project files map.
   *
   * Uses the project key from symbols.json (passed via context or options) to
   * associate the upload with a project. After upload, patches the project's
   * `files` map with a metadata entry matching the format used in the local
   * `files/` directory (content.src, key, type, format).
   *
   * @param {File|Blob} file - The file to upload
   * @param {Object} options
   * @param {string} options.key - File key in the project files map (defaults to file.name)
   * @param {string} options.projectId - Project ID (falls back to context)
   * @param {string} options.projectKey - Project key from symbols.json (falls back to context.appKey)
   * @param {string} options.visibility - File visibility (default: 'public')
   * @param {string[]} options.tags - Tags for the uploaded file
   * @param {Object} options.metadata - Extra metadata for the upload
   * @param {string} options.branch - Project branch (default: 'main')
   * @returns {Object} The file metadata entry that was added to the project
   */
  async uploadProjectFile (file, options = {}) {
    this._requireReady('uploadProjectFile')
    if (!file) {
      throw new Error('File is required for upload')
    }

    const fileKey = options.key || file.name
    if (!fileKey) {
      throw new Error('File key is required (provide options.key or a file with a name)')
    }

    // Upload the file to the server
    const uploadData = await this.uploadFile(file, {
      projectId: options.projectId,
      visibility: options.visibility || 'public',
      tags: options.tags,
      metadata: options.metadata
    })

    // Build the file metadata entry (same format as files/ directory)
    const fileId = uploadData._id || uploadData.id
    const format = _extractFormat(fileKey, uploadData)
    const entry = {
      content: {
        src: this.getFileUrl(fileId)
      },
      code: '',
      key: fileKey,
      type: 'file',
      format
    }

    // Patch the project files map on the server
    const projectService = this._context?.services?.project
    const projectId = options.projectId || this._context.project?.id
    if (projectService && projectId) {
      const branch = options.branch || 'main'
      const changes = [['update', ['files', fileKey], entry]]
      await projectService.applyProjectChanges(projectId, changes, { branch })
    }

    return entry
  }

  /**
   * Upload multiple files to the project files map.
   *
   * @param {Array<File|Blob>} files - Files to upload
   * @param {Object} options - Same options as uploadProjectFile (key is derived from each file name)
   * @returns {Array<Object>} Results with success/error status and metadata entries
   */
  async uploadMultipleProjectFiles (files, options = {}) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required and must not be empty')
    }

    const results = []
    for (const file of files) {
      try {
        const entry = await this.uploadProjectFile(file, {
          ...options,
          key: file.name || options.key
        })
        results.push({ file, success: true, data: entry, error: null })
      } catch (error) {
        results.push({ file, success: false, data: null, error: error.message })
      }
    }

    return results
  }
}

function _extractFormat (fileKey, uploadData) {
  if (uploadData.extension) return uploadData.extension.toLowerCase()
  const dotIdx = fileKey.lastIndexOf('.')
  if (dotIdx !== -1) return fileKey.slice(dotIdx + 1).toLowerCase()
  return ''
}
