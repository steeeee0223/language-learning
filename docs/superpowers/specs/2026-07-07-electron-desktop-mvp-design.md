# Electron Desktop MVP Design

## Summary

Turn the existing local-first Next.js language-learning app into a quick Electron desktop MVP for trusted macOS use, while avoiding choices that block Windows or Linux later.

The MVP keeps the current Next.js app as the product core. Electron acts as a desktop shell that starts a local Next server, opens the app in a secure `BrowserWindow`, and supplies desktop settings such as the active data folder. Codex remains the only working AI provider for the MVP, but generation and status code should be shaped around a provider boundary so Claude or other providers can be added later.

This design intentionally postpones public distribution concerns: signing, notarization, auto-updates, installers, and full packaged-app automation are out of scope.

## Goals

- Launch the app as a double-clickable desktop app on trusted macOS machines.
- Preserve the existing Next.js pages, API routes, task model, and local file storage behavior.
- Default desktop data storage to Electron's app data directory.
- Let the user choose a custom data root from settings.
- Keep Codex as the only implemented provider while preparing clean boundaries for later providers.
- Keep test and packaging work light enough for a fast MVP.

## Non-Goals

- Public app distribution.
- Code signing, notarization, auto-update, or installer polish.
- Windows or Linux packaging in the first version.
- Bundling or managing Codex credentials inside the app.
- Implementing Claude or another provider in the MVP.
- Rewriting the backend into Electron IPC handlers.
- Automatic migration from the repo `.local` folder.

## Architecture

Electron will wrap the existing app instead of replacing its server architecture.

The Electron main process will:

- choose a free localhost port;
- construct desktop-specific environment variables before server startup;
- start the local Next server in production mode;
- load `next dev` or a development URL during desktop development;
- create a secure `BrowserWindow`;
- store desktop settings, including the selected data root;
- expose narrow desktop functions through a preload bridge;
- shut down the local server when the app exits.

The existing Next.js app will remain responsible for:

- React pages and UI behavior;
- API routes;
- story, task, lesson, and error files;
- YouTube transcript fetching;
- Codex status and lesson generation;
- Notion export.

This keeps the MVP close to the current codebase and avoids a broad rewrite of working server code.

## Components

### Electron Main Entry

Owns the app lifecycle, local server startup and shutdown, window creation, and basic app menu behavior. It should be small and should not contain lesson, task, transcript, or provider domain logic.

### Electron Preload Bridge

Exposes a typed, minimal API to the renderer. The bridge should support only named operations needed by the desktop UI, such as reading desktop settings, choosing a data folder, opening the active data folder, and reporting desktop warnings.

`nodeIntegration` stays disabled and `contextIsolation` stays enabled.

### Desktop Settings Store

Persists desktop-only preferences outside the lesson data model. For MVP, this store only needs the selected data root and any startup warning state needed by the UI. Future provider preferences can use the same desktop settings boundary.

### Desktop Settings UI

Adds a small UI surface where the user can:

- see the active data root;
- choose a custom data folder;
- open the active data folder;
- see Codex setup/status guidance.

Changing the data folder requires restart in the MVP.

### Server Adapter

Starts the Next server and returns the URL loaded by Electron. It should handle development and production modes explicitly and keep port selection and environment construction in one place.

### AI Provider Boundary

Codex remains the only concrete provider, but generation and status concepts should be accessed through a provider-shaped interface. The MVP should avoid visible placeholder provider UI. Claude support can be added later by implementing the same boundary and adding provider selection to settings.

### Packaging Scripts

Add scripts for Electron development and for creating a local macOS app bundle. Package metadata should avoid macOS-only assumptions where Electron already provides a cross-platform abstraction.

## Data Flow

On launch, Electron reads desktop settings. If no custom data root is configured, it uses Electron's platform app data directory as the data root. Electron starts the local Next server with `LOCAL_DATA_ROOT` set to that path and loads the server URL in the app window.

The active data root contains the existing `.local` structure:

```text
.local/
  stories/
  tasks/
  lessons/
  errors/
```

Story creation, task creation, lesson generation, regeneration, deletion, lesson reads, and Notion export continue to call the existing Next API routes from the renderer.

Lesson generation flow remains:

1. The renderer posts to existing task API routes.
2. API routes read and write under the active `LOCAL_DATA_ROOT`.
3. Codex status and generation go through the Codex provider implementation.
4. Generated lessons and diagnostics are stored under `.local`.

If the user wants to use existing repo data, they can choose the project directory as the data root. The app will then use that directory's `.local` folder. The MVP does not automatically move, copy, or migrate data.

## Error Handling And Security

Startup failures should be explicit. If the local server cannot start, Electron shows a small failure window with the error summary and retry or quit actions. If a port is occupied, Electron chooses another free localhost port. If the selected data folder is invalid or inaccessible, Electron falls back to the default app data directory and surfaces a settings warning after launch.

Settings changes should be validated before saving. If validation fails, the UI shows a clear message and keeps the previous folder active. If validation succeeds, the setting is saved and the UI asks the user to restart the app.

Codex errors continue to use the existing safe client-facing messages:

- `CODEX_NOT_INSTALLED`
- `CODEX_NOT_AUTHENTICATED`
- `MODEL_UNAVAILABLE`
- `USAGE_LIMITED`
- `GENERATION_FAILED`

Diagnostics stay under `.local/errors`.

Security defaults:

- keep `nodeIntegration` off;
- keep `contextIsolation` on;
- expose only named preload methods;
- open external links in the system browser;
- do not expose credentials through logs, UI, or preload APIs.

## Testing And Verification

The MVP should keep automated testing light.

Automated checks:

- keep the existing test suite as the main regression check;
- add focused tests only for nontrivial helpers, such as data-root resolution, provider boundary behavior, or server environment construction;
- skip full Electron UI automation for MVP;
- skip packaged-app automation for MVP.

Manual verification is the main desktop gate:

1. `electron:dev` launches the app window.
2. The default desktop data root creates and uses `.local`.
3. A custom data folder can be selected and works after restart.
4. Codex status displays correctly.
5. Creating a YouTube story still works.
6. Generating a lesson still writes output.
7. Quitting the app stops the local server.
8. A local macOS app bundle can be built and opened.

## Implementation Notes

- Follow the existing package manager and Node declarations.
- Use `$NVM_BIN/pnpm` for package-manager commands.
- Keep Electron-specific code at the runtime edge. Avoid mixing desktop lifecycle logic into lesson, task, or story modules.
- Prefer using Electron abstractions for app data paths and dialogs instead of hardcoded macOS paths.
- Keep the first provider implementation Codex-only, with naming that does not make Codex assumptions leak into task semantics.
