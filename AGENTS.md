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