# Spiti24 agency pipeline (Docker app)

Does online what was done by hand on a PC: collect the agencies from spiti24.gr, count their sale listings, check each agency's own website (exists? emails? how many properties does it list?),
check the listing photos for watermarks, and produce the client Excel `spiti24-agencies.xlsx` - with a live dashboard.

Open `https://YOUR-DOMAIN/?token=AUTH_TOKEN`. **Download Excel** builds the workbook from the app's current data (~10 s). The client needs nothing installed.

## The stages (dashboard "Pipeline")
| # | Stage | Runs | Notes |
|---|-------|------|-------|
| 1 | Spiti24 agencies & sale counts | **the operator's own Chrome tab** on spiti24.gr | spiti24.gr's bot protection (Imperva) blocks server IPs, so a server cannot read it. The app keeps the queue and the data; a script in the operator's browser does the fetching. |
| 2 | Website check (DNS) | server | which agency websites still exist; finds hosts that only work with/without `www` |
| 3 | Websites & emails | server (`excel/find_emails.py`) | reads each site's contact pages, obeys robots.txt, stops at bot checks, keeps each site's robots.txt for stage 5 |
| 4 | Web archive | server (`excel/wayback_emails.py`) | emails from Internet-Archive copies of sites that block automated visits (may be old: the Excel marks them with the snapshot date) |
| 5 | Watermark check | server (`excel/watermark.py`) | **Free, no API key.** The 3 sample photos of each agency go through a free open-source watermark model (`prithivMLmods/Watermark-Detection-SigLIP2`, Apache-2.0, converted to ONNX at image build) and a small classifier fitted on the manual by-eye verdicts (`excel/wm_model.json`). Y = overlay on 2-3 photos, P = on 1, N = none seen. ~8 agencies per minute per worker thread incl. downloads. Optional alternative engine: an AI vision model with `ANTHROPIC_API_KEY` + `WM_ENGINE=ai` (paid). |
| 6 | Own-website property counts | server (Playwright/Chrome, `worker.js`) | the "for sale" total read from each agency's own site |

**Run all server stages** chains 2 -> 3 -> 4 -> 5 (watermark) -> 6 (own-website counts). Every stage is resumable and can be started/stopped on its own.

### Running the Spiti24 collection (stage 1)
1. On the dashboard press **Start collection** (new agencies + missing counts) or **Refresh everything**.
2. Press **Copy collector script**.
3. In Chrome open `https://www.spiti24.gr/mesitika-grafeia` (solve the "I am human" check if shown), press **F12 -> Console**, paste, Enter (if Chrome asks, type `allow pasting` first).
4. Leave the tab open. The dashboard shows progress; a small box in the tab shows what it is doing. Pace: 3-4.5 s per page, a 4-minute pause every 150 pages.
5. Spiti24 has blocked after some hundreds of requests in every earlier session. The script stops at the first block, tells the dashboard and **loses nothing**: reload the tab, solve the check, wait a while, paste again. It never tries to bypass the protection.
Expect the full 4,220 agencies + sale counts to need several sessions. The parsers were validated against the data collected earlier (25/25 agencies identical, sale counts identical or drifting by a few listings).

### Start everything from scratch (button "⟲ Start everything from scratch")
For a completely fresh run (all agencies, counts, emails, own-website counts and watermark verdicts re-done). Type `RESTART` to confirm. The app then:
1. copies all current data to `/data/backups/<time>/` (the 3 newest backups are kept) and erases the live data;
2. starts the Spiti24 collection (step 1 - paste the collector script in a Chrome tab as above; it resumes after blocks or restarts);
3. **when the collection has finished it runs stages 2-6 by itself** (a collection that was stopped by hand does not continue).
The blue/amber bar on the dashboard shows step 1 or 2. Until agencies exist the Excel download answers "nothing to export yet". To go back to the old data, stop the app, copy the files from `/data/backups/<time>/` back (`*.json`, `*.jsonl`, `decisions.txt` into `/data/xl/`, `results.jsonl` into `/data/`, `state.json` into `/data/`) and start it again. The single-stage buttons ("Refresh everything", "Rescan all", "Recount all") still exist for redoing just one part.

### Speed settings (dashboard, each step's tab: "⚡ Run N at the same time")
Website check 5-100 (default 30), emails 4-60 (28), web archive 1-8 (4), watermark 1-8 (2), own-website counts 1-6 (2; each needs ~0.4 GB memory), Spiti24 pace slow/normal/fast (default normal, 3-4.5 s per page; faster = Spiti24 blocks sooner). Saved in `state.json`, so they survive restarts; they apply the next time a step is started (the Spiti24 pace applies from the next page). The helper script in the Spiti24 tab waits up to 3 minutes for the app to come back (e.g. during a redeploy).

