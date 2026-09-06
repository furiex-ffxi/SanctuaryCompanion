import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import { BrowserSyncAdapter } from '../../src/adapters/BrowserSyncAdapter.js'

function createMockDirectoryHandle(files = {}) {
  const fileStore = new Map()
  for (const [name, data] of Object.entries(files)) {
    fileStore.set(name, {
      name,
      content: Buffer.from(data.content || ''),
      lastModified: data.lastModified || Date.now(),
    })
  }

  const backups = new Map()

  const handle = {
    name: 'Diablo II Resurrected',
    kind: 'directory',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    values: async function* () {
      for (const [name, file] of fileStore.entries()) {
        yield {
          kind: 'file',
          name,
          getFile: async () => ({
            name: file.name,
            size: file.content.length,
            lastModified: file.lastModified,
            arrayBuffer: async () => file.content.buffer.slice(file.content.byteOffset, file.content.byteOffset + file.content.byteLength),
          }),
        }
      }
    },
    getFileHandle: async (filename, opts = {}) => {
      if (!fileStore.has(filename) && !opts.create) {
        const err = new Error('File not found')
        err.name = 'NotFoundError'
        throw err
      }
      return {
        getFile: async () => {
          const file = fileStore.get(filename) || { name: filename, content: Buffer.alloc(0), lastModified: Date.now() }
          return {
            name: file.name,
            size: file.content.length,
            lastModified: file.lastModified,
            arrayBuffer: async () => file.content.buffer.slice(file.content.byteOffset, file.content.byteOffset + file.content.byteLength),
          }
        },
        createWritable: async () => {
          let written = Buffer.alloc(0)
          return {
            write: async (chunk) => {
              written = Buffer.from(chunk)
            },
            close: async () => {
              fileStore.set(filename, {
                name: filename,
                content: written,
                lastModified: Date.now(),
              })
            },
          }
        },
      }
    },
    getDirectoryHandle: async (_dirName, _opts = {}) => {
      return {
        getDirectoryHandle: async () => ({
          getFileHandle: async (filename) => ({
            createWritable: async () => ({
              write: async (chunk) => {
                backups.set(filename, Buffer.from(chunk))
              },
              close: async () => {},
            }),
          }),
        }),
      }
    },
    _fileStore: fileStore,
    _backups: backups,
  }

  return handle
}

test('BrowserSyncAdapter syncs files between browser DirectoryHandle and server', async () => {
  const dirHandle = createMockDirectoryHandle({
    'Barb.d2s': { content: 'barb-client-v2', lastModified: 2000 },
    'Sorc.d2s': { content: 'sorc-client-v1', lastModified: 1000 },
  })

  const originalFetch = globalThis.fetch
  const uploadedFiles = {}

  const sorcServerContent = 'sorc-server-v2'
  const paladinServerContent = 'paladin-server-v1'
  const sorcServerHash = crypto.createHash('sha256').update(sorcServerContent).digest('hex')
  const paladinServerHash = crypto.createHash('sha256').update(paladinServerContent).digest('hex')

  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/__sync/manifest')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            // Barb on server is older
            { filename: 'Barb.d2s', hash: 'old-hash', modifiedAt: new Date(1000).toISOString() },
            // Sorc on server is newer
            { filename: 'Sorc.d2s', hash: sorcServerHash, modifiedAt: new Date(3000).toISOString() },
            // Paladin is on server only
            { filename: 'Paladin.d2s', hash: paladinServerHash, modifiedAt: new Date(2500).toISOString() },
          ],
        }),
      }
    }

    if (url.includes('/__sync/files/Sorc.d2s') && (!options.method || options.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('sorc-server-v2').buffer,
      }
    }

    if (url.includes('/__sync/files/Paladin.d2s') && (!options.method || options.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('paladin-server-v1').buffer,
      }
    }

    if (url.includes('/__sync/files/Barb.d2s') && options.method === 'PUT') {
      uploadedFiles['Barb.d2s'] = options.body
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }
    }

    throw new Error(`Unhandled fetch: ${url}`)
  }

  try {
    const result = await BrowserSyncAdapter.syncWithServer(dirHandle, 'http://test-server:5173')

    // Barb was newer locally -> pushed
    assert.deepEqual(result.pushed, ['Barb.d2s'])
    assert.ok(uploadedFiles['Barb.d2s'])

    // Sorc and Paladin were newer on server -> pulled
    assert.ok(result.pulled.includes('Sorc.d2s'))
    assert.ok(result.pulled.includes('Paladin.d2s'))
    assert.equal(result.pulled.length, 2)

    // Check that local files were updated in dirHandle
    assert.equal(dirHandle._fileStore.get('Sorc.d2s').content.toString(), 'sorc-server-v2')
    assert.equal(dirHandle._fileStore.get('Paladin.d2s').content.toString(), 'paladin-server-v1')
  } finally {
    globalThis.fetch = originalFetch
  }
})
