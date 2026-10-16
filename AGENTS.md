# Agent Notes

This document captures project-specific context for AI agents working on this repo.

## Project

Custom Obsidian plugin written in TypeScript. It is intentionally modular: each feature lives in its own module under `src/modules/`, following a shared `PluginModule` contract. The top-level plugin loads modules, persists per-module settings, and renders a tabbed settings page.

## Quick Commands

```bash
npm install          # install dependencies
npm run build        # typecheck + bundle into dist/
npm run dev          # watch mode (rebuilds dist/ on TS changes)
npm run bump -- patch|minor|major   # bump version, commit, and tag
```

## Architecture

```
src/
  main.ts              # plugin entry point; registers modules
  module.ts            # PluginModule contract + SettingsContainer type
  plugin-host.ts       # loads modules, owns settings persistence
  settings/
    settings-host.ts   # tabbed settings UI
  modules/
    <name>/
      index.ts         # module factory + feature code
      settings.ts      # module settings interface + defaults
      styles.css       # module styles (concatenated at build)
      *.svg            # imported as text if needed

dist/                  # build output consumed by Obsidian
  main.js
  manifest.json
  styles.css
```

## Module Contract

Every module exports a factory:

```ts
export function createMyModule(
  plugin: Plugin,
  settings: SettingsContainer<MySettings>
): PluginModule
```

Required module properties:

- `id` — unique string, used as settings key
- `name` — displayed in the settings tab
- `load()` — register commands, events, UI
- `unload()` — cleanup
- `renderSettings(container)` — render module-specific settings

The host automatically injects `enabled: true` into every module's settings. Modules do not need to declare it unless they want a different default.

## Adding a Module

1. Create `src/modules/<name>/`.
2. Add `settings.ts` with interface and `DEFAULT_<NAME>_SETTINGS`.
3. Add `index.ts` exporting `create<Name>Module`.
4. (Optional) Add `styles.css` and/or static assets like `.svg`.
5. Import and append to `MODULES` in `src/main.ts`.
6. Run `npm run build`.

## Settings Persistence

Settings are stored in Obsidian's `data.json` keyed by module ID:

```json
{
  "drawio-quick-action": { "enabled": true }
}
```

Use `settings.get()`, `settings.set()`, and `settings.update()` from within a module. The host persists the full settings object on every change.

## Build Pipeline

- `esbuild` bundles `src/main.ts` into `dist/main.js`.
- A custom esbuild plugin concatenates every `src/**/styles.css` into `dist/styles.css`.
- `manifest.json` is copied into `dist/` during build.
- TypeScript is typechecked with `tsc -noEmit -skipLibCheck`.

## Release Flow

1. Run `npm run bump -- patch|minor|major`.
2. Push the commit and tag: `git push && git push --tags`.
3. GitHub Actions builds `dist/`, creates a release, and attaches `dist/*`.

## Local Testing

Symlink `dist/` into an Obsidian vault:

```bash
VAULT_PATH="/path/to/vault"
ln -sfn "$(pwd)/dist" "$VAULT_PATH/.obsidian/plugins/custom-obsidian-plugin"
```

Then launch Obsidian with that vault:

```bash
/Applications/Obsidian.app/Contents/MacOS/Obsidian --vault="$VAULT_PATH"
```

After rebuilding, reload Obsidian with `Cmd+R` / `Ctrl+R`.

## Conventions

- Prefer boring, explicit code. Avoid unnecessary abstractions.
- Keep modules self-contained; the host should not know module internals.
- Do not import `node:*` prefixed modules; use plain Node builtins (e.g., `child_process`) so esbuild externalizes them correctly.
- Static assets like SVG templates should be imported as text. `esbuild.config.mjs` loads `.svg` as text.
- Generated files (`dist/`, `main.js`, `styles.css`) are gitignored.

## Current Modules

- `drawio-quick-action` — create `.drawio.svg` diagrams and open them in the draw.io desktop app.
- `url-formatter` — format pasted URLs into Markdown links using custom regex patterns, with optional title fetching.
