import path from 'node:path'

const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_\-\. ]+$/
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

export function safeSavePath(savesDir, filename, extension = ['.d2s', '.d2i']) {
  if (typeof filename !== 'string') {
    throw new Error('Filename must be a string basename')
  }
  const validExts = Array.isArray(extension) ? extension.map(e => e.toLowerCase()) : [extension.toLowerCase()]
  const ext = path.extname(filename).toLowerCase()
  if (!validExts.includes(ext)) {
    throw new Error(`File must be a ${validExts.join('/')} basename`)
  }
  if (path.basename(filename) !== filename || !SAFE_FILENAME_REGEX.test(filename) || RESERVED_NAMES.test(filename)) {
    throw new Error(`File must be a valid basename: ${filename}`)
  }
  const root = path.resolve(savesDir)
  const fullPath = path.resolve(root, filename)
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    throw new Error('File path escapes the save directory')
  }
  return fullPath
}