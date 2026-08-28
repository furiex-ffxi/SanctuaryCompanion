# Using Sanctuary Companion

## Install and launch

1. Install Node.js on Windows.
2. Clone this repository.
3. Place the pinned D2SSharp checkout beside it and check out the commit recorded in `D2SSharp.lock.json`.
4. From the repository directory, run:

   ```powershell
   npm install
   npm run dev
   ```

5. Open the local Vite URL in a browser.

The app reads the configured D2R save directory. If your saves are in a different location, update the local server configuration before launching; do not point tests at a live save directory.

## Inspect a character

Use the **Character Inspector** tab and choose a `.d2s` file from the save picker. The view includes equipment and alternate weapon slots; character attributes, combat stats, gold, active set bonuses, and resistances; inventory, personal stash, cube, and skills tabs; plus item tooltips and optional local item sprites.

Use the difficulty selector in the stats panel to see resistance values for Normal, Nightmare, or Hell.

## Browse shared stash

Open **Shared Stash** and select a `.d2i` file. Use the page tabs to move between shared-stash pages. A `.d2i` file can also be uploaded for local inspection; an uploaded file is not written back to disk unless you explicitly use a supported save operation.

## Use Infinite Stash

The **Infinite Stash** tab provides a paginated, searchable vault. Items can be returned to a character’s personal stash or to the selected shared stash. The vault also supports JSON import/export for portability and legacy migration.

For any operation that changes a save:

1. Exit D2R completely or return to the main menu.
2. Confirm the app no longer shows the red game-running lock.
3. Let the app create its safety backup.
4. Perform one transfer at a time and wait for the success/failure toast.

If a transfer reports an ambiguous failure, keep the vault entry and review the backup/recovery information before retrying. The app favors a recoverable duplicate over silently losing an item.

## Item artwork

Game artwork is not bundled because the extracted assets do not have a redistribution license. To use artwork privately, run:

```powershell
python scripts/extract-d2r-item-assets.py
npm run dev
```

The default cache is `.d2r-item-assets/`. You can choose another local cache with `D2R_ITEM_ASSET_DIR`.

## Troubleshooting

- **Game Running (Locked):** close D2R or leave the active game before changing saves.
- **No character appears:** verify that the save is a `.d2s` file in the configured save directory, or upload it with **Browse...**.
- **Shared stash is empty:** choose the correct `.d2i` variant or upload the file directly.
- **Missing item images:** install the optional private artwork cache; parsing and item management still work without it.
- **Worker errors:** verify the sibling D2SSharp checkout and pinned commit, then rebuild the worker with `scripts/build-d2r-worker.ps1`.
