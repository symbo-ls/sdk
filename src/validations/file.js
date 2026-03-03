import { BaseValidator } from './base'

export class FileValidator extends BaseValidator {
  constructor (data) {
    super()
    this.data = data
  }

  validateName () {
    const { key } = this.data

    if (!key) {
      this.addError('key', 'File name is required')
    } else if (
      !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9]+$/u.test(key)
    ) {
      this.addError('key', 'Invalid file name format')
    }

    return this
  }

  validateFormat () {
    const { format, contentType } = this.data

    if (contentType === 'file') {
      if (format) {
        const allowedFormats = [
          // Image formats
          'png',
          'svg',
          'jpeg',
          'jpg',
          'gif',
          'bmp',
          'tiff',
          'tif',
          'webp',
          'ico',
          // Video formats
          'mp4',
          'webm',
          'avi',
          'mov',
          'wmv',
          'flv',
          'mkv',
          '3gp',
          // Audio formats
          'mp3',
          'wav',
          'ogg',
          'm4a',
          'flac',
          'aac',
          'wma',
          'mid',
          'midi',
          // Document formats
          'pdf',
          'doc',
          'docx',
          'ppt',
          'pptx',
          'xls',
          'xlsx',
          // Archive formats
          'zip',
          'rar',
          '7z',
          // Font formats
          'woff',
          'woff2',
          'ttf',
          'otf'
        ]

        if (!allowedFormats.includes(format.toLowerCase())) {
          this.addError('format', `File format "${format}" is not supported`)
        }
      } else {
        this.addError('format', 'File format is required')
      }
    }

    return this
  }

  validateContent () {
    const { value, contentType } = this.data

    if (contentType === 'file' && !value) {
      this.addError('value', 'File source is required')
    }

    return this
  }

  validateSize () {
    const { size } = this.data
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

    if (size && size > MAX_FILE_SIZE) {
      this.addError('size', 'File size exceeds maximum allowed (50MB)')
    }

    return this
  }

  validateAll () {
    return this.validateName().validateFormat().validateContent().validateSize()
  }
}
