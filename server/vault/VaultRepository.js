import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { projectVaultEntry } from './vaultProjection.js'
import { normalizeVaultItem } from './itemImageResolver.js'

const SCHEMA_VERSION = 2
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
}

function operationId() {
  return crypto.randomUUID()
}

function cursorSignature(options = {}) {
  const filters = {
    q: options.q?.trim().toLowerCase() || '',
    slot: options.slot || 'All',
    category: options.category || 'All',
    setName: options.setName || 'All',
    quality: options.quality || 'All',
  }
  return crypto.createHash('sha256').update(JSON.stringify(filters)).digest('base64url')
}

function decodeCursor(cursor, signature) {
  if (!cursor) return null
  let decoded
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('Invalid vault pagination cursor')
    error.statusCode = 400
    throw error
  }
  if (typeof decoded.stashedAt !== 'string' || !decoded.stashedAt || typeof decoded.vaultId !== 'string' || !decoded.vaultId.trim() || decoded.signature !== signature) {
    const error = new Error('Invalid or mismatched vault pagination cursor')
    error.statusCode = 400
    throw error
  }
  return decoded
}

function encodeCursor(row, signature) {
  return Buffer.from(JSON.stringify({ stashedAt: row.stashed_at, vaultId: row.vault_id, signature })).toString('base64url')
}

function hydrateRow(row) {
  return {
    vaultId: row.vault_id,
    stashedAt: row.stashed_at,
    sourceSave: row.source_save,
    itemData: normalizeVaultItem(JSON.parse(row.item_json)),
    status: row.status,
  }
}

