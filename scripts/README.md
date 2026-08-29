# Repository scripts

The scripts directory contains repeatable repository tooling, grouped by the
system it supports:

- `dev/` — local development-server startup and cleanup.
- `worker/` — build and integration-test helpers for the pinned D2SSharp worker.
- `test/` — browser and asset validation runners.
- `vault/` — Infinite Stash backup and recovery tooling.
- `assets/` — tools that extract or prepare game assets.
- `tz-*.mjs` — exploratory or reverse-engineering utilities; these are not
  part of the production server path and remain at the top level for now.

Add a script to the narrowest applicable folder and expose it through an npm
script when it is a supported developer or CI workflow. Keep production code
in `src/` or `server/`; scripts should orchestrate existing application code,
not become a second implementation of it.
