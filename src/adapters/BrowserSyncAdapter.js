import {
  scanDirectorySaves,
  readFileBuffer,
  writeFileBuffer,
  backupFileInDirectory,
  verifyPermission,
  computeBufferHash,
} from '../utils/browserSaveDirectory.js'
import { compareFiles } from '../domain/sync/compareFiles.js'

export class BrowserSyncAdapter {
  /**
   * Synchronize save files between a browser DirectoryHandle and the SanctuaryCompanion host server.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} [serverUrl]
   */
  static async syncWithServer(dirHandle, serverUrl = window.location.origin) {
    const hasPerm = await verifyPermission(dirHandle, true)
    if (!hasPerm) {
      throw new Error('Permission to access the local save folder was not granted.')
    }

    // 1. Fetch server manifest from host
    const manifestRes = await fetch(`${serverUrl}/__sync/manifest`)
    if (!manifestRes.ok) {
      throw new Error(`Sync server returned HTTP ${manifestRes.status}`)
    }
    const manifestData = await manifestRes.json()
    if (manifestData.d2rRunning) {
      throw new Error('D2R is running on the host machine. Exit the game before syncing.')
    }
    const serverFiles = manifestData.files || []

    // 2. Scan local files in the selected browser directory
    const localFiles = await scanDirectorySaves(dirHandle)

    const serverMap = new Map(serverFiles.map((f) => [f.filename, f]))
    const localMap = new Map(localFiles.map((f) => [f.filename, f]))
    const allFilenames = Array.from(new Set([...localMap.keys(), ...serverMap.keys()])).sort()

    const toPush = []
    const toPull = []
    const inSync = []
    const conflicts = []

    for (const filename of allFilenames) {
      const local = localMap.get(filename) || null
      const server = serverMap.get(filename) || null
      const comparison = compareFiles(local, server)

      if (comparison.action === 'push') {
        toPush.push(local)
      } else if (comparison.action === 'pull') {
        toPull.push(server)
      } else if (comparison.action === 'inSync') {
        inSync.push(filename)
      } else {
        conflicts.push({ filename, local, server, reason: comparison.reason })
      }
    }

    const pulled = []
    const pushed = []
    const errors = []

    // 3. Pull files from server into local browser directory (backup before overwrite)
    for (const serverFile of toPull) {
      try {
        await backupFileInDirectory(dirHandle, serverFile.filename)
        const downloadRes = await fetch(`${serverUrl}/__sync/files/${encodeURIComponent(serverFile.filename)}`)
        if (!downloadRes.ok) {
          throw new Error(`Download failed: HTTP ${downloadRes.status}`)
        }
        const data = await downloadRes.arrayBuffer()
        if (!data || data.byteLength === 0) {
          throw new Error(`Downloaded payload for ${serverFile.filename} is empty`)
        }

        // Integrity verification
        const hash = await computeBufferHash(data)
        if (serverFile.hash && hash !== serverFile.hash) {
          throw new Error(`Hash mismatch for ${serverFile.filename}: expected ${serverFile.hash}, got ${hash}`)
        }

        // D2S magic header check if file is >= 100 bytes
        if (serverFile.filename.toLowerCase().endsWith('.d2s') && data.byteLength >= 100) {
          const view = new DataView(data)
          if (view.getUint32(0, true) !== 0xAA55AA55) {
            throw new Error(`Invalid D2S file signature for ${serverFile.filename}`)
          }
        }

        await writeFileBuffer(dirHandle, serverFile.filename, data)
        pulled.push(serverFile.filename)
      } catch (err) {
        errors.push(`Pull ${serverFile.filename}: ${err.message}`)
      }
    }

    // 4. Push local files from browser directory to server
    for (const localFile of toPush) {
      try {
        const buffer = localFile.buffer || (await readFileBuffer(dirHandle, localFile.filename))
        const hash = localFile.hash || (await computeBufferHash(buffer))
        const uploadRes = await fetch(`${serverUrl}/__sync/files/${encodeURIComponent(localFile.filename)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Hash': hash,
            'X-File-Modified': localFile.modifiedAt,
          },
          body: buffer,
        })
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}))
          throw new Error(errData.error || `Upload failed: HTTP ${uploadRes.status}`)
        }
        pushed.push(localFile.filename)
      } catch (err) {
        errors.push(`Push ${localFile.filename}: ${err.message}`)
      }
    }

    return {
      pushed,
      pulled,
      inSync,
      conflicts: conflicts.map((c) => c.filename),
      errors,
      timestamp: new Date().toISOString(),
    }
  }
}
