# Project Guidelines & Rules for SanctuaryCompanion

## 1. Save & Stash File Testing Rules (.d2s / .d2i)
- **Never Mutate Live Save Files**: All automated unit, integration, or end-to-end tests MUST operate strictly on copies created within isolated subdirectories under `Saved Games/Diablo II Resurrected/backups/`.
- **Test File Cleanup**: Temporary test directories (for example, `E2E_BACKUP_TEST_TEMP_<guid>`) MUST be removed automatically in a `finally` block after success or failure.
- **Required Coverage**: Save/stash worker tests must cover parse-to-write-to-parse round trips, `.d2s` checksum and declared file-size validity, add/remove operations, and repeated parsing. Use `scripts/test-d2r-worker.ps1` as the baseline workflow.

## 2. Server Middleware & Binary Serialization
- **Single Engine Ownership**: `D2SSharp` is the sole production read/write engine for `.d2s` and `.d2i` files. Vite middleware must use `CustomD2Parser.cjs` only as a thin process adapter to `D2RStashWorker`; do not reintroduce JavaScript or Go/WASM production writers/parsers.
- **Pinned Source Dependency**: Build the worker from the sibling D2SSharp checkout and commit recorded in `D2SSharp.lock.json`, never from a floating NuGet package. Run `scripts/build-d2r-worker.ps1` to publish `server/bin/` and its `worker-version.json` metadata.
- **Artifact Hygiene**: Do not commit `D2RStashWorker/bin/`, `D2RStashWorker/obj/`, or generated `server/bin/` worker artifacts. They are reproducible outputs.
- **Constants Array Safety**: When initializing or extending item stat metadata arrays (for example, `constants.magical_properties`), never use an unbounded loop or mutate a shared package cache. Clone and use an explicitly bounded length.

## 3. Process Lock Protections
- Ensure production process checks (`tasklist /FI "IMAGENAME eq D2R.exe"`) remain active in the dev-server status endpoint (`/__d2r_status`) and all save-mutating endpoints to prevent corruption while Diablo II Resurrected is running.

## 4. Infinite Stash Persistence
- **SQLite Authority**: `infinite_stash_vault.sqlite3` is the authoritative Infinite Stash store. Do not reintroduce whole-vault JSON or `localStorage` persistence. JSON remains an import/export and legacy-migration format only.
- **Checkpoint and Journal**: The first vault mutation in each server session must create one SQLite checkpoint under `backups/vault/<epoch>/`. Later mutations append checksummed intent/commit records to that epoch's `transactions.jsonl`; do not copy the database for every operation.
- **Safe Ordering**: Deposit intent and item data must be durable before D2SSharp removes an item from its source. A withdrawal must remain active in SQLite until D2SSharp confirms placement. Ambiguous failures must favor a recoverable duplicate over item loss.
- **Replay Safety**: Recovery must replay into a new database, validate SQLite integrity plus journal sequence/checksums, apply operations idempotently, and preserve incomplete operations as `recovery_needed`. Never overwrite a live database automatically.
- **Legacy Migration**: Import `infinite_stash_vault.json` transactionally and idempotently. Preserve the original file and create a migration report; malformed input must abort without partial imports.
- **Bounded UI/API Work**: Keep vault listing, search, and filters server-side and paginated. Do not load, transfer, or render the complete vault during routine navigation or single-item mutations.
- **Required Validation**: Run `npm run test:vault`, `npm run build`, and `scripts/test-d2r-worker.ps1` after persistence or transfer-flow changes. Vault tests must use isolated temporary directories and must never point at the live save directory.