## Deploy (Railway or Coolify)
Build pack: Dockerfile, Base/Root directory `/count-worker`, port 3000 (Railway sets `PORT` itself).
- **Variables:** `AUTH_TOKEN` (required, long random string). Optional: `WORKERS` (2 = ~3.5 h for the own-site stage, 3 = ~2.4 h), `WM_ENGINE` (`local` = free built-in model, the default; `ai` = paid AI vision with `ANTHROPIC_API_KEY`, `WM_MODEL` default `claude-sonnet-5`), `WM_THREADS` (2), `AUTOSTART_OWN=0` (do not resume the own-site stage by itself after a restart), `PUBLIC_URL` (only if the collector script shows a wrong address), `HEAP_GUARD_MB` (450), pacing `PAGE_GAP_MS` (2000), `SITE_GAP_MS` (800), `SETTLE_MS` (1500), `SCROLL_MS` (600).
- **Volume:** persistent volume mounted at `/data` (all data and resume state live there; without it a restart begins again from the baked snapshot). No `VOLUME` instruction in the Dockerfile on purpose (Railway forbids it).
- **Build:** needs internet access during the build (it downloads the ~370 MB watermark model from huggingface.co and converts it; the image is ~4.4 GB). **Coolify:** memory limit 2 GB. **Railway:** Restart Policy *Always*.
- Health check: `GET /health`.

## Data
On first start the snapshot baked into the image (`excel/`: 4,220 agencies, sale counts, watermark verdicts, emails, dead links) is copied to `/data/xl/`. After that the app updates the files in `/data/xl/`
(same names/formats the Excel builder reads). To re-seed from a newer snapshot: copy the new files into `count-worker/excel/`, redeploy and delete `/data/xl/` (this discards what was collected online).
`/data/results.jsonl` holds the own-site counts (keep the LAST valid line per `id`); on a fresh `/data` it starts from `excel/results_seed.jsonl` (the counts from the Railway run, 2026-09-26: 1,644 of 1,649 done + 5 retried), so a new deployment only re-visits sites that ended in an error; `/data/state.json` the pipeline/collector bookkeeping, `/data/work/` raw stage output.

## Endpoints (token needed except `/` page and `/health`)
`/status` (own-site stage live numbers) · `/pipeline/status` · `POST /pipeline/start|stop|run-all` · `/collector/*` (used by the collector script) · `/spiti24-agencies.xlsx` · `/results.jsonl` (raw own-site results). Token: `?token=` or `Authorization: Bearer`.

## Own-site stage
Visits each agency's site in headless Chrome, finds its "for sale" page and reads the result-count label ("Βρέθηκαν 91 αποτελέσματα", "1-12 από 56", "1 to 3 out of 81 properties"); category-split sites are summed only when the categories are siblings with no parent total.
Targets = agencies with at least one Spiti24 sale listing whose website scan succeeded (1,649 with the current data).
`status`: `ok` | `no_count_found` | `no_listing_page` | `blocked` (bot check) | `robots` | `error:*`. `best.confidence`: `high` clean sale total, `medium` generic page/differing totals, `low` estimate; `needs_review` marks doubtful ones.
Good-citizen rules: robots.txt obeyed, ~3 s between pages, stops at bot checks (never bypasses them). A cloud server has a data-centre IP: some sites that load from a home connection may answer "blocked" here.
Memory: no request interception, a fresh page per site, a fresh context every 15 sites; if Node's heap passes `HEAP_GUARD_MB` the worker exits with code 3 so the platform restarts it (sites ending in `error:*` are retried on restart).
Local test (needs Chrome): `NODE_PATH=<node_modules with playwright> CHROME_CHANNEL=chrome node worker.js --test 5` (`ONLY_IDS=1,2,3` limits targets).

## Verified / not verified
Verified: collector against live Spiti24 (areas + profiles), DNS/scan/archive stages, the full "Run all" chain on a 7-agency dataset, Docker image build + container (health, pipeline status 4,220 agencies / 1,649 own targets, Excel identical to the reference workbook except the own-website column, which fills as counts arrive).
**Watermark accuracy** (5-fold cross-validation on 3,502 agencies with by-eye verdicts, tested on agencies the classifier had not seen): a watermarked agency (Y) was called N in 0% of cases (P in 2.7%), an agency you judged clean (N) was called Y in 0.4% and P in ~15% (P counts as watermarked in the Excel, so the errors go to the safe side); exact match Y 97%, N 84-94% depending on the P threshold. In the container, on 60 agencies whose verdicts were removed and re-judged by the app, 53 matched exactly (the classifier had seen these photos during training, so the CV figure above is the honest one). "N" means no overlay seen on the 3 sample photos at thumbnail size, as in the manual review.
Re-training: `excel/wm_train.py` (needs the extracted photo embeddings, see `wm_export.py`); retraining is only needed if the portal's photo format changes.
**Not verified:** the AI engine against the real Anthropic API (needs a key; only tested against a mock).

## Files
`Dockerfile`, `package.json`, `worker.js`, `dashboard.html`, `targets.json`, `lib/` (store, collector, collector script, HTTP routes, pipeline), `excel/` (Excel builder, stage scripts, baked seed data).
