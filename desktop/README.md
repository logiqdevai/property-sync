# Property Sync Crawler (desktop app)

A Windows app for crawling agencies whose websites block the Property Sync server. It does what the
`mcp-crawl` skill does, for non-technical staff and without a terminal or AI. It drives the Chrome
(or Edge) installed on the computer, so the crawl comes from a real browser on a home/office
connection.

## What it does

1. **Sign in** with a Property Sync admin/support account (same login as the website).
2. **Agencies**: lists the agencies whose scheduled crawl is blocked, failing or empty (or all of them).
3. **Crawl now**: opens Chrome, reads every listing page and every listing, solves robot checks
   through the API's 2captcha account (or asks the user to complete them in Chrome), then uploads
   the result. Progress is saved to disk, so **Stop** / a crash / closing the app can be continued.
4. The API saves and normalizes the listings exactly like a scheduled crawl. **Nothing is pushed
   to the CRM**: auto-update is held off for the run and restored after the crawl's finalization,
   so new/changed listings wait for review at `/dashboard/properties?pending_crm_update=true`.
   Removals are still pushed, as with any full crawl.
5. **Fix missing photos** (after the user pushed): checks every pushed listing live in EstateWeb,
   and for the ones with no photos downloads them through Chrome and uploads them via the API.

The app holds no secrets. Database, 2captcha and EstateWeb access all stay on the server
(`api/src/modules/desktop-crawl`).

## How it fits together

```
desktop/src/
├── main/       Electron main process (Node): drives Chrome with playwright-core, talks to the API
│   ├── crawl/      listing walk, detail walk, checkpoints, the crawl session
│   ├── photos/     photo repair session
│   ├── browser/    launching the installed Chrome/Edge, robot-check handling
│   ├── api/        API client for the crawl's own calls (gzip upload, captcha, photos)
│   └── ipc/        IPC handlers
├── preload/    exposes `window.desktop` (typed by src/shared/ipc.ts)
├── shared/     the IPC contract between main and UI
└── renderer/   the UI: React + HeroUI, same folder structure and rules as app/ (see app/RULES.md)
```

The page-side extraction code is **not** duplicated here: `GET /desktop-crawl/scrapers/:id/job`
serves `extractListingCards` / `extractDetailPage` from `api/src/integrations/crawler/utils/page-extractors.ts`
(the same functions the server crawler uses) as source text. Checking each detail result (robot wall,
redirect away, truncated page) and merging it into the listing also happens on the server. So
extraction fixes ship with the API, without a new app release.

## Develop

```bash
cd desktop
cp .env.template .env     # VITE_API_URL / VITE_APP_URL
npm install
npm run dev               # Vite on :5174 + Electron
npm run typecheck && npm run lint
```

The API must allow the app's origin in CORS (`app://property-sync`, plus `http://localhost:5174`
when `NODE_ENV=local`). See `api/src/main.ts`.

## Release (Windows installer)

```bash
# .env must point at production: VITE_API_URL=https://<api>  VITE_APP_URL=https://<web app>
npm run dist              # -> release/Property-Sync-Crawler-Setup-<version>.exe
```

To release a new version:

1. Bump `version` in `package.json` (installed apps only update to a **higher** version).
2. `npm run publish`: builds, then uploads the installer, `latest.yml` and `latest.json` to
   `desktop-crawler/` in the API's storage bucket (env: `api/.env.staging`). Older installers are kept.

Then:
- **Installed apps update themselves.** While signed in they check on start and every 4 hours
  (`src/main/updates/app-updater.ts`), download the new version in the background and show
  "Version X is ready, Restart now" (disabled while a crawl runs). If nobody restarts, it installs
  when the app is next closed. The feed is `GET /desktop-crawl/app/update/:file` on the API, which
  streams the files from the private bucket with the user's token.
- **New computers** download it from the web app: **Admin, App Config, Desktop crawler app,
  Download for Windows** (`GET /desktop-crawl/app/latest` gives a 15-minute link).

Versions before 1.1.0 have no updater: install 1.1.0 by hand once on those computers.

The installer is unsigned, so Windows SmartScreen
warns on first install ("More info" → "Run anyway"). A code-signing certificate removes that.
