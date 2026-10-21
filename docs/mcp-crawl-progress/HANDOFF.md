# mcp-crawl progress handoff (saved 2026-10-18 ~17:30)

Manual Chrome-MCP crawls of agencies whose sites block the server crawler (Imperva "Pardon Our Interruption", HTTP 403).
Playbook: `.claude/skills/mcp-crawl/SKILL.md` (+ `.cursor` copy). Read it first.

## Done (crawled in Chrome, ingested, normalized, verified, auto-update restored)
tsimedogiannis (198), samson-homes (94), realeze (138), nikiestate (99), spititehni (155), mesogiosrealestate (179), finehome (227).

## In progress: housemarket-realestate (NOT ingested yet)
- Scraper `15ae0a80-11f8-4c57-8baa-79f3a615cdb7`, source agency `6fc679b1-328f-4a53-845a-b260b779c775`,
  tracked agency `3c5eeb30-b09c-432b-aaee-8c6c30e604f8` (user `0daffa79-...`), `auto_update_to_crm` originally **true**.
- 1,294 listings found (130 listing pages, all collected). Detail pages: **462 done, 832 pending** at save time.
- Files in `housemarket-realestate/`:
  - `items.json`  all 1,294 items `{source_url, raw}`; done ones have `raw._detail_done: true`.
  - `driver.js`   the self-navigating extraction driver (reads/writes IndexedDB db `mcpcrawl`, store `items`; uses `localStorage.mcpExpect`).
  - `state.json`  counts + `nextUrl` to resume from.
- The Chrome tab's IndexedDB (`mcpcrawl`) may still hold the same data if the same Chrome profile is reused. Check first:
  `evaluate_script`: open `indexedDB.open('mcpcrawl',1)`, `getAll()` on store `items`, count items with `raw._detail_done`. If it is ~462, just resume (below).
- If IndexedDB is empty: re-create it from `items.json` (insert items in chunks of ~100 via `evaluate_script`; split with
  `node -e "const a=require('./items.json');for(let i=0;i<a.length;i+=100)require('fs').writeFileSync('chunk'+i/100+'.json',JSON.stringify(a.slice(i,i+100)))"`), or accept re-collecting listings (130 page loads).
- Resume: open `https://www.housemarket-realestate.gr/el/akinita/anazitisi` in the MCP Chrome (solve the Imperva captcha manually if shown),
  `localStorage.setItem('mcpDriver', <contents of driver.js>)`, `localStorage.setItem('mcpExpect', <state.json nextUrl>)`, navigate to `nextUrl`,
  then repeatedly call `evaluate_script` with `() => eval(localStorage.getItem('mcpDriver'))` (one call per page; it navigates itself).
  If a call returns `{blocked:true}`: tell the user to solve the captcha in Chrome, then continue. It has blocked ~4 times (≈ every 40-400 pages).
  If a call returns "Execution context was destroyed", just call again.
- When `pending` reaches 0: dump items, delete `raw._detail_done` from each, then
  `cd api && TS_NODE_TRANSPILE_ONLY=1 npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/mcp-crawl-ingest.ts --scraper-id=15ae0a80-11f8-4c57-8baa-79f3a615cdb7 --items-file=<file> [--dry-run]`
  (run the real one in the background; it can exceed 10 min). Per SKILL.md §2: set tracked agency `auto_update_to_crm=false` BEFORE ingest, restore it to `true` only after `normalize-crawl-chunk`/`cms-sync` job_logs are COMPLETED.
  Then check `cms_sync_runs` for REMOVE operations (removals ARE pushed to the CRM even with auto-update off) and verify a sample against the live site ("Το ακίνητο δεν είναι δημοσιευμένο" = really unpublished).
- Note: many housemarket listings legitimately have only 1 photo / no gallery (listing-card image) — not a bug.

## Still to do after housemarket (same procedure)
1. **realty properties** — last server run HTTP 403 (2026-10-11). Not started.
2. **pelio** — new: blocked today (2026-10-18 05:07), `pelio.eu`. Not started.
3. Not blocks, need scraper-config work instead of a manual crawl:
   - **lafazanihomes**: `listing_selector ".jet-listing-grid__item" not found` (2026-10-16), site layout changed.
   - **samson-homes**: server run today 04:46 failed with "Crawl run has no scraper with an active version config"; scraper still `BROKEN` in DB.

## Rules from the user (do not break)
- Never offer to skip an agency or ask whether to proceed on large ones; just continue, and on a captcha ask them to clear it.
- Report blocks immediately; they watch the browser and notice before I do.
- Status requests interrupt the run; keep crawling back to back.
