# Pokemon Shiny Hunt Assistant

Electron + React + TypeScript desktop app foundation for Pokemon shiny hunting workflows.

## Architecture overview

- **UI layer (React renderer):** dashboard, config, history, settings tabs.
- **Core hunt engine:** event-driven session lifecycle and shiny handling.
- **Adapters:** `MockEmulatorAdapter` + stubs for `CitraAdapter` and `AzaharAdapter`.
- **Adapter status:** `CitraAdapter` and `AzaharAdapter` are currently scaffolds only (no live memory/process integration yet).
- **Services:** screenshot placeholder capture, local desktop notifications, Discord webhooks.
- **Storage:** JSON persistence for settings + hunt session history.

## Project structure

```text
src/
  adapters/
  core/
  main/
  profiles/
  renderer/
  services/
  shared/
  storage/
  types/
```

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Quality checks

```bash
npm run typecheck
npm run build
```

## Troubleshooting (`concurrently` not found)

If you still see errors like `'concurrently' is not recognized` or `Cannot find module '@vitejs/plugin-react'`, your local install is missing dev dependencies. Run:

```bash
npm install --include=dev
npm run doctor:dev
npm run dev
```

If `react` / `react-dom` are still unresolved, do a clean reinstall:

```bash
rm -rf node_modules package-lock.json
npm install --include=dev
npm run dev
```

If npm fails with `EBUSY` while updating Electron on Windows, close all running `electron.exe` / `node.exe` processes (Task Manager), then retry install:

```bash
npm install --include=dev
```

If `npm run dev` fails with `spawn EINVAL` on newer Node versions (e.g. Node 24 on Windows), update to the latest `scripts/dev.mjs` and retry.

If `tsconfig.main.json` is missing, the dev runner will automatically fall back to a legacy Electron startup (`dev:electron:legacy`) so renderer + Electron can still run (expects `electron/main.cjs`).

If Electron shows `Cannot find module 'pngjs'`, run:

```bash
npm install pngjs
```