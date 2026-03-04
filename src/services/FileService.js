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
}
