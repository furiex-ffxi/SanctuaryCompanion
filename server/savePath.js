import path from 'node:path'

export function safeSavePath(savesDir, filename, extension) {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || path.extname(filename).toLowerCase() !== extension) {
    throw new Error(`File must be a ${extension} basename`)
  }
  const root = path.resolve(savesDir)
  const fullPath = path.resolve(root, filename)
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) throw new Error('File path escapes the save directory')
  return fullPath
}