export class VaultRepository {
  constructor({ savesDir, databasePath, now = () => new Date() }) {
    this.savesDir = savesDir
    this.databasePath = databasePath || path.join(savesDir, 'infinite_stash_vault.sqlite3')
    this.backupsRoot = path.join(savesDir, 'backups', 'vault')
    this.now = now
    this.epoch = null
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true })
    this.db = new Database(this.databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.#initializeSchema()
  }

  #initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vault_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vault_items (
        vault_id TEXT PRIMARY KEY,
        stashed_at TEXT NOT NULL,
        source_save TEXT NOT NULL,
        display_name TEXT NOT NULL,
        type_code TEXT,
        type_name TEXT,
        slot TEXT,
        category TEXT,
        quality INTEGER,
        set_name TEXT,
        search_text TEXT NOT NULL,
        item_json TEXT NOT NULL CHECK (json_valid(item_json)),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'pending_deposit', 'pending_withdraw', 'withdrawn', 'deleted', 'recovery_needed')),
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS applied_operations (
        operation_id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS vault_items_order ON vault_items(status, stashed_at DESC, vault_id DESC);
      CREATE INDEX IF NOT EXISTS vault_items_slot ON vault_items(status, slot);
      CREATE INDEX IF NOT EXISTS vault_items_category ON vault_items(status, category);
      CREATE INDEX IF NOT EXISTS vault_items_quality ON vault_items(status, quality);
      CREATE INDEX IF NOT EXISTS vault_items_set_name ON vault_items(status, set_name);
    `)
    const currentVersion = this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version
    if (currentVersion === 0) {
      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(SCHEMA_VERSION, this.now().toISOString())
    } else if (currentVersion < SCHEMA_VERSION) {
      this.#createCheckpointSync()
      const rows = this.db.prepare('SELECT vault_id, item_json FROM vault_items').all()
      const update = this.db.prepare(`
        UPDATE vault_items SET display_name = @displayName, type_code = @typeCode,
          type_name = @typeName, slot = @slot, category = @category, quality = @quality,
          set_name = @setName, search_text = @searchText WHERE vault_id = @vaultId
      `)
      this.db.transaction(() => {
        for (const row of rows) update.run({ ...projectVaultEntry({ itemData: JSON.parse(row.item_json) }), vaultId: row.vault_id })
        this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(SCHEMA_VERSION, this.now().toISOString())
      })()
    }
  }

  #createCheckpointSync() {
    if (this.epoch) return this.epoch
    const epochId = `${timestampForPath(this.now())}_${crypto.randomUUID().slice(0, 8)}`
    const directory = path.join(this.backupsRoot, epochId)
    fs.mkdirSync(directory, { recursive: true })
    const checkpointPath = path.join(directory, 'checkpoint.sqlite3')
    this.db.prepare('VACUUM INTO ?').run(checkpointPath)
    const journalPath = path.join(directory, 'transactions.jsonl')
    fs.closeSync(fs.openSync(journalPath, 'a'))
    const manifest = {
      formatVersion: 1, epochId, createdAt: this.now().toISOString(),
      databaseSchemaVersion: SCHEMA_VERSION - 1,
      checkpointFile: 'checkpoint.sqlite3', journalFile: 'transactions.jsonl', startingSequence: 1,
    }
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    this.epoch = { epochId, directory, checkpointPath, journalPath, sequence: 0, previousHash: null }
    return this.epoch
  }

  close() {
    if (this.db.open) this.db.close()
  }

  migrateLegacyJson(legacyPath = path.join(this.savesDir, 'infinite_stash_vault.json')) {
    const marker = this.db.prepare("SELECT value FROM vault_metadata WHERE key = 'legacy_json_migration'").get()
    if (marker || !fs.existsSync(legacyPath)) return { migrated: false, reason: marker ? 'already-migrated' : 'not-found' }

    const source = fs.readFileSync(legacyPath, 'utf8')
    const entries = JSON.parse(source)
    if (!Array.isArray(entries)) throw new Error('Legacy vault JSON must contain an array')
    const seen = new Set()
    for (const entry of entries) {
      if (!entry?.vaultId || typeof entry.vaultId !== 'string') throw new Error('Legacy vault entry is missing vaultId')
      if (!entry.itemData || typeof entry.itemData !== 'object') throw new Error(`Legacy vault entry ${entry.vaultId} is missing itemData`)
      if (seen.has(entry.vaultId)) throw new Error(`Duplicate legacy vaultId: ${entry.vaultId}`)
      seen.add(entry.vaultId)
    }

    const sourceHash = crypto.createHash('sha256').update(source).digest('hex')
    const migratedAt = this.now().toISOString()
    const migrate = this.db.transaction(() => {
      if (this.db.prepare('SELECT COUNT(*) AS count FROM vault_items').get().count !== 0) {
        throw new Error('Refusing legacy migration into a non-empty vault database')
      }
      for (const entry of entries) this.#insertEntry(entry, 'active', migratedAt)
      this.db.prepare('INSERT INTO vault_metadata(key, value) VALUES (?, ?)').run('legacy_json_migration', JSON.stringify({ migratedAt, count: entries.length, sourceHash }))
    })
    migrate()

    const archiveDir = path.join(this.savesDir, 'backups', `vault-legacy-migration_${timestampForPath(this.now())}`)
    fs.mkdirSync(archiveDir, { recursive: true })
    fs.copyFileSync(legacyPath, path.join(archiveDir, path.basename(legacyPath)))
    fs.writeFileSync(path.join(archiveDir, 'migration-report.json'), JSON.stringify({ migratedAt, count: entries.length, sourceHash }, null, 2), 'utf8')
    return { migrated: true, count: entries.length, archiveDir, sourceHash }
  }

  async ensureCheckpoint() {
    if (this.epoch) return this.epoch
    const epochId = `${timestampForPath(this.now())}_${crypto.randomUUID().slice(0, 8)}`
    const directory = path.join(this.backupsRoot, epochId)
    fs.mkdirSync(directory, { recursive: true })
    const checkpointPath = path.join(directory, 'checkpoint.sqlite3')
    await this.db.backup(checkpointPath)
    const journalPath = path.join(directory, 'transactions.jsonl')
    fs.closeSync(fs.openSync(journalPath, 'a'))
    const manifest = {
      formatVersion: 1,
      epochId,
      createdAt: this.now().toISOString(),
      databaseSchemaVersion: SCHEMA_VERSION,
      checkpointFile: 'checkpoint.sqlite3',
      journalFile: 'transactions.jsonl',
      startingSequence: 1,
    }
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    this.epoch = { epochId, directory, checkpointPath, journalPath, sequence: 0, previousHash: null }
    return this.epoch
  }

  async forceCheckpoint() {
    this.epoch = null
    return this.ensureCheckpoint()
  }

  #appendJournal(record) {
    if (!this.epoch) throw new Error('Vault checkpoint must exist before journaling')
    const journalRecord = {
      version: 1,
      sequence: ++this.epoch.sequence,
      timestamp: this.now().toISOString(),
      previousHash: this.epoch.previousHash,
      ...record,
    }
    const content = JSON.stringify(journalRecord)
    journalRecord.checksum = crypto.createHash('sha256').update(content).digest('hex')
    const descriptor = fs.openSync(this.epoch.journalPath, 'a')
    try {
      fs.writeSync(descriptor, `${JSON.stringify(journalRecord)}\n`, null, 'utf8')
      fs.fsyncSync(descriptor)
    } finally {
      fs.closeSync(descriptor)
    }
    this.epoch.previousHash = journalRecord.checksum
    return journalRecord
  }

  #insertEntry(entry, status = 'active', updatedAt = this.now().toISOString()) {
    const projection = projectVaultEntry(entry)
    this.db.prepare(`
      INSERT INTO vault_items (
        vault_id, stashed_at, source_save, display_name, type_code, type_name,
        slot, category, quality, set_name, search_text, item_json, status, updated_at
      ) VALUES (
        @vaultId, @stashedAt, @sourceSave, @displayName, @typeCode, @typeName,
        @slot, @category, @quality, @setName, @searchText, @itemJson, @status, @updatedAt
      )
      ON CONFLICT(vault_id) DO UPDATE SET
        stashed_at = excluded.stashed_at,
        source_save = excluded.source_save,
        display_name = excluded.display_name,
        type_code = excluded.type_code,
        type_name = excluded.type_name,
        slot = excluded.slot,
        category = excluded.category,
        quality = excluded.quality,
        set_name = excluded.set_name,
        search_text = excluded.search_text,
        item_json = excluded.item_json,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run({
      ...projection,
      vaultId: entry.vaultId,
      stashedAt: entry.stashedAt,
      sourceSave: entry.sourceSave,
      itemJson: JSON.stringify(normalizeVaultItem(entry.itemData)),
      status,
      updatedAt,
    })
  }

  list(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const signature = cursorSignature(options)
    const cursor = decodeCursor(options.cursor, signature)
    const conditions = ["status = 'active'"]
    const parameters = {}

    if (options.q?.trim()) {
      conditions.push("search_text LIKE @query ESCAPE '\\'")
      parameters.query = `%${options.q.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
    }
    for (const [option, column] of [['slot', 'slot'], ['category', 'category'], ['setName', 'set_name']]) {
      if (options[option] && options[option] !== 'All') {
        conditions.push(`${column} = @${option}`)
        parameters[option] = options[option]
      }
    }
    if (options.quality && options.quality !== 'All') {
      conditions.push('quality = @quality')
      parameters.quality = Number(options.quality)
    }
    const filterWhere = conditions.join(' AND ')
    const count = this.db.prepare(`SELECT COUNT(*) AS count FROM vault_items WHERE ${filterWhere}`).get(parameters).count
    if (cursor) {
      conditions.push('(stashed_at < @cursorTime OR (stashed_at = @cursorTime AND vault_id < @cursorId))')
      parameters.cursorTime = cursor.stashedAt
      parameters.cursorId = cursor.vaultId
    }
    parameters.fetchLimit = limit + 1
    const rows = this.db.prepare(`
      SELECT * FROM vault_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY stashed_at DESC, vault_id DESC
      LIMIT @fetchLimit
    `).all(parameters)
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    return {
      items: pageRows.map(hydrateRow),
      total: count,
      nextCursor: hasMore ? encodeCursor(pageRows.at(-1), signature) : null,
    }
  }

  facets() {
    const distinct = (column) => this.db.prepare(`SELECT DISTINCT ${column} AS value FROM vault_items WHERE status = 'active' AND ${column} IS NOT NULL AND ${column} != '' ORDER BY ${column}`).all().map(({ value }) => value)
    return { slots: distinct('slot'), sets: distinct('set_name'), categories: distinct('category') }
  }

  get(vaultId, { includeInactive = false } = {}) {
    const row = this.db.prepare(`SELECT * FROM vault_items WHERE vault_id = ?${includeInactive ? '' : " AND status = 'active'"}`).get(vaultId)
    return row ? hydrateRow(row) : null
  }

  async add(entry, { id = operationId() } = {}) {
    if (!entry?.vaultId || !entry?.itemData) throw new Error('Vault entry requires vaultId and itemData')
    await this.ensureCheckpoint()
    if (this.get(entry.vaultId, { includeInactive: true })) throw new Error(`Vault item already exists: ${entry.vaultId}`)
    this.#appendJournal({ operationId: id, phase: 'intent', operation: 'deposit', entry })
    const apply = this.db.transaction(() => {
      this.#insertEntry(entry)
      this.db.prepare('INSERT INTO applied_operations(operation_id, operation, applied_at) VALUES (?, ?, ?)').run(id, 'deposit', this.now().toISOString())
    })
    apply()
    this.#appendJournal({ operationId: id, phase: 'commit', operation: 'deposit' })
    return this.get(entry.vaultId)
  }

  async update(entry, { id = operationId() } = {}) {
    const current = this.get(entry?.vaultId, { includeInactive: true })
    if (!current) return null
    await this.ensureCheckpoint()
    this.#appendJournal({ operationId: id, phase: 'intent', operation: 'metadata_update', entry })
    const apply = this.db.transaction(() => {
      this.#insertEntry(entry, current.status)
      this.db.prepare('INSERT INTO applied_operations(operation_id, operation, applied_at) VALUES (?, ?, ?)')
        .run(id, 'metadata_update', this.now().toISOString())
    })
    apply()
    this.#appendJournal({ operationId: id, phase: 'commit', operation: 'metadata_update' })
    return this.get(entry.vaultId, { includeInactive: true })
  }

  async retire(vaultId, { reason = 'delete', id = operationId() } = {}) {
    const entry = this.get(vaultId)
    if (!entry) return null
    await this.ensureCheckpoint()
    this.#appendJournal({ operationId: id, phase: 'intent', operation: reason, entry })
    const status = reason === 'withdraw' ? 'withdrawn' : 'deleted'
    const apply = this.db.transaction(() => {
      this.db.prepare('UPDATE vault_items SET status = ?, updated_at = ? WHERE vault_id = ?').run(status, this.now().toISOString(), vaultId)
      this.db.prepare('INSERT INTO applied_operations(operation_id, operation, applied_at) VALUES (?, ?, ?)').run(id, reason, this.now().toISOString())
    })
    apply()
    this.#appendJournal({ operationId: id, phase: 'commit', operation: reason })
    return entry
  }

  async importEntries(entries) {
    if (!Array.isArray(entries)) throw new Error('Import must be a JSON array')
    const normalized = entries.filter((entry) => entry?.itemData).map((entry) => ({
      ...entry,
      vaultId: entry.vaultId || `stash_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      stashedAt: entry.stashedAt || this.now().toISOString(),
      sourceSave: entry.sourceSave || 'Imported JSON',
    }))
    const ids = new Set()
    for (const entry of normalized) {
      while (ids.has(entry.vaultId) || this.db.prepare('SELECT 1 FROM vault_items WHERE vault_id = ?').get(entry.vaultId)) entry.vaultId = `stash_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
      ids.add(entry.vaultId)
    }
    await this.ensureCheckpoint()
    const id = operationId()
    this.#appendJournal({ operationId: id, phase: 'intent', operation: 'import', entries: normalized })
    let addedCount = 0
    const apply = this.db.transaction(() => {
      for (const entry of normalized) {
        this.#insertEntry(entry)
        addedCount++
      }
      this.db.prepare('INSERT INTO applied_operations(operation_id, operation, applied_at) VALUES (?, ?, ?)').run(id, 'import', this.now().toISOString())
    })
    apply()
    this.#appendJournal({ operationId: id, phase: 'commit', operation: 'import' })
    return { addedCount }
  }

  exportEntries() {
    return this.db.prepare("SELECT * FROM vault_items WHERE status = 'active' ORDER BY stashed_at DESC, vault_id DESC").all().map(hydrateRow)
  }

  integrityCheck() {
    return this.db.pragma('integrity_check', { simple: true })
  }
}
