import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { projectVaultEntry } from './vaultProjection.js'
import { normalizeVaultItem } from './itemImageResolver.js'
import { replayVaultEpoch } from './VaultRecovery.js'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm'
import * as schema from './schema.js'

const SCHEMA_VERSION = 6
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200
const DEFAULT_SORT = 'dateAdded'
const DEFAULT_DIRECTION = 'desc'
const VAULT_STATUSES = Object.freeze(['active', 'pending_deposit', 'pending_withdraw', 'withdrawn', 'deleted', 'recovery_needed'])
const SORTS = Object.freeze({
  dateAdded: { column: 'stashedAt', nullable: false },
  name: { column: 'displayNameSort', nullable: false },
  type: { column: 'typeNameSort', nullable: true },
  rarity: { column: 'quality', nullable: true },
  source: { column: 'sourceSaveSort', nullable: false },
  level: { column: 'level', nullable: true },
})

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23)
}

function operationId() {
  return crypto.randomUUID()
}

function normalizeListOptions(options = {}) {
  const sort = options.sort ?? DEFAULT_SORT
  const direction = options.direction ?? DEFAULT_DIRECTION
  if (!Object.hasOwn(SORTS, sort)) {
    const error = new Error('Unsupported vault sort: ' + sort)
    error.statusCode = 400
    throw error
  }
  if (!['asc', 'desc'].includes(direction)) {
    const error = new Error('Unsupported vault sort direction: ' + direction)
    error.statusCode = 400
    throw error
  }
  const requestedStatuses = options.status === 'available'
    ? ['active', 'pending_deposit', 'pending_withdraw']
    : (Array.isArray(options.statuses) ? options.statuses : [options.status || 'active'])
  const statuses = [...new Set(requestedStatuses.map(String))].sort()
  if (!statuses.length || statuses.some(status => !VAULT_STATUSES.includes(status))) {
    const error = new Error('Unsupported vault status')
    error.statusCode = 400
    throw error
  }
  const level = value => value === '' || value === null || value === undefined ? null : Number(value)
  return {
    q: options.q?.trim().toLowerCase() || '',
    slot: options.slot || 'All',
    category: options.category || 'All',
    setName: options.setName || 'All',
    quality: options.quality || 'All',
    minLevel: level(options.minLevel),
    maxLevel: level(options.maxLevel),
    statuses,
    sort,
    direction,
  }
}

function signCursor(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64url')
}

function decodeCursor(cursor, query, secret) {
  if (!cursor) return null
  let decoded
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    const error = new Error('Invalid vault pagination cursor')
    error.statusCode = 400
    throw error
  }
  const { signature, ...payload } = decoded || {}
  const expectedSignature = signCursor(payload, secret)
  const cursorStatuses = Array.isArray(payload.statuses) ? [...new Set(payload.statuses.map(String))].sort() : ['active']
  const contextMatches = payload.sort === query.sort
    && payload.direction === query.direction
    && payload.q === query.q
    && payload.slot === query.slot
    && payload.category === query.category
    && payload.setName === query.setName
    && payload.quality === query.quality
    && payload.minLevel === query.minLevel
    && payload.maxLevel === query.maxLevel
    && JSON.stringify(cursorStatuses) === JSON.stringify(query.statuses)
  const actualSignature = typeof signature === 'string' ? Buffer.from(signature) : null
  const expectedSignatureBytes = Buffer.from(expectedSignature)
  const validSignature = actualSignature?.length === expectedSignatureBytes.length
    && crypto.timingSafeEqual(actualSignature, expectedSignatureBytes)
  if (typeof payload.vaultId !== 'string' || !payload.vaultId.trim()
    || !Object.hasOwn(payload, 'sortValue') || !contextMatches || !validSignature) {
    const error = new Error('Invalid or mismatched vault pagination cursor')
    error.statusCode = 400
    throw error
  }
  return decoded
}

function encodeCursor(row, query, secret) {
  const payload = {
    ...query,
    sortValue: row[SORTS[query.sort].column],
    vaultId: row.vaultId,
  }
  return Buffer.from(JSON.stringify({ ...payload, signature: signCursor(payload, secret) })).toString('base64url')
}

