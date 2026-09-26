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
   - `WORKERS` = `2` (default). Each worker uses roughly 0.5 GB of RAM. Raise to 3 only if the host has spare memory.
4. **Storage**: add a persistent volume mounted at `/data` (results + resume state live there).
5. **Advanced -> Resource limits**: set a **memory limit of 2 GB** (and 1-2 CPUs). This keeps a runaway Chrome from taking the whole server down.
6. Deploy. Health check is `GET /health`.

## Watching it / getting the results
- Progress: `https://YOUR-DOMAIN/status?token=AUTH_TOKEN` (processed, remaining, counts by status/confidence, memory)
- Download: `https://YOUR-DOMAIN/results.jsonl?token=AUTH_TOKEN`  (works any time, also while running)
- No domain? In Coolify open the app's Terminal and run `cat /data/results.jsonl`.
- It is finished when `remaining` is 0 and a file `/data/DONE` exists (the container keeps serving the results afterwards; stop or delete it when you are done).

Expect roughly 6-8 hours at `WORKERS=2` (about 25-30 s per site) - only a rough estimate.

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
`Dockerfile`, `package.json`, `worker.js`, `targets.json` (1,649 sites, ordered: 41-70 sales first, then 26-40, 71+, 11-25, 1-10).
