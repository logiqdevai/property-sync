---
name: desktop-release
description: 'Release a new version of the Property Sync Crawler desktop app (desktop/): bump the version, build the Windows installer, smoke-test it, and publish it to the GCS bucket so installed apps auto-update and admins can download it. Use when asked to "release/publish/ship a new desktop app version", "build the desktop installer", or after fixing something in desktop/ that users need.'
---

# Desktop app release

Everything lives in `desktop/` (Electron + electron-vite + electron-builder, Windows NSIS only)
and `api/scripts/publish-desktop-crawler.ts`. Do all steps in order, including publishing (publish is the default, no confirmation needed); stop and report on any failure.

## 1. Bump the version

Edit `"version"` in `desktop/package.json` (semver; patch for fixes, minor for features).
**Always bump**: installed apps only update when the published version is higher than theirs, and
the installer file name embeds the version (`Property-Sync-Crawler-Setup-<version>.exe`).
Check the current published version is lower; never reuse a version number.

## 2. Build

```bash
cd desktop && npm run dist
```

Runs typecheck, `electron-vite build`, then electron-builder. Takes ~2-3 min (use a 10 min timeout).
Output in `desktop/release/`: `Property-Sync-Crawler-Setup-<version>.exe`, `.blockmap`, `latest.yml`.
Unsigned build and default icon warnings are expected.

## 3. Smoke-test before publishing

Typecheck does not catch bundling/runtime problems (e.g. a CJS/ESM default-import of
`electron-updater` crashed the installed app on startup). Launch the unpacked app:

```bash
cd desktop && timeout 8 "release/win-unpacked/Property Sync Crawler.exe"
```

Exit code 124 (killed by timeout) with no "JavaScript error"/"Uncaught Exception" output = it
started fine. Disk-cache "Access is denied" lines are harmless. Optionally `grep` `out/main/index.js`
for the thing you changed. If it crashes, fix it and rebuild; do not publish.

## 4. Publish

```bash
cd api && npx dotenv -e .env.staging -- node -r ts-node/register scripts/publish-desktop-crawler.ts
```

- Use `.env.staging`: it is the env file that points at the live bucket/DB the deployed API reads
  (see memory: prod DB read-only access note). Despite the name, this is the real release.
- Uploads the installer first, then `latest.yml` (auto-updater feed) and `latest.json` (admin
  "Download for Windows" button), so manifests never point at a missing file. Older installers are kept.
- Optional: `--file=<path to .exe>` to publish a specific installer.
- Success prints `Published version <v>: {...}`.

Publishing is the default: any request to release/ship/build a new version includes this step, without asking again. Skip it only if the user explicitly says not to publish (e.g. "build only", "don't publish"), or if the smoke-test fails.

## 5. Report

Tell the user: version, installer path, that it was published, what was smoke-tested, and that
changes are uncommitted (commit only if asked; use the scoped-commit skill since the tree often has
unrelated edits). Installed apps check every 4 h and on sign-in; a manual install of the new
installer works too (uninstall not required).

## Gotchas

- Import `autoUpdater` as a **named** import: `import { autoUpdater } from "electron-updater"`.
- `electron-builder.yml` publish url is a placeholder; the app sets the real feed URL at runtime.
- No code signing is configured; Windows SmartScreen may warn on first install.
- Update feed requires the signed-in user's token (app-updater.ts), so updates only reach signed-in apps.