function hydrateRow(row) {
  return {
    vaultId: row.vaultId,
    stashedAt: row.stashedAt,
    sourceSave: row.sourceSave,
    itemData: normalizeVaultItem(JSON.parse(row.itemJson)),
    status: row.status,
  }
}

function itemIdentity(entry) {
  const item = entry?.itemData
  const id = item?.id ?? item?.item_seed
  if (id === undefined || id === null || id === '') return null
  return { sourceSave: entry.sourceSave, itemId: String(id) }
}

export class VaultRepository {
  constructor({ savesDir, databasePath, now = () => new Date() }) {
    this.savesDir = savesDir
    this.databasePath = databasePath || path.join(savesDir, 'infinite_stash_vault.sqlite3')
    this.backupsRoot = path.join(savesDir, 'backups', 'vault')
    this.now = now
    this.epoch = null
    this.cursorSecret = null
    const dbDir = path.dirname(this.databasePath)
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    this.db = new Database(this.databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.orm = drizzle(this.db, { schema })
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
        source_save_sort TEXT,
        display_name TEXT NOT NULL,
        display_name_sort TEXT,
        type_code TEXT,
        type_name TEXT,
        type_name_sort TEXT,
        slot TEXT,
        category TEXT,
        quality INTEGER,
        level INTEGER,
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
      CREATE INDEX IF NOT EXISTS vault_items_identity ON vault_items(source_save, CAST(json_extract(item_json, '$.id') AS TEXT), CAST(json_extract(item_json, '$.item_seed') AS TEXT));
    `)
    const currentVersionRow = this.orm.select({ version: sql`COALESCE(MAX(${schema.schemaMigrations.version}), 0)` }).from(schema.schemaMigrations).get()
    const currentVersion = currentVersionRow ? Number(currentVersionRow.version) : 0;
    
    if (currentVersion === 0) {
      this.db.transaction(() => {
        this.#replaceSortIndexes()
        this.#ensureCursorSecret()
        this.orm.insert(schema.schemaMigrations).values({ version: SCHEMA_VERSION, appliedAt: this.now().toISOString() }).run()
      })()
    } else if (currentVersion < SCHEMA_VERSION) {
      this.#createCheckpointSync(currentVersion)
      this.db.transaction(() => {
        this.#addSortColumns()
        if (currentVersion < 5) this.#addLevelColumn()

        if (currentVersion < 2) {
          this.#reprojectRows()
          this.orm.insert(schema.schemaMigrations).values({ version: 2, appliedAt: this.now().toISOString() }).run()
        }
        if (currentVersion < 3) {
          this.#replaceSortIndexes()
          this.orm.insert(schema.schemaMigrations).values({ version: 3, appliedAt: this.now().toISOString() }).run()
        }
        if (currentVersion < 4) {
          if (currentVersion >= 2) this.#reprojectRows()
          this.#replaceSortIndexes()
          this.#ensureCursorSecret()
          this.orm.insert(schema.schemaMigrations).values({ version: 4, appliedAt: this.now().toISOString() }).run()
        }
        if (currentVersion < 5) {
          if (currentVersion >= 2) this.#reprojectRows()
          this.#replaceSortIndexes()
          this.orm.insert(schema.schemaMigrations).values({ version: 5, appliedAt: this.now().toISOString() }).run()
        }
        if (currentVersion < 6) {
          if (currentVersion >= 2) this.#reprojectRows()
          this.orm.insert(schema.schemaMigrations).values({ version: 6, appliedAt: this.now().toISOString() }).run()
        }
      })()
      this.epoch = null
    }

    const secretRow = this.orm.select({ value: schema.vaultMetadata.value }).from(schema.vaultMetadata).where(eq(schema.vaultMetadata.key, 'cursor_hmac_secret')).get()
    if (!secretRow) {
      this.#createCheckpointSync(currentVersion || SCHEMA_VERSION)
      this.db.transaction(() => this.#ensureCursorSecret())()
      this.epoch = null
    } else {
      this.cursorSecret = secretRow.value
    }
  }

  #addSortColumns() {
    const columns = new Set(this.db.pragma('table_info(vault_items)').map(({ name }) => name))
    if (!columns.has('source_save_sort')) this.db.exec('ALTER TABLE vault_items ADD COLUMN source_save_sort TEXT')
    if (!columns.has('display_name_sort')) this.db.exec('ALTER TABLE vault_items ADD COLUMN display_name_sort TEXT')
    if (!columns.has('type_name_sort')) this.db.exec('ALTER TABLE vault_items ADD COLUMN type_name_sort TEXT')
  }

  #addLevelColumn() {
    const columns = new Set(this.db.pragma('table_info(vault_items)').map(({ name }) => name))
    if (!columns.has('level')) {
      this.db.exec('ALTER TABLE vault_items ADD COLUMN level INTEGER')
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS vault_items_level ON vault_items(status, level)')
  }

  #reprojectRows() {
    const rows = this.db.prepare('SELECT vault_id, source_save, item_json FROM vault_items').all()
    for (const row of rows) {
      const proj = projectVaultEntry({ sourceSave: row.source_save, itemData: JSON.parse(row.item_json) })
      this.orm.update(schema.vaultItems).set(proj).where(eq(schema.vaultItems.vaultId, row.vault_id)).run()
    }
  }

  #ensureCursorSecret() {
    let secretRow = this.orm.select({ value: schema.vaultMetadata.value }).from(schema.vaultMetadata).where(eq(schema.vaultMetadata.key, 'cursor_hmac_secret')).get()
    if (!secretRow) {
      const secret = crypto.randomBytes(32).toString('base64url')
      this.orm.insert(schema.vaultMetadata).values({ key: 'cursor_hmac_secret', value: secret }).run()
      this.cursorSecret = secret
    } else {
      this.cursorSecret = secretRow.value
    }
  }

  #replaceSortIndexes() {
    this.db.exec(`
      DROP INDEX IF EXISTS vault_items_sort_date;
      DROP INDEX IF EXISTS vault_items_sort_name;
      DROP INDEX IF EXISTS vault_items_sort_type;
      DROP INDEX IF EXISTS vault_items_sort_rarity;
      DROP INDEX IF EXISTS vault_items_sort_source;
      DROP INDEX IF EXISTS vault_items_sort_type_asc;
      DROP INDEX IF EXISTS vault_items_sort_type_desc;
      DROP INDEX IF EXISTS vault_items_sort_rarity_asc;
      DROP INDEX IF EXISTS vault_items_sort_rarity_desc;
      DROP INDEX IF EXISTS vault_items_sort_level_asc;
      DROP INDEX IF EXISTS vault_items_sort_level_desc;

      CREATE INDEX vault_items_sort_name ON vault_items(status, display_name_sort, vault_id);
      CREATE INDEX vault_items_sort_source ON vault_items(status, source_save_sort, vault_id);
      CREATE INDEX vault_items_sort_type_asc
        ON vault_items(status, (type_name_sort IS NULL) ASC, type_name_sort ASC, vault_id ASC);
      CREATE INDEX vault_items_sort_type_desc
        ON vault_items(status, (type_name_sort IS NULL) ASC, type_name_sort DESC, vault_id DESC);
      CREATE INDEX vault_items_sort_rarity_asc
        ON vault_items(status, (quality IS NULL) ASC, quality ASC, vault_id ASC);
      CREATE INDEX vault_items_sort_rarity_desc
        ON vault_items(status, (quality IS NULL) ASC, quality DESC, vault_id DESC);
      CREATE INDEX vault_items_sort_level_asc
        ON vault_items(status, (level IS NULL) ASC, level ASC, vault_id ASC);
      CREATE INDEX vault_items_sort_level_desc
        ON vault_items(status, (level IS NULL) ASC, level DESC, vault_id DESC);
    `)
  }

  #createCheckpointManifest(epochId) {
    const directory = path.join(this.backupsRoot, epochId)
    fs.mkdirSync(directory, { recursive: true })
    const checkpointPath = path.join(directory, 'checkpoint.sqlite3')
    const journalPath = path.join(directory, 'transactions.jsonl')
    const manifest = {
      formatVersion: 1, epochId, createdAt: this.now().toISOString(),
      databaseSchemaVersion: SCHEMA_VERSION,
      checkpointFile: 'checkpoint.sqlite3', journalFile: 'transactions.jsonl', startingSequence: 1,
    }
    return { directory, checkpointPath, journalPath, manifest }
  }

  #createCheckpointSync(databaseSchemaVersion = SCHEMA_VERSION) {
    if (this.epoch) return this.epoch
    const epochId = `${timestampForPath(this.now())}_${crypto.randomUUID().slice(0, 8)}`
    const { directory, checkpointPath, journalPath, manifest } = this.#createCheckpointManifest(epochId)
    manifest.databaseSchemaVersion = databaseSchemaVersion
    this.db.prepare('VACUUM INTO ?').run(checkpointPath)
    fs.closeSync(fs.openSync(journalPath, 'a'))
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    this.epoch = { epochId, directory, checkpointPath, journalPath, sequence: 0, previousHash: null }
    return this.epoch
  }

  close() {
    if (this.db.open) this.db.close()
  }

  migrateLegacyJson(legacyPath = path.join(this.savesDir, 'infinite_stash_vault.json')) {
    const marker = this.orm.select({ value: schema.vaultMetadata.value }).from(schema.vaultMetadata).where(eq(schema.vaultMetadata.key, 'legacy_json_migration')).get()
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
      const countRow = this.orm.select({ count: sql`COUNT(*)` }).from(schema.vaultItems).get()
      if (Number(countRow.count) !== 0) {
        throw new Error('Refusing legacy migration into a non-empty vault database')
      }
      for (const entry of entries) this.#insertEntry(entry, 'active', migratedAt)
      this.orm.insert(schema.vaultMetadata).values({ key: 'legacy_json_migration', value: JSON.stringify({ migratedAt, count: entries.length, sourceHash }) }).run()
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
    if (this._checkpointPromise) return this._checkpointPromise
    this._checkpointPromise = (async () => {
      try {
        const epochId = `${timestampForPath(this.now())}_${crypto.randomUUID().slice(0, 8)}`
        const { directory, checkpointPath, journalPath, manifest } = this.#createCheckpointManifest(epochId)
        await this.db.backup(checkpointPath)
        fs.closeSync(fs.openSync(journalPath, 'a'))
        fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
        this.epoch = { epochId, directory, checkpointPath, journalPath, sequence: 0, previousHash: null }
        return this.epoch
      } finally {
        this._checkpointPromise = null
      }
    })()
    return this._checkpointPromise
  }

  async forceCheckpoint() {
    this.epoch = null
    return this.ensureCheckpoint()
  }

  async getRecoveryReference() {
    const epoch = await this.ensureCheckpoint()
    return { epochId: epoch.epochId, sequence: epoch.sequence }
  }

  async restoreRecoveryReference(reference) {
    if (!reference?.epochId || !Number.isInteger(reference.sequence) || reference.sequence < 0) throw new Error('Invalid vault recovery reference')
    const epochDirectory = path.join(this.backupsRoot, reference.epochId)
    if (!fs.existsSync(path.join(epochDirectory, 'checkpoint.sqlite3'))) throw new Error('Vault checkpoint for snapshot not found')
    const token = crypto.randomUUID()
    const restorePath = `${this.databasePath}.restore-${token}`
    const safetyPath = path.join(this.backupsRoot, `restore-before-${timestampForPath(this.now())}_${token}`, 'checkpoint.sqlite3')
    fs.mkdirSync(path.dirname(safetyPath), { recursive: true })
    await this.db.backup(safetyPath)
    replayVaultEpoch(epochDirectory, restorePath, { maxSequence: reference.sequence })
    this.db.close()
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(this.databasePath + suffix, { force: true })
    fs.renameSync(restorePath, this.databasePath)
    this.db = new Database(this.databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = FULL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.orm = drizzle(this.db, { schema })
    this.cursorSecret = this.orm.select({ value: schema.vaultMetadata.value }).from(schema.vaultMetadata).where(eq(schema.vaultMetadata.key, 'cursor_hmac_secret')).get()?.value || null
    this.epoch = null
    return { safetyPath, reference }
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
    this.orm.insert(schema.vaultItems).values({
      ...projection,
      vaultId: entry.vaultId,
      stashedAt: entry.stashedAt,
      sourceSave: entry.sourceSave,
      itemJson: JSON.stringify(normalizeVaultItem(entry.itemData)),
      status,
      updatedAt,
    }).onConflictDoUpdate({
      target: schema.vaultItems.vaultId,
      set: {
        stashedAt: sql`excluded.stashed_at`,
        sourceSave: sql`excluded.source_save`,
        sourceSaveSort: sql`excluded.source_save_sort`,
        displayName: sql`excluded.display_name`,
        displayNameSort: sql`excluded.display_name_sort`,
        typeCode: sql`excluded.type_code`,
        typeName: sql`excluded.type_name`,
        typeNameSort: sql`excluded.type_name_sort`,
        slot: sql`excluded.slot`,
        category: sql`excluded.category`,
        quality: sql`excluded.quality`,
        setName: sql`excluded.set_name`,
        searchText: sql`excluded.search_text`,
        itemJson: sql`excluded.item_json`,
        status: sql`excluded.status`,
        updatedAt: sql`excluded.updated_at`
      }
    }).run()
  }

  list(options = {}) {
    const limitNum = Math.min(Math.max(Number(options.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const query = normalizeListOptions(options)
    const sort = SORTS[query.sort]
    const cursor = decodeCursor(options.cursor, query, this.cursorSecret)
    const conditions = query.statuses.length === 1
      ? [eq(schema.vaultItems.status, query.statuses[0])]
      : [inArray(schema.vaultItems.status, query.statuses)]

    if (query.q) {
      conditions.push(sql`${schema.vaultItems.searchText} LIKE ${'%' + query.q.replace(/[\\%_]/g, '\\$&') + '%'} ESCAPE '\\'`)
    }
    
    if (query.slot !== 'All') conditions.push(eq(schema.vaultItems.slot, query.slot))
    if (query.category !== 'All') conditions.push(eq(schema.vaultItems.category, query.category))
    if (query.setName !== 'All') conditions.push(eq(schema.vaultItems.setName, query.setName))
    if (query.quality !== 'All') conditions.push(eq(schema.vaultItems.quality, Number(query.quality)))
    if (query.minLevel !== null) conditions.push(sql`${schema.vaultItems.level} >= ${query.minLevel}`)
    if (query.maxLevel !== null) conditions.push(sql`${schema.vaultItems.level} <= ${query.maxLevel}`)

    let countTotal;
    if (!cursor) {
      const countRow = this.orm.select({ count: sql`COUNT(*)` }).from(schema.vaultItems).where(and(...conditions)).get()
      countTotal = Number(countRow.count)
    }

    if (cursor) {
      const comparison = query.direction === 'asc' ? sql`>` : sql`<`
      const sortColumn = schema.vaultItems[sort.column]
      
      if (cursor.sortValue === null) {
        if (!sort.nullable) {
          const error = new Error('Invalid or mismatched vault pagination cursor')
          error.statusCode = 400
          throw error
        }
        conditions.push(sql`(${sortColumn} IS NULL AND ${schema.vaultItems.vaultId} ${comparison} ${cursor.vaultId})`)
      } else {
        const nullTransition = sort.nullable ? sql`${sortColumn} IS NULL OR ` : sql``
        conditions.push(sql`(${nullTransition}(${sortColumn}, ${schema.vaultItems.vaultId}) ${comparison} (${cursor.sortValue}, ${cursor.vaultId}))`)
      }
    }

    const orderBy = [];
    const sortColumn = schema.vaultItems[sort.column];
    const directionFn = query.direction === 'asc' ? asc : desc;
    
    if (sort.nullable) {
        orderBy.push(sql`${sortColumn} IS NULL ASC`);
    }
    orderBy.push(directionFn(sortColumn));
    orderBy.push(directionFn(schema.vaultItems.vaultId));

    const rows = this.orm.select().from(schema.vaultItems)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limitNum + 1)
      .all()

    const hasMore = rows.length > limitNum
    const pageRows = hasMore ? rows.slice(0, limitNum) : rows
    return {
      items: pageRows.map(hydrateRow),
      total: countTotal,
      nextCursor: hasMore ? encodeCursor(pageRows.at(-1), query, this.cursorSecret) : null,
    }
  }

  facets() {
    const slots = this.orm.selectDistinct({ value: schema.vaultItems.slot }).from(schema.vaultItems)
      .where(and(eq(schema.vaultItems.status, 'active'), sql`${schema.vaultItems.slot} IS NOT NULL`, sql`${schema.vaultItems.slot} != ''`))
      .orderBy(schema.vaultItems.slot).all().map(r => r.value)
    const sets = this.orm.selectDistinct({ value: schema.vaultItems.setName }).from(schema.vaultItems)
      .where(and(eq(schema.vaultItems.status, 'active'), sql`${schema.vaultItems.setName} IS NOT NULL`, sql`${schema.vaultItems.setName} != ''`))
      .orderBy(schema.vaultItems.setName).all().map(r => r.value)
    const categories = this.orm.selectDistinct({ value: schema.vaultItems.category }).from(schema.vaultItems)
      .where(and(eq(schema.vaultItems.status, 'active'), sql`${schema.vaultItems.category} IS NOT NULL`, sql`${schema.vaultItems.category} != ''`))
      .orderBy(schema.vaultItems.category).all().map(r => r.value)
    
    return { slots, sets, categories }
  }

  count() {
    return Number(this.orm.select({ count: sql`COUNT(*)` }).from(schema.vaultItems).where(eq(schema.vaultItems.status, 'active')).get().count)
  }

  get(vaultId, { includeInactive = false } = {}) {
    const conditions = [eq(schema.vaultItems.vaultId, vaultId)]
    if (!includeInactive) conditions.push(eq(schema.vaultItems.status, 'active'))
    const row = this.orm.select().from(schema.vaultItems).where(and(...conditions)).get()
    return row ? hydrateRow(row) : null
  }

  #findActiveByItemIdentity(entry) {
    const identity = itemIdentity(entry)
    if (!identity) return null
    
    const row = this.orm.select().from(schema.vaultItems).where(
      and(
        sql`${schema.vaultItems.status} IN ('active', 'pending_deposit', 'pending_withdraw')`,
        eq(schema.vaultItems.sourceSave, identity.sourceSave),
        sql`(CAST(json_extract(${schema.vaultItems.itemJson}, '$.id') AS TEXT) = ${identity.itemId} OR CAST(json_extract(${schema.vaultItems.itemJson}, '$.item_seed') AS TEXT) = ${identity.itemId})`
      )
    ).limit(1).get()
    return row ? hydrateRow(row) : null
  }

  async add(entry, { id = operationId() } = {}) {
    if (!entry?.vaultId || !entry?.itemData) throw new Error('Vault entry requires vaultId and itemData')
    await this.ensureCheckpoint()
    let added = null
    const apply = this.db.transaction(() => {
      if (this.get(entry.vaultId, { includeInactive: true })) throw new Error(`Vault item already exists: ${entry.vaultId}`)
      if (this.#findActiveByItemIdentity(entry)) {
        const error = new Error(`Item identity already exists in the vault: ${entry.sourceSave}`)
        error.statusCode = 409
        throw error
      }
      this.#appendJournal({ operationId: id, phase: 'intent', operation: 'deposit', entry })
      this.#insertEntry(entry)
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: 'deposit', appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: 'deposit' })
      added = this.get(entry.vaultId)
    })
    apply()
    return added
  }

  async update(entry, { id = operationId() } = {}) {
    await this.ensureCheckpoint()
    let updated = null
    const apply = this.db.transaction(() => {
      const current = this.get(entry?.vaultId, { includeInactive: true })
      if (!current) return
      this.#appendJournal({ operationId: id, phase: 'intent', operation: 'metadata_update', entry })
      this.#insertEntry(entry, current.status)
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: 'metadata_update', appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: 'metadata_update' })
      updated = this.get(entry.vaultId, { includeInactive: true })
    })
    apply()
    return updated
  }

  async markPendingWithdraw(vaultId, { id = operationId() } = {}) {
    await this.ensureCheckpoint()
    let updated = null
    const apply = this.db.transaction(() => {
      const entry = this.get(vaultId, { includeInactive: true })
      if (!entry) return
      if (entry.status !== 'active') throw new Error(`Cannot withdraw item in status: ${entry.status}`)
      this.#appendJournal({ operationId: id, phase: 'intent', operation: 'pending_withdraw', entry })
      this.orm.update(schema.vaultItems).set({ status: 'pending_withdraw', updatedAt: this.now().toISOString() }).where(eq(schema.vaultItems.vaultId, vaultId)).run()
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: 'pending_withdraw', appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: 'pending_withdraw' })
      updated = this.get(vaultId, { includeInactive: true })
    })
    apply()
    return updated
  }

  async recover(vaultId, { id = operationId() } = {}) {
    await this.ensureCheckpoint()
    let updated = null
    const apply = this.db.transaction(() => {
      const entry = this.get(vaultId, { includeInactive: true })
      if (!entry) return
      if (entry.status !== 'pending_withdraw') throw new Error(`Cannot recover item in status: ${entry.status}`)
      this.#appendJournal({ operationId: id, phase: 'intent', operation: 'recover', entry })
      this.orm.update(schema.vaultItems).set({ status: 'active', updatedAt: this.now().toISOString() }).where(eq(schema.vaultItems.vaultId, vaultId)).run()
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: 'recover', appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: 'recover' })
      updated = this.get(vaultId)
    })
    apply()
    return updated
  }

  async retire(vaultId, { reason = 'delete', id = operationId() } = {}) {
    await this.ensureCheckpoint()
    let updated = null
    const apply = this.db.transaction(() => {
      const entry = this.get(vaultId, { includeInactive: true })
      if (!entry) return
      this.#appendJournal({ operationId: id, phase: 'intent', operation: reason, entry })
      const status = reason === 'withdraw' ? 'withdrawn' : 'deleted'
      this.orm.update(schema.vaultItems).set({ status, updatedAt: this.now().toISOString() }).where(eq(schema.vaultItems.vaultId, vaultId)).run()
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: reason, appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: reason })
      updated = this.get(vaultId, { includeInactive: true })
    })
    apply()
    return updated
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
      while (ids.has(entry.vaultId) || this.orm.select({ vaultId: schema.vaultItems.vaultId }).from(schema.vaultItems).where(eq(schema.vaultItems.vaultId, entry.vaultId)).get()) {
        entry.vaultId = `stash_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
      }
      ids.add(entry.vaultId)
    }
    await this.ensureCheckpoint()
    const id = operationId()
    let addedCount = 0
    const apply = this.db.transaction(() => {
      this.#appendJournal({ operationId: id, phase: 'intent', operation: 'import', entries: normalized })
      for (const entry of normalized) {
        this.#insertEntry(entry)
        addedCount++
      }
      this.orm.insert(schema.appliedOperations).values({ operationId: id, operation: 'import', appliedAt: this.now().toISOString() }).run()
      this.#appendJournal({ operationId: id, phase: 'commit', operation: 'import' })
    })
    apply()
    return { addedCount }
  }

  exportEntries() {
    return this.orm.select().from(schema.vaultItems).where(eq(schema.vaultItems.status, 'active')).orderBy(desc(schema.vaultItems.stashedAt), desc(schema.vaultItems.vaultId)).all().map(hydrateRow)
  }

  integrityCheck() {
    return this.db.pragma('integrity_check', { simple: true })
  }
}
