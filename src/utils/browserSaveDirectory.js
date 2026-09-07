/**
 * Utilities for the Web File System Access API (window.showDirectoryPicker)
 * to read/write local D2R save files directly from the browser on client machines.
 */

const DB_NAME = 'sanctuary_companion_fsa'
const DB_VERSION = 1
const STORE_NAME = 'handles'
const HANDLE_KEY = 'd2r_saves_directory_handle'

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function getStoredDirectoryHandle() {
  try {
    const db = await openDatabase()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(HANDLE_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function storeDirectoryHandle(handle) {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(handle, HANDLE_KEY)
      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return false
  }
}

export async function clearStoredDirectoryHandle() {
  try {
    const db = await openDatabase()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(HANDLE_KEY)
      request.onsuccess = () => resolve(true)
      request.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function verifyPermission(handle, readWrite = true) {
  if (!handle) return false
  const opts = { mode: readWrite ? 'readwrite' : 'read' }
  try {
    if ((await handle.queryPermission(opts)) === 'granted') {
      return true
    }
    if ((await handle.requestPermission(opts)) === 'granted') {
      return true
    }
  } catch {
    return false
  }
  return false
}

export async function selectSaveDirectory() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Please use Chrome, Edge, or Brave in a secure context.')
  }
  const handle = await window.showDirectoryPicker({
    id: 'd2r-saved-games',
    mode: 'readwrite',
    startIn: 'documents',
  })
  await storeDirectoryHandle(handle)
  return handle
}

export async function computeBufferHash(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export function extractD2SHeaderMetadata(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength < 44) return null
  const view = new DataView(arrayBuffer)
  const magic = view.getUint32(0, true)
  if (magic !== 0xAA55AA55) return null
  const level = view.getUint8(43)
  return {
    type: 'character',
    level: level >= 1 && level <= 99 ? level : 1,
  }
}

export async function scanDirectorySaves(handle) {
  const saves = []
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && /\.(d2s|d2i)$/i.test(entry.name)) {
      try {
        const file = await entry.getFile()
        const buffer = await file.arrayBuffer()
        const hash = await computeBufferHash(buffer)
        const isD2S = entry.name.toLowerCase().endsWith('.d2s')
        const metadata = isD2S ? extractD2SHeaderMetadata(buffer) : null
        saves.push({
          filename: entry.name,
          hash,
          sizeBytes: file.size,
          modifiedAt: new Date(file.lastModified).toISOString(),
          metadata,
          buffer,
        })
      } catch (err) {
        console.warn(`Failed to scan save file ${entry.name}:`, err.message)
      }
    }
  }
  return saves
}

export async function readFileBuffer(handle, filename) {
  const fileHandle = await handle.getFileHandle(filename)
  const file = await fileHandle.getFile()
  return await file.arrayBuffer()
}

export async function writeFileBuffer(handle, filename, arrayBuffer) {
  const fileHandle = await handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(arrayBuffer)
    await writable.close()
  } catch (err) {
    await writable.abort().catch(() => {})
    throw err
  }
}

export async function backupFileInDirectory(handle, filename) {
  try {
    const fileHandle = await handle.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const buffer = await file.arrayBuffer()

    const backupsDir = await handle.getDirectoryHandle('backups', { create: true })
    const timestamp = `pre-sync-${Date.now()}`
    const snapshotDir = await backupsDir.getDirectoryHandle(timestamp, { create: true })
    const backupFileHandle = await snapshotDir.getFileHandle(filename, { create: true })
    const writable = await backupFileHandle.createWritable()
    try {
      await writable.write(buffer)
      await writable.close()
    } catch (err) {
      await writable.abort().catch(() => {})
      throw err
    }
  } catch (err) {
    console.warn(`Could not create pre-sync backup for ${filename}:`, err.message)
  }
}

