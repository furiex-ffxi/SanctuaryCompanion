# Sanctuary Companion

Sanctuary Companion is a local React/Vite companion for Diablo II: Resurrected. It inspects character and shared-stash saves, moves items through the pinned D2SSharp worker, and provides a searchable Infinite Stash backed by SQLite.

## Development

Install dependencies and start the local server:

```powershell
npm install
npm run dev
```

Production and static validation commands:

```powershell
npm run build
npm run lint
npm run test:vault
```

## D2SSharp worker

The worker is built from the pinned sibling checkout described by `D2SSharp.lock.json`, rather than a floating NuGet package. Clone `https://github.com/ResurrectedTrader/D2SSharp.git` beside this repository and check out `f26f21897db5c0075e74defca1e31d1930080750` (add that repository as `upstream` if working from your own fork).

Publish the sole runtime worker output with:

```powershell
.\scripts\build-d2r-worker.ps1
```

Run its integration test with:

```powershell
.\scripts\test-d2r-worker.ps1
```

The test uses D2R `.d2s`/`.d2i` fixtures only after copying them into a uniquely named `Saved Games/Diablo II Resurrected/backups/E2E_BACKUP_TEST_TEMP_*` directory. It tests round trips, save checksum/file-size validity, add/remove operations, and repeated parsing; the directory is removed in `finally` on completion or failure.

## Infinite Stash persistence and recovery

The Infinite Stash is stored in `infinite_stash_vault.sqlite3` in the D2R save directory. The first vault mutation after each dev-server start creates one SQLite checkpoint under `backups/vault/<epoch>/`; subsequent mutations append checksummed intent/commit records to that epoch's `transactions.jsonl`.

Normal reads are cursor-paginated in batches of 100. Search, rarity, set, category, and slot filtering execute in SQLite; the browser no longer mirrors the complete vault in `localStorage`.

On first launch after upgrading, `infinite_stash_vault.json` is transactionally imported. The original JSON remains in place and an additional copy plus migration report is written under `backups/vault-legacy-migration_*`.

Validate persistence changes with:

```powershell
npm run test:vault
```

Replay a checkpoint and its journal into a separate recovery database with:

```powershell
npm run replay:vault -- "C:\path\to\backups\vault\<epoch>" "C:\path\to\recovered.sqlite3"
```

Replay never overwrites an existing database. It validates the checkpoint, journal sequence and checksum chain, replays committed operations idempotently, preserves incomplete operations as `recovery_needed`, and validates the recovered database. Review the result before replacing a live database.

### Transfer safety

- Every mutating endpoint independently rejects requests while `D2R.exe` is running.
- Deposits are persisted and journaled before D2SSharp removes the source item.
- Withdrawals remain in the vault until D2SSharp confirms destination placement.
- Save backups must succeed before a transfer begins.
- Ambiguous failures preserve the vault entry and may produce a recoverable duplicate rather than risk item loss.

### Legacy migration

On the first server start with an existing `infinite_stash_vault.json`, migration validates the complete document and imports it in one SQLite transaction. Duplicate IDs or malformed entries abort the migration. The source JSON remains untouched, and an additional copy plus `migration-report.json` is stored under `backups/vault-legacy-migration_<timestamp>/`.
