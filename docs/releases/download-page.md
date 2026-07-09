# Download Page Release Notes

## Vercel Environment

Set these environment variables on the Vercel project:

```text
APP_SURFACE=web
DOWNLOAD_MAC_UNIVERSAL_URL=https://github.com/steeeee0223/language-learning/releases/latest/download/Language-Learning-Notes-mac-universal.dmg
```

`APP_SURFACE=web` makes the deployment expose only `/download` plus static assets.

## Desktop Environment

Electron sets `APP_SURFACE=desktop` when it starts the local Next server. Local `next dev` also defaults to desktop mode when `APP_SURFACE` is unset.

## Automated GitHub Release

```bash
git tag v0.1.0
git push origin v0.1.0
```

Pushing a `v*` tag starts `.github/workflows/release-desktop.yml`. The workflow builds an unsigned macOS Universal DMG and uploads it to the matching GitHub Release as `Language-Learning-Notes-mac-universal.dmg`.

The `/download` page should point to the latest-release asset URL:

```text
https://github.com/steeeee0223/language-learning/releases/latest/download/Language-Learning-Notes-mac-universal.dmg
```

## Local DMG Build

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24.11.1 --silent
$NVM_BIN/pnpm --config.store-dir=/Users/awen/Documents/Codex/.pnpm-store run electron:dist:mac
```

## Unsigned MVP Opening Note

This MVP is not signed or notarized. Testers may need to right-click the app and choose Open on first launch.
