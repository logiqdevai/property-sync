# Agency site counter (Coolify)

Visits the own website of 1,649 real-estate agencies in headless Chrome (Playwright), finds the "for sale" listing page and reads the
result-count label (e.g. "Βρέθηκαν 91 αποτελέσματα", "1-12 από 56", "1 to 3 out of 81 properties"). One JSON line per site goes to
`/data/results.jsonl`. It **resumes** after a restart (already-done sites are skipped).

Good-citizen rules built in: obeys each site's robots.txt (rules are baked into `targets.json`), ~3 s between pages, 1-2 sites at a time,
and it **stops at any bot-check / captcha page** (records `blocked`, never tries to solve or bypass it).

## Deploy on Coolify
1. Put this folder in a Git repo (a new private repo, or a sub-folder of an existing one).
2. Coolify -> New Resource -> Application -> your repo -> **Build Pack: Dockerfile**. If it is a sub-folder set *Base Directory* to `/count-worker`. **Port: 3000**.
3. **Environment variables**
   - `AUTH_TOKEN` = a long random string (required; without it results/status are not served, only `/health`)
   - `WORKERS` = `2` (default) -> the whole list in about **3.5 hours**. `3` -> about 2.4 hours. Measured peak memory with 2 workers was ~0.7 GB (about 0.3-0.4 GB per extra worker).
   - optional pacing: `PAGE_GAP_MS` (2000), `SITE_GAP_MS` (800), `SETTLE_MS` (1500), `SCROLL_MS` (600). Higher numbers = gentler on the sites but slower.
4. **Storage**: add a persistent volume mounted at `/data` (results + resume state live there).
5. **Advanced -> Resource limits**: set a **memory limit of 2 GB** (and 1-2 CPUs). This keeps a runaway Chrome from taking the whole server down.
6. Deploy. Health check is `GET /health`.

## Deploy on Railway instead
New service from the GitHub repo -> Settings -> Source -> **Root Directory `/count-worker`** (the `Dockerfile` is detected automatically) -> Variables: `AUTH_TOKEN` (+ optional `WORKERS`; Railway sets `PORT` itself) ->
add a **Volume** mounted at `/data` -> Settings -> Networking: **Generate Domain** -> Settings -> Deploy: **Healthcheck Path `/health`**. Railway has no per-service memory cap to set (it bills per minute for what is used).
The Dockerfile has no `VOLUME` instruction on purpose (Railway does not allow it).

## Restarts and memory (important)
- Progress is saved after every site; after ANY restart/redeploy it resumes. Sites that ended in `error:*` are retried automatically on the next start.
- Fixed in v2: Playwright request interception kept ~3 MB of Node heap per site (heap-out-of-memory crash after ~35 sites). Now no interception (images are disabled at browser level),
  a fresh page per site and a fresh browser context every 15 sites. Measured: Node heap flat at ~60 MB over 57 sites.
- Safety net: if Node's live heap ever passes `HEAP_GUARD_MB` (450) the worker finishes its current sites and exits with code 3 so the platform restarts it. Set the platform restart policy to **Always**
  (Railway: Settings -> Deploy -> Restart Policy; the default "On Failure" gives up after 10 retries).
- `/status` shows `heapMB` and `memoryMB`; if `heapMB` keeps climbing past ~200, tell me.
- `/results.jsonl` can contain more than one line per site (a retried error) and the last line may be cut if the process was killed: keep the LAST valid line per `id`.

## Watching it / getting the results
- **Dashboard (nicest):** `https://YOUR-DOMAIN/?token=AUTH_TOKEN` - live progress ring, a ticking countdown to the finish time, speed chart, counts by status/confidence,
  the latest results and a list of agencies that are above 70 on their own site. Refreshes every 3 s; opening `/` without a token shows a small token prompt. The page itself contains no data.
- Raw JSON: `https://YOUR-DOMAIN/status?token=AUTH_TOKEN`
- Progress (JSON): `https://YOUR-DOMAIN/status?token=AUTH_TOKEN` (processed, remaining, counts by status/confidence, memory)
- Download: `https://YOUR-DOMAIN/results.jsonl?token=AUTH_TOKEN`  (works any time, also while running)
- No domain? In Coolify open the app's Terminal and run `cat /data/results.jsonl`.
- It is finished when `remaining` is 0 and a file `/data/DONE` exists (the container keeps serving the results afterwards; stop or delete it when you are done).

Timing (measured on 24 random sites, then extrapolated): 2 workers = 8.1 s per site overall -> about 3.5 hours for all 1,649; 3 workers = 5.3 s per site -> about 2.4 hours.
This is an extrapolation from a small sample, so treat it as roughly 3-4.5 hours. `/status` shows a live `etaHours` (based on this run's real speed once ~20 sites are done).

## Result fields
`status`: `ok` (a number was found) | `no_count_found` | `no_listing_page` | `blocked` (bot check) | `robots` | `error:*`.
`best`: `{ n, confidence, url, ctx, pattern, other_numbers, needs_review }`
- `high`   a total label on a page marked as "for sale"
- `medium` a total on a generic listing page (may include rentals), or several sale pages gave different totals
- `low`    only an estimate (property links counted across pagination, "pages x cards")
- `needs_review: true` -> a person/agent should look at that site.

## Important caveats
- A cloud server has a data-centre IP. Some sites that load fine from a home connection may answer `blocked` here - those should be re-checked from a home PC.
- Counts are "what the site's own for-sale list says". Category-split sites are summed only when the categories are siblings with no parent total.
- Local test (needs Chrome): `NODE_PATH=<a node_modules with playwright> CHROME_CHANNEL=chrome node worker.js --test 5`

## Files
`Dockerfile`, `package.json`, `worker.js`, `dashboard.html`, `targets.json` (1,649 sites, ordered: 41-70 sales first, then 26-40, 71+, 11-25, 1-10).
