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
