# Architecture and safety notes

## Runtime boundary

The React/Vite client provides the inspection and organization UI. Zustand holds client UI state such as the active tab and selected save. TanStack Query manages server-backed vault, shared-stash, and search requests.

The Vite middleware exposes local endpoints for listing, parsing, backing up, and mutating save files. `CustomD2Parser.cjs` is only a thin process adapter. `D2RStashWorker` is the sole production read/write engine for `.d2s` and `.d2i` serialization and is built from the sibling D2SSharp checkout pinned by `D2SSharp.lock.json`.

Generated worker binaries under `D2RStashWorker/bin/`, `D2RStashWorker/obj/`, and `server/bin/` are reproducible build outputs and are not source artifacts.

## Process lock

The server checks for `D2R.exe` through the Windows process list. The status endpoint and every save-mutating route apply this protection independently. When D2R is running, inspection may continue but writes are rejected and the UI displays the red locked banner.

## Infinite Stash persistence

`infinite_stash_vault.sqlite3` is the authoritative vault store. The server uses `better-sqlite3` with the repository’s Drizzle schema/query definitions. Routine listing, filtering, and search are server-side and cursor-paginated; the browser does not load the complete vault into local storage.

The first vault mutation in a server session creates one checkpoint under `backups/vault/<epoch>/`. Later mutations append checksummed intent/commit records to that epoch’s `transactions.jsonl` rather than copying the database for every operation.

Transfer ordering is deliberately asymmetric:

- Deposit: backup, persist and journal the vault entry, then remove the item from the source save.
- Withdrawal: keep the vault entry active until D2SSharp confirms placement in the destination save.

This ordering means ambiguous failures can be recovered as duplicates instead of becoming item loss.

## Recovery and migration

Vault recovery replays a checkpoint and journal into a new database, validates SQLite integrity and journal sequence/checksums, and applies committed operations idempotently. Incomplete operations remain marked `recovery_needed`. An existing live database is never overwritten automatically.

Legacy `infinite_stash_vault.json` migration validates the complete document before importing it in one SQLite transaction. The original JSON is preserved, and a copy plus migration report is written under `backups/vault-legacy-migration_<timestamp>/`.

## Development validation

Run the relevant checks after changes:

```powershell
npm run test:vault
npm run build
npm run lint
npm test
.\scripts\test-d2r-worker.ps1
```

Worker tests must use copies of `.d2s`/`.d2i` fixtures in uniquely named isolated backup directories. They cover parse/write/parse round trips, checksum and declared-size validity, add/remove operations, and repeated parsing. Temporary directories are cleaned up in `finally` blocks.
