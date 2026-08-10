# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

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
