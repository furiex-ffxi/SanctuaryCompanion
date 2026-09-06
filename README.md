# Sanctuary Companion

Sanctuary Companion is a local companion app for **Diablo II: Resurrected**. It gives you a searchable view of your characters and stashes, makes item details easier to inspect, and provides an Infinite Stash vault for organizing items across saves.

It runs locally in your browser and works with the save files already on your machine. It is designed for single-player / offline save management and does not connect to Battle.net.

## What it does

- Inspect character stats, equipment, inventory, stash, cube, skills, and resistance breakdowns.
- Browse and search D2R shared stash pages.
- Move items between character/shared stash saves and the Infinite Stash vault, with safety checks and backups around mutations.
- Search across characters, shared stash, and the Infinite Stash from one global search box.
- View Terror Zone timing information and other companion utilities.
- Keep the Infinite Stash in a local SQLite database instead of mirroring the whole vault in browser storage.

## Screenshots

### Character Inspector

![Character Inspector](docs/assets/character-inspector.png)

### Shared Stash

![Shared Stash](docs/assets/shared-stash.png)

### Infinite Stash

![Infinite Stash](docs/assets/infinite-stash.png)

> The screenshots were captured from a local save directory. The red **Game Running (Locked)** state is intentional: save-changing actions are disabled while D2R is running to reduce the risk of corruption.

## Quick start

Requirements:

- Windows with Diablo II: Resurrected save files available locally.
- Node.js and npm.
- A sibling checkout of [D2SSharp](https://github.com/ResurrectedTrader/D2SSharp) for the save worker.

Install dependencies and start the local app:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.

Before moving items, exit D2R to unlock save mutations. On first use, select a character or shared stash file from the controls in the header. You can also use **Browse...** / **Upload .d2i...** to inspect a save file manually.

To enable private local item artwork, run:

```powershell
python scripts/assets/extract-d2r-item-assets.py
```

The artwork cache is intentionally ignored by Git and should not be redistributed.

## Multi-Machine Save Sync (Desktop ↔ Laptop)

SanctuaryCompanion supports peer-to-peer save synchronization between two machines so you can play on either device without losing character progression or stash items. Either machine can act as the **host** or the **client** via `.env`.

### 1. Host Machine Setup (e.g. Desktop)
The host owns the authoritative Infinite Stash SQLite database and listens for sync requests over LAN.

Create a `.env` file (see `.env.example`):
```env
SANCTUARY_SYNC_HOST=true
SANCTUARY_MACHINE_ID=desktop
```
Run `npm run dev`. The server binds to `0.0.0.0:5173` to be accessible on your local network. Find your host's local IP address (e.g. via `ipconfig` -> `192.168.1.100`).

### 2. Client Machine Setup (e.g. Laptop)
The client keeps local copies of save files and transparently proxies Infinite Stash vault operations (`/__vault/*`) and item search (`/__item_search`) to the host.

Create a `.env` file on the client machine (you can use your host's computer name or its IP):
```env
# You can use the Windows computer name (great for DHCP) or LAN IP:
SANCTUARY_SYNC_URL=http://my-desktop:5173
# Or if mDNS is preferred: SANCTUARY_SYNC_URL=http://my-desktop.local:5173
SANCTUARY_MACHINE_ID=laptop
```
Run `npm run dev` and open `http://localhost:5173`.

### 3. Syncing Save Files
- When running in client mode, the header toolbar displays a host connectivity indicator (`Host: desktop`) and a **🔄 Sync Now** button.
- Click **Sync Now** before playing on a different machine.
- Save files (`.d2s` and `.d2i`) are compared using SHA-256 hashes and modification timestamps. Newer files are pulled/pushed accordingly.
- **Safety Backups:** Before any save file is overwritten during a sync, a timestamped snapshot is automatically created under `Saved Games/Diablo II Resurrected/backups/pre-sync-*`.
- **Lock Guard:** Diablo II: Resurrected must be closed on the syncing machine before syncing will proceed.

## Documentation

- [User guide](docs/usage.md) — setup, daily workflows, transfers, backups, and troubleshooting.
- [Architecture](docs/architecture.md) — worker boundary, server routes, SQLite vault, recovery, and testing strategy.

## Validation

```powershell
npm run build
npm run lint
npm test
```

`npm test` includes a production-browser smoke test. If Chrome is not installed locally, run `npx puppeteer browsers install chrome` first (or set `PUPPETEER_EXECUTABLE_PATH`).

If an interrupted dev server or test run leaves local processes behind, run `npm run cleanup:dev` before restarting the app. It only targets this repository's Node processes and port 5173.

The worker integration tests use isolated copies of save fixtures and clean up their temporary directories after each run. See the [architecture notes](docs/architecture.md) for the full validation matrix.

## License

See [LICENSE](LICENSE).
