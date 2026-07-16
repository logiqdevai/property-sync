# EstateWeb API Capturer

Standalone Playwright tool that records every HTTP/HTTPS request made by the browser while you
manually log in and click around `app.estateweb.gr` (or any other configured `startUrl`). The
captured traffic is meant to be replayed/analyzed later to build a proper API client — see
[`../http-playwright-capturer.md`](../http-playwright-capturer.md) for the original spec, and
[`../logs.md`](../logs.md) / [`../estateweb-login-agent-notes.md`](../estateweb-login-agent-notes.md)
for what's already known about EstateWeb's auth flow.

## Folder structure

```
estateweb-api/
├── config/
│   └── default.config.json     # capture defaults (start URL, filters, ignore list)
├── captures/                    # generated output (git-ignored, except .gitkeep)
├── src/
│   ├── index.ts                 # CLI entry point — wires everything together
│   ├── types/                   # shared type definitions (config + capture shapes)
│   ├── config/                  # config loading + default ignore list
│   ├── browser/                 # Playwright persistent-context launcher
│   ├── capture/                 # the recorder: filtering, correlation, body/response parsing
│   ├── session/                 # "wait for the user to finish" controller
│   └── output/                  # session.json / summary.json writers
└── package.json
```

Each layer only depends on the ones below it (`index` → `session`/`capture` → `browser`/`config` →
`types`/`utils`), so any piece (e.g. response parsing, or the ignore list) can be swapped or
extended without touching the rest.

## Setup

```bash
cd scripts/api-generator/estateweb-api
npm install
npx playwright install chromium
```

## Usage

```bash
npm run capture
# or with a custom config file:
npm run capture -- --config ./config/my-session.config.json
```

1. A Chromium window opens at `config.startUrl` using a persistent profile
   (`config.userDataDir`), so cookies/local storage/session storage survive between runs.
2. Log in (including MFA) and navigate the app manually. Nothing is automated.
3. When done, either press **Enter** in the terminal or just close the browser window.
4. Two files are written under `captures/`:
   - `session-<n>.json` — every captured request/response pair.
   - `summary-<n>.json` — aggregate stats (methods, domains, endpoints, status codes,
     largest responses, slowest requests).

The `{{index}}` placeholder in `outputFile` auto-increments so repeated runs never overwrite a
previous capture.

## Configuration (`config/default.config.json`)

| Key | Description |
|---|---|
| `startUrl` | First page to open. Defaults to `https://app.estateweb.gr/login`. |
| `headless` | Run Chromium headless. Keep `false` for manual login/MFA. |
| `outputFile` | Session output path, supports `{{index}}`. |
| `userDataDir` | Persistent Chromium profile directory. |
| `captureImages` / `captureFonts` / `captureStylesheets` / `captureScripts` / `captureXHR` / `captureFetch` / `captureWebSockets` | Per-resource-type toggles. Types without a flag (`document`, `media`, `manifest`, `other`, ...) are always captured. |
| `maxBodySizeBytes` | Response bodies larger than this are recorded with metadata only (`truncated: true`), to bound memory usage. |
| `ignore.hostnames` | Hostname patterns to drop (supports `*.example.com` wildcards). Defaults to common analytics/tracking domains. |
| `ignore.resourceTypes` | Resource types to always drop, regardless of the capture flags above. |

## Output shape

`session-<n>.json`:

```jsonc
{
  "capturedAt": "...",
  "startUrl": "...",
  "browser": "Chromium",
  "playwrightVersion": "...",
  "durationMs": 12345,
  "entryCount": 42,
  "entries": [
    {
      "id": "uuid",
      "sequence": 0,
      "timestamp": "...",
      "duration": 120,
      "duplicate": false,
      "redirectChain": [{ "url": "...", "status": 302 }],
      "request": {
        "method": "POST",
        "url": "...",
        "path": "...",
        "query": {},
        "headers": {},
        "cookies": {},
        "body": { "raw": "...", "parsed": {}, "encoding": "json" },
        "resourceType": "xhr",
        "initiator": "..."
      },
      "response": {
        "status": 200,
        "headers": {},
        "cookies": {},
        "mimeType": "application/json",
        "format": "json",
        "body": {},
        "size": 18234,
        "truncated": false
      },
      "failed": false,
      "error": null
    }
  ]
}
```

`summary-<n>.json` aggregates `totalRequests`, `successfulRequests`, `failedRequests`, `methods`,
`domains`, `endpoints`, `statusCodes`, `largestResponses`, and `slowestRequests`.

## Extending

- **New response formats / smarter multipart parsing** — `src/capture/response-parser.ts` and
  `src/capture/body-parser.ts`.
- **OpenAPI generation / schema inference / endpoint classification** — read `session-*.json`
  from `captures/`, group by `entry.request.path`, and build a new module under a sibling
  `analysis/` folder; the recorder doesn't need to change.
- **Request replay / client generation** — every entry already has everything needed
  (method, URL, headers, cookies, body) to be replayed directly with `fetch`.
- **More ignore patterns** — edit `config/default.config.json` or pass `--config` with your own.

## Known limitations

- `request.postData()` decodes the body as a UTF-8 string, so binary multipart file bytes (e.g.
  uploaded images) are not recovered exactly — only field names/values and file metadata are.
- WebSocket frames are captured as a single entry per connection (list of sent/received frames),
  not one entry per frame.
