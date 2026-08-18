import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { projectVaultEntry } from './vaultProjection.js'
import { normalizeVaultItem } from './itemImageResolver.js'

function checksumFor(record) {
  const { checksum: _checksum, ...content } = record
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

export function readVaultJournal(journalPath) {
  if (!fs.existsSync(journalPath)) return { records: [], unresolved: [], truncated: false }
  const source = fs.readFileSync(journalPath, 'utf8')
  const lines = source.split('\n')
  const records = []
  let previousHash = null
  let expectedSequence = 1
  let truncated = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) continue
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      if (index === lines.length - 1) {
        truncated = true
        break
      }
      throw new Error(`Invalid vault journal line ${index + 1}: ${error.message}`)
    }
    if (record.sequence !== expectedSequence) throw new Error(`Vault journal sequence gap at ${record.sequence}; expected ${expectedSequence}`)
    if (record.previousHash !== previousHash) throw new Error(`Vault journal hash chain mismatch at sequence ${record.sequence}`)
    if (record.checksum !== checksumFor(record)) throw new Error(`Vault journal checksum mismatch at sequence ${record.sequence}`)
    records.push(record)
    previousHash = record.checksum
    expectedSequence++
  }

  const intents = new Map()
  const commits = new Set()
  for (const record of records) {
    if (record.phase === 'intent') intents.set(record.operationId, record)
    if (record.phase === 'commit') commits.add(record.operationId)
  }
  return {
    records,
    truncated,
    unresolved: [...intents.values()].filter((record) => !commits.has(record.operationId)),
  }
}

function insertEntry(db, entry, status, updatedAt) {
  const projection = projectVaultEntry(entry)
  const supportsSortKeys = db.prepare("SELECT 1 FROM pragma_table_info('vault_items') WHERE name = 'display_name_sort'").get()
  const columns = [
    ['vault_id', 'vaultId'],
    ['stashed_at', 'stashedAt'],
    ['source_save', 'sourceSave'],
    ['display_name', 'displayName'],
    ['type_code', 'typeCode'],
    ['type_name', 'typeName'],
    ['slot', 'slot'],
    ['category', 'category'],
    ['quality', 'quality'],
    ['set_name', 'setName'],
    ['search_text', 'searchText'],
    ['item_json', 'itemJson'],
    ['status', 'status'],
    ['updated_at', 'updatedAt'],
  ]
  if (supportsSortKeys) {
    columns.splice(3, 0, ['source_save_sort', 'sourceSaveSort'])
    columns.splice(5, 0, ['display_name_sort', 'displayNameSort'])
    columns.splice(8, 0, ['type_name_sort', 'typeNameSort'])
  }
  const columnSql = columns.map(([column]) => column).join(', ')
  const valueSql = columns.map(([, parameter]) => '@' + parameter).join(', ')
  const updateSql = columns.slice(1).map(([column]) => column + ' = excluded.' + column).join(', ')
  db.prepare(`
    INSERT INTO vault_items (${columnSql})
    VALUES (${valueSql})
    ON CONFLICT(vault_id) DO UPDATE SET ${updateSql}
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
function applyIntent(db, intent, status = null) {
  const applied = db.prepare('SELECT 1 FROM applied_operations WHERE operation_id = ?').get(intent.operationId)
  if (applied) return
  const timestamp = intent.timestamp
  if (intent.operation === 'deposit') insertEntry(db, intent.entry, status || 'active', timestamp)
  if (intent.operation === 'metadata_update') insertEntry(db, intent.entry, status || 'active', timestamp)
  if (intent.operation === 'import') {
    for (const entry of intent.entries || []) insertEntry(db, entry, status || 'active', timestamp)
  }
  if (intent.operation === 'withdraw' || intent.operation === 'delete') {
    if (status === 'recovery_needed') insertEntry(db, intent.entry, status, timestamp)
    else db.prepare('UPDATE vault_items SET status = ?, updated_at = ? WHERE vault_id = ?')
      .run(intent.operation === 'withdraw' ? 'withdrawn' : 'deleted', timestamp, intent.entry.vaultId)
  }
  if (!status) db.prepare('INSERT OR IGNORE INTO applied_operations(operation_id, operation, applied_at) VALUES (?, ?, ?)')
    .run(intent.operationId, intent.operation, timestamp)
}

export function replayVaultEpoch(epochDirectory, destinationPath) {
  const checkpointPath = path.join(epochDirectory, 'checkpoint.sqlite3')
  const journalPath = path.join(epochDirectory, 'transactions.jsonl')
  if (!fs.existsSync(checkpointPath)) throw new Error('Vault checkpoint is missing')
  if (fs.existsSync(destinationPath)) throw new Error(`Recovery destination already exists: ${destinationPath}`)
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.copyFileSync(checkpointPath, destinationPath)

  const journal = readVaultJournal(journalPath)
  const db = new Database(destinationPath)
  try {
    const initialIntegrity = db.pragma('integrity_check', { simple: true })
    if (initialIntegrity !== 'ok') throw new Error(`Checkpoint integrity check failed: ${initialIntegrity}`)
    const intents = new Map(journal.records.filter((record) => record.phase === 'intent').map((record) => [record.operationId, record]))
    const commits = journal.records.filter((record) => record.phase === 'commit')
    const replay = db.transaction(() => {
      for (const commit of commits) {
        const intent = intents.get(commit.operationId)
        if (!intent) throw new Error(`Commit ${commit.operationId} has no matching intent`)
        applyIntent(db, intent)
      }
      for (const intent of journal.unresolved) applyIntent(db, intent, 'recovery_needed')
    })
    replay()
    const finalIntegrity = db.pragma('integrity_check', { simple: true })
    if (finalIntegrity !== 'ok') throw new Error(`Recovered database integrity check failed: ${finalIntegrity}`)
    const activeCount = db.prepare("SELECT COUNT(*) AS count FROM vault_items WHERE status = 'active'").get().count
    return { destinationPath, activeCount, applied: commits.length, unresolved: journal.unresolved.length, truncated: journal.truncated }
  } catch (error) {
    db.close()
    fs.rmSync(destinationPath, { force: true })
    throw error
  } finally {
    if (db.open) db.close()
  }
}
