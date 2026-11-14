---
name: mcp-crawl
description: Crawl one property-sync Scraper via the chrome-devtools MCP browser (a real, visible Chrome) instead of the server's Playwright crawler, when that agency's site blocks the server's datacenter IP (Cloudflare/WAF bot protection). Runs AI normalization and creates UserProperty rows for tracked users; the ingest never pushes creates/updates to the CRM (they are held as pending_crm_update for the user to review and push), removals are verified automatically, and the skill verifies the live CRM photos and fixes missing ones on its own (sweeping every blocked agency once an agency to crawl is given, without waiting to be told). Use when asked to "crawl <scraper/agency> with chrome mcp", "the crawler is blocked/getting 403s for this agency", or when scraper-generation SKILL.md's diagnosis points at bot-management blocking, not a broken selector.
metadata:
  version: "1.0.0"
---

# MCP-Driven Crawl Playbook

For agencies whose site blocks the server's Playwright crawler (Cloudflare/WAF bot-management
scoring Railway's datacenter IP + headless fingerprint — see
`api/docs/crawler-bot-detection-blocking.md`) but doesn't block a real, visible Chrome on a normal
network. This drives that real Chrome yourself, via the `chrome-devtools` MCP tools, through the
Scraper's *existing* `ScraperVersion.config` (same selectors a normal crawl would use), then hands
the results to the same downstream pipeline (`SourceProperty` upsert → AI normalization →
`Property`/`UserProperty` creation) a normal crawl uses. The ingest itself never pushes anything to
the CRM (§2 switches auto-update off for the run, and restores it only after the crawl's final step
has run so creates/updates stay held as `pending_crm_update`). The user reviews and pushes them with the
app's own button; the skill verifies removals itself (§8a) and, once the user says they pushed, checks
the live CRM photos and fixes missing ones without asking (§9).

This is the sibling of `scraper-generation` (which *authors* a `Scraper`/`ScraperVersion.config`).
This skill *runs* an existing one through a different transport when the normal one is blocked. If
the scraper doesn't have a working config yet, use `scraper-generation` first.

## Start: invoked without an agency → offer two options, run nothing yet

If the user loaded the skill without naming an agency, make **no tool calls** first. Ask with exactly
these two options and wait for the answer:

1. **Find failed/blocked scrapers** — read the DB (read-only) for scrapers whose latest normal
   (non-mcp-crawl) crawl failed or came back blocked/empty, show them as a short list (agency, last
   crawl date, status, `total_found`, error), and let the user pick which to crawl.
2. **Give an agency to crawl** — the user names it, then continue with §1.

Option 1's query (latest normal crawl per active scraper, flagged ones only):

```sql
with last as (
  select distinct on (cr.scraper_id) cr.scraper_id, cr.status, cr.total_found, cr.error_message,
         (cr.created_at at time zone 'UTC')::text created_utc
  from crawl_runs cr
  where coalesce(cr.metadata->>'source', '') <> 'mcp-crawl'
  order by cr.scraper_id, cr.created_at desc)
select sa.name, sa.id agency_id, s.id scraper_id, s.use_managed_browser, l.*
from last l join scrapers s on s.id = l.scraper_id join source_agencies sa on sa.id = s.source_agency_id
where s.status in ('ACTIVE', 'BROKEN')
  and (s.status = 'BROKEN' or l.status = 'FAILED' or l.total_found = 0
       or l.error_message ~* '403|blocked|captcha|challenge|cloudflare|imperva|timeout')
order by l.created_utc desc;
```

A failure that isn't bot blocking (broken selector, bad config) belongs to `scraper-generation`, not
here; mark those in the list. The §9 photo sweep runs only after an agency to crawl has been chosen.

## 0. Prerequisites

- **`chrome-devtools` MCP tools must be connected in this session.** Unlike `scraper-generation`
  (which explicitly assumes no browser MCP and falls back to `curl`), this skill's entire reason to
  exist is driving a real MCP-controlled browser — if `mcp__chrome-devtools__*` tools aren't
  available, stop and tell the user to connect that MCP server first.
- **`CAPTCHA_API_KEY`** (2captcha) in `api/.env.staging` — optional but lets you clear supported
  captchas yourself, see §3a.
- **`DATABASE_URL`/`REDIS_URL`** — same as `scraper-generation` §0: read from `api/.env.production`
  or `api/.env.staging` (same DB for both).
- Run `mcp-crawl-ingest.ts` (§6) from inside `api/` with
  `node -r tsconfig-paths/register -r ts-node/register` — see that script's own header comment for
  why plain `ts-node` doesn't work (it bootstraps the full Nest app, which is full of `@/...`
  path-aliased imports).

## 1. Look up the scraper + its config

```sql
select s.id, s.name, s.source_agency_id, s.use_managed_browser, s.status,
       sv.version, sv.config
from scrapers s
join scraper_versions sv on sv.id = s.active_version_id
where s.id = '<scraper-id>';   -- or: where s.source_agency_id = '<agency-id>'
```

`sv.config` is the same `ScraperConfig` shape `scraper-generation` SKILL.md §4 documents:
`start_url`, `listing_selector`, `fields` (name → CSS selector or `{selector, type}`, `type` one of
`text | href | src | background_image`), `pagination` (`{type, selector?, url_param?}`), and
`detail_page` (`image_selector`, `image_type`, `description_selector`, `specs_selector`,
`features_selector`, `external_id_source`/`external_id_selector`, `title_selector`, `price_selector`,
`location_selector`). You're about to re-implement the extraction this config describes as
browser-side JS — read the config values before writing that JS.

If `s.use_managed_browser` is already `true`, this agency is a **known** Cloudflare-blocked one (see
`api/docs/crawler-bot-detection-blocking.md`) — you're very likely in the right place. If it's
`false` and you're not sure this is actually a bot-protection issue (vs. a broken selector), check
`scraper-generation` SKILL.md §8/§9's diagnosis flow first — don't reach for a real browser session
to work around what might just be a selector bug.

## 2. Pre-flight safety check — confirm this really won't touch the CRM

```sql
select uta.id, uta.user_id, uta.auto_update_to_crm, ui.is_active
from user_tracked_agencies uta
join user_tracked_agency_integration_links link on link.user_tracked_agency_id = uta.id
join user_integrations ui on ui.id = link.user_integration_id
where uta.source_agency_id = '<agency-id>' and uta.enabled = true;
```

If any row has `auto_update_to_crm = true` AND `ui.is_active = true`, normalization **will**
automatically push new/updated listings to that user's CRM once you run §6 — `mcp-crawl-ingest.ts`
checks this itself and refuses to proceed unless you pass `--force`, but check it here first so
you're not surprised. If nothing comes back, you're safe by construction (see that script's header
comment for the full trace of why `normalizeForCrawlRun()` alone can never reach the CRM otherwise).

**Don't stop and ask — switch auto-update off yourself, then restore it when finished.** For every
row with `auto_update_to_crm = true` AND `ui.is_active = true`:

1. Remember the original (`uta.id` + `true`) — write it down in your reply so it survives a context
   reset.
2. `update user_tracked_agencies set auto_update_to_crm = false where id = '<uta.id>' and
   auto_update_to_crm = true;` (prod DB; no need to message the user about it).
3. Crawl and ingest (§4-§6) with the flag off. **Never** use `--force` to get past the check.
4. **Restore it only once the crawl's FINAL step has run — not when the chunk job completes.** The
   push decision is made in the crawl's finalization (`PropertyNormalizationService` →
   `planAndEnqueueCrawlSync`), which reads `auto_update_to_crm` *at that moment*: flag off → new/updated
   listings are held (`user_properties.pending_crm_update = true`, shown at
   `/dashboard/properties?pending_crm_update=true`) and only removals are pushed; flag on → everything is
   pushed. The `normalize-crawl-chunk` job showing `COMPLETED` is **not** the end (seen: finalization ran
   a minute or two later, saw the restored flag and pushed 16 creates + 1 update + 7 removals the user
   wanted held). So restore only when **all** of these hold (§7): `crawl_runs.metadata.normalization_status
   = 'completed'`, a `cms_sync_runs` row exists for the `CrawlRun` (or the finalization logged that there
   was nothing to sync), and it is no longer changing. Then
   `update user_tracked_agencies set auto_update_to_crm = true where id = '<uta.id>' and
   auto_update_to_crm = false;`.
5. If the run is abandoned or blocked (bot challenge you can't clear), restore the flag right away
   and tell the user — never leave a user's auto-update off unannounced.

Restoring at the right time pushes nothing: the new/changed listings stay `pending_crm_update` for the
user to review and push with the app's own button. The push itself then produces the translated content
(§9b) and the user's push is what §9 verifies.

**Caveat — removals are pushed even with auto-update off.** A full-coverage ingest runs removal
detection, and the app then enqueues a `cms-sync` job that sends `REMOVE` operations to the CRM for
listings that disappeared from the site, regardless of `auto_update_to_crm` (seen on a realeze run:
one genuinely unpublished listing was removed from the CRM minutes after ingest). Creates/updates
are what the flag holds back. A "Property removal spike" notification can follow when several
listings vanished at once; that alone is not a problem. Verify the removals yourself (§8a) and tell the
user if a listing marked removed is still live on the site.

## 3. Decide the run size

Default to the **full listing set** — walk every listing page and every detail page. A partial run
(e.g. ~20 properties) makes the app's removal guard skip removal detection and raise a "Property
removal spike (incomplete crawl)" notification, and leaves the rest of the agency stale. Only cap
the run if the user explicitly asks for a small/sample run, and then say so up front (it will
trigger that notification). Don't hand-drive each page with `navigate_page` + `evaluate_script`:
keep the collected items in the page's `localStorage` (same origin, survives navigations) and make
the extraction script schedule the next navigation itself (`setTimeout(() => location.href = next,
~2-3.5s)`), so each page costs one tool call. Use only real top-level navigations — in-page
`fetch()` / hidden iframes get a 405 or a bot challenge on WAF-protected sites and can get the
whole session blocked. If a page shows a challenge ("Pardon Our Interruption", "Just a moment",
a captcha widget), try the captcha solver (§3a) first; only if that fails or the captcha type isn't
supported, ask the user to clear it in the visible Chrome. Don't retry in a loop.

## 3a. Captcha solver (2captcha)

`CAPTCHA_API_KEY` in `api/.env.staging` is a 2captcha key. The integration lives in
`api/src/integrations/captcha/` (`CaptchaModule` / `CaptchaSolverService`); from this session use the
CLI `api/scripts/solve-captcha.ts` (no Nest bootstrap, ~1s startup, solving takes ~10-60s but can reach
~3 min, and the CLI gives up at 300s — run it with `run_in_background` (or a ≥330s timeout) and read
its output file; a foreground call capped at 180s will cut off a slow solve you've already paid for):

```
cd api
npx dotenv -e .env.staging -- node -r ts-node/register scripts/solve-captcha.ts --balance
npx dotenv -e .env.staging -- node -r ts-node/register scripts/solve-captcha.ts --type=turnstile --url=<page-url> --sitekey=<key>
# --type=recaptcha2 [--invisible] | recaptcha3 [--min-score=0.7 --page-action=x] | image --image-file=<png> [--numeric=1]
# after the page accepts/rejects it: --report=<taskId>:correct|incorrect
```

It prints one JSON line: `{"ok":true,"token":"...","userAgent":"...","taskId":N}` or
`{"ok":false,"code":"ERROR_ZERO_BALANCE",...}` (exit 1). Supported: Cloudflare Turnstile (widget and
Challenge page), reCAPTCHA v2/v3, hCaptcha, image-to-text. Imperva's "Pardon Our Interruption" page
(seen on pelio.eu, housemarket) is just a wrapped **hCaptcha** (`<div class="h-captcha"
data-sitekey=…>`, `js.hcaptcha.com/1/api.js`) — use `--type=hcaptcha`. (hCaptcha is missing from
2captcha's published docs but `HCaptchaTaskProxyless` works; verified ~30s, $0.003.) Not supported:
sgcaptcha, GeeTest-flavoured Imperva pages are solvable only via a GeeTest task (not wired up). For
anything unsupported (or `ERROR_ZERO_BALANCE`, any other `ok:false`) fall back to asking the user to
clear it in Chrome.

Flow when a page is blocked by a captcha:

1. Find the sitekey with `evaluate_script` on the blocked page:
   `() => ({ turnstile: document.querySelector('[data-sitekey].cf-turnstile, .cf-turnstile[data-sitekey]')?.dataset.sitekey,
   recaptcha: document.querySelector('.g-recaptcha[data-sitekey]')?.dataset.sitekey ||
   new URL(document.querySelector('iframe[src*="recaptcha/api2/anchor"]')?.src ?? 'http://x').searchParams.get('k'),
   iframes: [...document.querySelectorAll('iframe')].map(f => f.src).slice(0, 8), url: location.href })`
   If neither key is found, it is not a supported captcha — fall back to the user.
2. Run the CLI with that `--url=<location.href>` and `--sitekey`.
3. Inject the token with `evaluate_script` (embed it via `JSON.stringify`, as in §4):
   - Turnstile: set `input[name="cf-turnstile-response"]`'s value, then call the widget callback if the
     page has one (`window.turnstile` / the `data-callback` function), else submit the enclosing form.
   - hCaptcha (incl. Imperva): set `textarea[name="h-captcha-response"]` and
     `textarea[name="g-recaptcha-response"]` (hCaptcha's compat shim) to the token, then trigger the
     page's own submit path: the `.h-captcha` `data-callback` function if present, else the inline
     script's call (Imperva: `protectionSubmitCaptcha("hcaptcha", payload, 10000, token)` — read the
     page's inline script to see the exact arguments, then call it with the solved token). **Verified
     end to end on pelio.eu (Imperva → hCaptcha), 2026-10-21:** the widget's `data-callback` is
     `solvedCaptcha(payload)`; setting both textareas then `setTimeout(() => window.solvedCaptcha(token), 50)`
     moved the page past the challenge within ~4s both times. If the page doesn't move on, report
     `incorrect`, then follow §3b (retry / poll for a manual clear).
   - reCAPTCHA v2: set every `textarea[name="g-recaptcha-response"]` (`innerHTML` and `value`), then call
     the `data-callback` function (`window[el.dataset.callback](token)`) or submit the form.
4. Check the page actually moved past the challenge (title/URL/listing selector present), then
   `--report=<taskId>:correct` (or `incorrect` if it didn't work — that refunds the solve).
5. Every paid solve is logged to `cost_logs` (CAPTCHA / 2captcha) by `solve-captcha.ts`, `mcp-autocrawl.ts` and the server hook -- but only when the script runs through `dotenv -e .env.staging` so `DATABASE_URL` is set (otherwise it prints "captcha cost NOT logged"). Solves cost money (~$0.003 each) and a token is single-use and short-lived: solve only when blocked,
   inject immediately, and don't solve in a tight loop — see §3b for what to do when a solve fails or
   the same page blocks again right after a successful one.

## 3b. Run fully autonomously (default — the user does not want to be asked or to prompt you)

The crawl only advances while you keep issuing tool calls. **A text-only message ends your turn and
the crawl stops until the user sends something** — that is why users end up typing "status?" / "go".
So:

- **Never end a turn while pages are pending.** Chain the driver call (`evaluate_script` →
  `eval(localStorage.mcpDriver)`) page after page. Status text is optional and short, and must always be
  followed by the next tool call in the same message. Don't answer "status?" with a text-only stop;
  answer in one line and keep calling. Don't offer to skip/pause an agency or ask whether to proceed on
  a big one (the user has said so explicitly).
- **Detect blocks yourself.** The driver returns `{blocked:true,…}` when the title matches a challenge
  (Imperva "Pardon Our Interruption", "Just a moment", "Attention Required") or the body is nearly
  empty. Handle it immediately, in the same turn:
  1. Read the sitekey / `data-callback` (`document.querySelector('.h-captcha[data-sitekey]')`; for
     Turnstile/reCAPTCHA see the §3a probe).
  2. Start the solver **once** with `Bash run_in_background` (§3a). Keep the turn alive while it runs by
     polling the page every ~15s (`async () => { await new Promise(r => setTimeout(r, 15000)); return
     await eval(localStorage.getItem('mcpDriver')); }`) — if the user clears the captcha manually the
     poll resumes the crawl on its own; then `Read` the solver's output file when its notification
     arrives (don't start a second solve for the same block).
  3. Inject the token (§3a step 3), confirm the page left the challenge, `--report=<taskId>:correct`,
     and continue the driver.
- **Never miss a block (detection only happens when a tool call returns):**
  - Every driver call must report block state, including when it errors. On *any* error
    (`Execution context was destroyed`, navigation timeout, empty result) check the page before retrying:
    `() => ({t: document.title, u: location.href, blocked: /Pardon Our Interruption|Just a moment|Attention Required|Access Denied/i.test(document.title) || !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"], #cf-challenge-running')})`.
    Treat `blocked:true` from this check exactly like a `{blocked:true}` driver result.
  - A repeated driver result (same `done` URL twice, or `pending` not decreasing over 3 calls) means a
    silent block or stall: run the check above, don't just keep calling.
  - Don't spend a turn on text only — not for status, not for "the user hasn't heard from you" nudges.
    Put the one-line status in the same message as the next tool call.
  - After an Edit/Write/long Bash wait, the very next call must be the block check/driver call, never a
    pause. If a long background job (ingest, normalization) runs while pages remain, interleave driver
    calls with it.
- **When a solve fails** (`CAPTCHA_SOLVE_TIMEOUT`, `ERROR_ZERO_BALANCE`, unsupported type, or the page
  doesn't accept the token): report `incorrect` if a token was injected, retry the solve at most twice
  for that block (a timed-out task isn't charged), and after that just keep polling every ~15s so a
  manual clear by the user resumes the crawl — still without ending the turn. If the *same* page blocks
  right after a successful solve, retry once more, then fall back to polling.
- **Pacing:** since captchas are now solved automatically, a block only costs ~30–180s of solve time,
  so use a short randomized per-page wait (~250–650ms, e.g. `250 + Math.random()*400`); measured ~3s/page
  on pelio (344 pages, 3+ solves). Back off to 1.5–3s if blocks start arriving back-to-back.
- **Big agencies (>~500 listings):** localStorage (~5MB) is not enough for the collected items; store
  them in IndexedDB instead (see the driver pattern used for housemarket-realestate: open db
  `mcpcrawl`, store `items`, `getAll()` to compute pending) and keep only `mcpExpect`/`mcpDriver` in
  localStorage.
- **Finish the job in the same run:** when `pending` reaches 0, dump the items (`evaluate_script` with
  `filePath`), strip the driver-only `_detail_done` flag, run the §6 ingest (dry-run, then real in the
  background), wait for the crawl's FINAL step to finish (§2 step 4, §7 — not just the chunk job),
  restore the tracked agency's auto-update flag **to its original value** (it may already have been
  `false`), verify the removals (§8a), and then report in a few lines: how many listings are held at
  `/dashboard/properties?pending_crm_update=true` for review, and any problem. Don't wait for the user
  to push; §9 runs when they tell you they did. Keep all working files (driver, items, logs) in the
  scratchpad / `%TEMP%`, never in the repo, and delete them when the agency is done (§10). If you have
  to abandon a run, tell the user where the partial state is instead of committing it.
- A push notification is skipped while the user's terminal is active, so don't rely on it.

## 3c. Preferred for big or captcha-heavy agencies: the autonomous watcher (no session involved)

§3b still depends on *your* tool calls returning, so a block can sit unnoticed. For anything with more
than a few dozen pages or a WAF that blocks, use `api/scripts/mcp-autocrawl.ts` instead: it launches its
**own visible Chrome** (Playwright, `channel:'chrome'`, persistent profile in `%TEMP%/mcp-autocrawl-profile`
— the MCP's Chrome can't be attached to from outside, it runs over a pipe), runs the site's `driver.js`
(same file as §3b: async IIFE over IndexedDB `mcpcrawl`/`items` + `localStorage.mcpExpect`, returns
`{pending,next}` or `{blocked:true}`) in a loop, and **solves captchas itself** (2captcha, same services
as `solve-captcha.ts`: hCaptcha/Imperva, Turnstile, reCAPTCHA v2), injects the token, checks the page
moved on, reports correct/incorrect and continues. Failed solves back off and retry; it never stops on a
block.

```
cd api
$env:TS_NODE_TRANSPILE_ONLY=1   # (PowerShell)  | TS_NODE_TRANSPILE_ONLY=1 in bash
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/mcp-autocrawl.ts \
  --driver=<driver.js> --start=<first url to crawl> --out=<items.json> [--seed=<items.json>] [--max-minutes=N]
```

- **Start it detached** (PowerShell `Start-Process cmd.exe -WindowStyle Hidden -ArgumentList '/c', '<cmd> > out.txt 2>&1'`),
  not as a Bash `run_in_background` job — those are capped at 10 min and a big crawl takes longer.
- `--seed=<items.json>` (`{source_url, raw}[]`, e.g. the collected listing items) is added to IndexedDB for
  every key not already there (done items are kept), so restarting resumes where it left off. The Chrome
  profile keeps IndexedDB between runs.
- Progress: one line per page appended to `<out>.log` (`#n {done,pending,next}`; `BLOCK …`, `SOLVED task …`,
  `token not accepted`, `stall on …` lines for blocks); a checkpoint is written to `<out>.checkpoint.json`
  every 50 pages. At `pending 0` it writes `<out>` (driver-only `_detail_done` stripped) — go straight to
  the §6 ingest.
- Your job meanwhile: check `<out>.log` occasionally (tail it); don't drive pages yourself in parallel.
  Process died or log stale >5 min → look at the `.stdout.txt`, fix, restart the same command (it resumes).
- If the site needs a listing walk first, run the driver's listing mode the same way (the driver decides
  listing vs detail from the URL) or collect the listing items via §4 and pass them as `--seed`.

## 4. Listing-page walk

Open the start URL in its own page/tab (`mcp__chrome-devtools__new_page` with `config.start_url`),
then extract with `mcp__chrome-devtools__evaluate_script`. **`evaluate_script`'s `args` only accepts
element `uid`s from a snapshot — you cannot pass a config object through `args`.** Build the config
into the function string itself via `JSON.stringify`, e.g.:

```js
const fieldsJson = JSON.stringify(config.fields ?? {});
const listingSelectorJson = JSON.stringify(config.listing_selector);
const script = `() => {
  const FIELDS = ${fieldsJson};
  const LISTING_SELECTOR = ${listingSelectorJson};
  ${LISTING_EXTRACTOR_BODY}
}`;
// then: evaluate_script({ pageId, function: script, waitForStableDom: true })
```

`LISTING_EXTRACTOR_BODY` — ported field-by-field from `FieldExtractionService.extractField`
(`api/src/integrations/crawler/services/field-extraction.service.ts`) and the listing-image /
`source_url` resolution from `CrawlerService.scrapeListingPages`
(`api/src/integrations/crawler/services/crawler.service.ts` ~lines 296-348), so results match what a
normal crawl would have produced:

```js
function extractField(cardEl, def) {
  const selector = typeof def === 'string' ? def : (def.selector ?? '');
  const type = typeof def === 'string' ? 'text' : (def.type ?? 'text');
  try {
    const el = selector ? cardEl.querySelector(selector) : cardEl;
    if (!el) return null;
    if (type === 'href') return el.getAttribute('href') || null;
    if (type === 'src') {
      const src = el.getAttribute('src') || null;
      if (src && src.toLowerCase().startsWith('data:')) {
        return el.getAttribute('data-src') || el.getAttribute('data-lazy-src') ||
               el.getAttribute('data-original') || null;
      }
      return src;
    }
    if (type === 'background_image') {
      const style = el.getAttribute('style') || '';
      const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
      return m ? m[1] : null;
    }
    // text: struck-through/discounted-price elements should read the PARENT's
    // text (the parent usually holds "old price / new price" together) --
    // mirrors FieldExtractionService's DEL/S/STRIKE + line-through detection.
    const isStruck = el.tagName === 'DEL' || el.tagName === 'S' || el.tagName === 'STRIKE' ||
      getComputedStyle(el).textDecorationLine.includes('line-through');
    if (isStruck && el.parentElement) {
      const parentText = el.parentElement.textContent?.replace(/\s+/g, ' ').trim();
      if (parentText) return parentText;
    }
    return el.textContent?.replace(/\s+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

function extractListingImages(cardEl) {
  const imgs = [];
  cardEl.querySelectorAll('[style]').forEach((node) => {
    const m = (node.getAttribute('style') || '').match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
    if (m?.[1]) imgs.push(m[1]);
  });
  cardEl.querySelectorAll('img').forEach((node) => {
    const src = node.getAttribute('src') || '';
    if (src.startsWith('data:')) {
      const lazy = node.getAttribute('data-src') || node.getAttribute('data-lazy-src') ||
                   node.getAttribute('data-original') || '';
      if (lazy) imgs.push(lazy);
    } else if (src) {
      imgs.push(src);
    }
  });
  return [...new Set(imgs)].filter((src) => !src.startsWith('data:'));
}

const cards = Array.from(document.querySelectorAll(LISTING_SELECTOR));
const items = cards.map((card) => {
  const raw = {};
  for (const [name, def] of Object.entries(FIELDS)) raw[name] = extractField(card, def);
  raw._all_images = extractListingImages(card);
  let sourceUrl = raw.url ?? raw.href ?? null;
  if (sourceUrl && !String(sourceUrl).startsWith('http')) {
    try { sourceUrl = new URL(sourceUrl, location.href).href; } catch {}
  }
  if (!sourceUrl) sourceUrl = location.href;
  return { source_url: sourceUrl, raw };
});
return items;
```

Accumulate results into a `Map<source_url, item>` across pages (last-seen wins) so re-extracting an
unchanged page is naturally idempotent. Handle pagination per `config.pagination.type`:

- **`next_button`**: take a snapshot (`mcp__chrome-devtools__take_snapshot`) to get the button's
  `uid`, `mcp__chrome-devtools__click` it, wait briefly, re-run the extraction above. Stop when the
  button is no longer present/clickable, or the cap (§3) is hit.
- **`load_more`**: same click, but cards accumulate on the *same* page — re-run the extraction over
  the whole page each time (the `Map` dedupes). Stop when the button disappears or the item count
  stops growing between clicks.
- **`infinite_scroll`**: `evaluate_script` with `() => window.scrollTo(0, document.body.scrollHeight)`,
  wait ~1-2s, re-run extraction. Stop when item count stops growing after a scroll, or the cap is hit.
- **`url_param`**: navigate (`mcp__chrome-devtools__navigate_page`) to
  `${start_url}` + (`?`/`&`) + `${config.pagination.url_param}=N` for increasing `N`, extract each
  page. Stop when a page adds 0 new `source_url`s, or the cap is hit.
- **`none`**: single page, no pagination loop.

Add a short (~1-2s) delay between page loads/clicks — this whole skill exists because a site's bot
protection is sensitive; hammering it defeats the point.

## 5. Detail-page walk

For each item up to the cap, navigate to its `source_url` and run
`mcp__chrome-devtools__evaluate_script` again. The extraction body here is ported **nearly verbatim**
from `DetailEnrichmentService`'s `page.evaluate()` callback
(`api/src/integrations/crawler/services/detail-enrichment.service.ts` lines ~382-796) — that inner
function is already pure DOM JS with no Playwright dependency, so copy it directly (embed
`config.detail_page` the same `JSON.stringify` way as §4), just rename the outer wrapper to
`() => { const cfg = ${JSON.stringify(config.detail_page ?? null)}; ... return {...}; }` and drop the
one Playwright-specific bit (`page.evaluate((cfg) => {...}, detailConfig)`'s second-argument
mechanism — `cfg` becomes a literal instead of a passed argument). It returns
`{ images, raw_detail_text, detail_specs, detail_features, external_id, title, price, location,
latitude, longitude }`.

Merge each result into the item's `raw`, mirroring `applyResult()` in that same file:

```js
item.raw._all_images = [...(item.raw._all_images ?? []), ...detail.images]; // dedup happens in mcp-crawl-ingest.ts via mergeImagesDedupingSizeVariants
item.raw._detail_text = detail.raw_detail_text;
if (Object.keys(detail.detail_specs).length) item.raw._detail_specs = detail.detail_specs;
if (detail.detail_features.length) item.raw._detail_features = detail.detail_features;
if (detail.external_id) item.raw._external_id = detail.external_id;
if (detail.title) item.raw.title = detail.title;
if (detail.price) item.raw.price = detail.price;
if (detail.location) item.raw.location = detail.location;
if (detail.latitude != null && detail.longitude != null) {
  item.raw.latitude = detail.latitude;
  item.raw.longitude = detail.longitude;
}
```

If a detail page itself looks blocked/challenged (title like "Just a moment...", "Attention
Required", empty body, or a redirect away from the listing), don't force it — set
`item.raw._detail_enrichment_error = "<reason>"` and move on; `mcp-crawl-ingest.ts` still upserts a
touch-update for those instead of failing the whole run (same as a normal crawl's behavior for a
flaky detail page).

Skip uploading detail-page HTML to GCS (`raw_html_path`) — that's a nice-to-have diagnostics artifact
in the normal pipeline, not required for normalization to work.

## 6. Ingest: SourceProperty upsert → AI normalization → UserProperty

Write the collected items (`Array<{source_url, raw}>`, from the `Map` in §4 merged with §5's detail
results) to a JSON file, then:

```
cd api
npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/mcp-crawl-ingest.ts --scraper-id=<scraper-id> --items-file=<path-to-json> --dry-run
```

Check the dry-run output (item count, any pre-flight safety-check error) before the real run, then
drop `--dry-run`. This script:

- Upserts `SourceProperty` rows using the *exact same* field mapping and pure utility functions
  (`extractDenormalizedRawFields`, `extractSourcePropertyIds`, `extractPriceFromText`, `contentHash`,
  `mergeImagesDedupingSizeVariants`) that `crawl.processor.ts` uses for a normal crawl — see that
  script's header comment for the full reuse rationale.
- Creates a real `CrawlRun` row so the normal admin Crawl Runs / Job Queue pages can track it.
- Calls the real `PropertyNormalizationService.normalizeForCrawlRun()` — the same AI normalization
  a normal crawl triggers, which resolves `estateweb_type_id`/`estateweb_location_id` and creates
  `Property` rows, which in turn auto-creates `UserProperty` rows for every enabled tracked user of
  this agency (`UserPropertiesService.syncForProperty`).
- **Never pushes to the CRM** — see §2 and the script's own header comment for why that's
  structurally true, not just "it happens not to."

Normalization is enqueued, not awaited in-process (chunked BullMQ jobs or an OpenAI Batch submission,
same as a normal crawl) — it keeps running after the script exits. Watch it via the app's Crawl Runs
page for this `CrawlRun` id, or the Job Queue.

If normalization silently produces nothing (no `Property`/`UserProperty` rows appear after a while),
don't re-diagnose from scratch — `scraper-generation` SKILL.md §8/§9 already documents this exact
pipeline's stuck/silent-skip failure modes (AI key resolution falling back to the wrong tracker,
normalization guard conflicts, etc.); the same diagnosis applies here since it's the same
`normalizeForCrawlRun()` call.

## 7. Verify the ingest, restore auto-update at the right moment, hand the held listings to the user

Nothing so far has touched EstateWeb except removals (§2 caveat). Verify the rows yourself, then
restore the auto-update flag **only when the crawl's final step has run** (below), and tell the user the
new/changed listings are waiting at `/dashboard/properties?pending_crm_update=true` (filter by the
agency) for them to review and push. Don't wait for them.

Before restoring the flag, run the **source-image check** (read-only SQL). Every
`UserProperty` in scope must already carry source images, otherwise there is nothing to push later:

```sql
select count(*) total,
       count(*) filter (where images is null or images::text in ('[]','null')) no_source_images
from user_properties
where user_id = '<tracker-user-id>' and canonical_property_id in (
  select l.property_id from property_source_links l
  join source_properties sp on sp.id = l.source_property_id
  where sp.source_agency_id = '<agency-id>');
```

**This check is mandatory and runs BEFORE you report to the user, never after they push.** Run it
for every agency, over the held rows (`pending_crm_update`), and put the result in the report. If
`no_source_images > 0`, the detail-page extraction (§5) missed the gallery for those listings —
fix the extraction and re-ingest; don't move on. Also look for **placeholder photos**: one image
URL shared by several different listings of the agency (`_all_images` of the items file) means the
site has no real photo for them — normalization drops it and they end up with 0 images. Tell the
user those listings have no photos on the site so they can leave them unpushed. A listing with only
1 photo is fine if the live detail page really has 1 gallery image (spot-check one).

**When is it safe to restore the flag?** Not when the `normalize-crawl-chunk` job shows `COMPLETED`: the
crawl's finalization (removal detection, content production, `planAndEnqueueCrawlSync`) runs *after*
it and reads the flag when it runs. Poll (every ~15s, no user prompt) until **all** hold:

```sql
select metadata->>'normalization_status' as norm, total_removed from crawl_runs where id = '<crawl-run-id>';
select id, status, total_created, total_updated, total_removed from cms_sync_runs where crawl_run_id = '<crawl-run-id>';
select count(*) from notifications where crawl_run_id = '<crawl-run-id>';   -- removal-spike notice, if any
```

`norm = 'completed'`, every new `SourceProperty` is linked to a `Property`, and the `cms_sync_runs`
rows (a removals-only run, or none if nothing was removed) have stopped changing for ~1 minute. Restoring
before that lets the finalization see `auto_update_to_crm = true` and push the creates/updates too.
Check the held rows afterwards. Count them through the canonical property, never through
`up.property_id` (that column is the agency's external id, a string, and a join on it silently
returns 0):

```sql
select count(*) from user_properties up
join property_source_links l on l.property_id = up.canonical_property_id
join source_properties sp on sp.id = l.source_property_id
where sp.source_agency_id = '<agency-id>' and up.pending_crm_update;
```

Report that number to the user, not an assumption (a re-ingest with a changed driver marks existing
listings as changed too).

## 8. The user reviews and pushes (the skill never pushes creates/updates itself)

The new/changed listings sit at `/dashboard/properties?pending_crm_update=true` until the user presses
the app's own push button. Only removals have already been sent (§2 caveat). Tell the user so in the
final report; don't push for them and don't wait for them. A `FAILED` removals run or `total_failed > 0`
in `cms_sync_runs` for the `CrawlRun` is a **problem** — read its `error_message`/`payload`, try to fix
the cause, and tell the user if you can't.

Why §9 exists: for an agency whose site blocks the server, the server can't download the photos
either (a bare `fetch()` hits the same WAF), and the CRM push treats that as success — the listings
can be created/updated **with zero photos** and no error is shown (the CREATE path's `uploadImages`
only logs a warning per failed image, `cms_sync_runs` still says `SUCCESS`, `total_failed = 0`).
Some blocked agencies still get their photos through anyway, so never assume either way — verify. The
push also produces the translated content itself (§9b).

### 8a. Verify the removals

If the run has `total_removed > 0` (or a "Property removal spike" notification appeared), confirm the
removed listings really are gone: take the `payload.operations` with `operation = 'REMOVE'`, map them
to their `source_url`, and open each in the real browser (the §3c watcher with a tiny read-only driver
that records `document.title`, the listing's own h1/price/gallery and the page text works, and solves
captchas itself). A genuinely removed listing shows a 404, a "not published" page or a generic search
page with no gallery. If a removed listing is **still live**, that is a problem: tell the user which
ones. Otherwise say nothing about removals.

**When the app holds the removals back.** If many listings vanished (a big drop vs the previous crawl), the
app's removal-spike guard skips marking them removed and raises a `PROPERTY_REMOVAL_SPIKE` notification
("removals held back"); the listings stay ACTIVE and in the CRM, and no `cms_sync_runs` row appears. This
is the guard working, not an error. Verify every missing listing against the live site (same browser
check as above, including the ones the guard skipped: take the agency's ACTIVE `source_properties` whose
`source_url` is not in the new items). If **all** are gone, the drop is legitimate: ask the user once
("remove these N listings from the CRM?") and, on a yes, re-run the same ingest with
`--skip-spike-check` (sets `metadata.skip_spike_check` on the new CrawlRun, same as the admin "Run now"
option), with auto-update off and restored afterwards as in §2. The REMOVE operations are then pushed
regardless of auto-update. Never skip the check without having verified each listing.

## 9. Image gate — verify the real CRM, fix missing photos on your own (never wait to be told)

Missing photos must never reach the client. The user may push at any time without telling you, so do
**not** depend on being told. Run this gate:
1. when the user says they pushed or asks about photos;
2. **only once the user has named an agency to crawl**, as a sweep over every blocked-agency scraper
   (`--agency=<id>` for each one crawled this way, not just the one at hand), and fix whatever is found.
   **Never run it just because the skill was loaded** — with no agency given, offer the two options in
   "Start" at the top of this file and do nothing else;
3. **whenever anyone reports missing images** (e.g. the client says "N listings have no photos"): run the
   `--agency` check for that agency and fix **every** listing it returns, not only the number reported
   (the client's count was 5, the check found 6);
4. in the final report of a crawl, add one line telling the user that photos get verified the next time
   the skill runs or when they say the push is done.

Run it once the new `cms_sync_runs` rows are `SUCCESS`. Wait until the new
`cms_sync_runs` row(s) after the ingest are `SUCCESS`, then check the **live EstateWeb records** (not the
cached gallery, and do not ask the user to spot-check) with the read-only script, which calls EstateWeb
through the agency's own integration; fix any missing photos without asking and tell the user only if
a problem remains:

```
cd api
TS_NODE_TRANSPILE_ONLY=1 npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/check-estateweb-images.ts --cms-sync-run=<cms-sync-run-id>
# or every pushed listing of the agency: --agency=<source-agency-id>
```

It prints one line per listing, then `SUMMARY checked=N missing=M errors=E` and, if `M > 0`,
`MISSING_IDS=<user_property id>,...`. Run it once per `cms-sync` run created by the user's push (CREATE and
UPDATE operations are checked; REMOVE are not). Properties with no `integration_property_id` yet
haven't been pushed — out of scope, not "missing images".

- `missing = 0` and `errors = 0` → nothing to fix and **nothing to tell the user** about photos.
- `missing > 0` → **fix it yourself, automatically, without asking**: push the photos through a real
  local Chrome with the existing script, which needs the CRM listing to already exist (that's why this
  comes after §8). Use `--property-ids` with ONLY the `MISSING_IDS` — the script has no de-dup, so never
  run it by `--agency` over listings that already have photos, and never re-run it on one that succeeded
  (duplicate photos in EstateWeb):

```
# 1) dry-run: confirm the list and image counts
TS_NODE_TRANSPILE_ONLY=1 npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --property-ids=<id1,id2,...> --dry-run
# 2) real run on ONE property first, then re-run check-estateweb-images.ts and confirm it now has images
# 3) real run on the rest (batches of ≤150 ids), redirected to a log file (needed for --retry-log if some images fail)
```

  Then re-run `check-estateweb-images.ts`; it must end with `missing=0`. If images fail to download
  even through Chrome, use `--retry-log=<log>` (re-uploads only the failed URLs). Only if listings are
  still missing photos after that — or the check itself keeps erroring — tell the user, with the count
  and the listing ids.
- `errors > 0` (a listing couldn't be read from EstateWeb) → retry once; if it persists, that is a
  problem to report.

Notes that cost time before:
- The script (like `mcp-crawl-ingest.ts`) bootstraps the whole Nest app: run it **in the
  background** with `TS_NODE_TRANSPILE_ONLY=1`, no short timeout, and **don't kill it mid-run**
  (a killed ingest leaves normalization half-started and the `CrawlRun` stuck).
- **Windows command-line limit:** `npx` goes through `cmd.exe`, which silently truncates a command line at ~8,000 chars. A `--property-ids` list of ~220+ UUIDs gets cut off with no error (the script then says `Selected N` with a smaller N than you passed). Pass **at most ~150 ids per run**, run the batches one after another (never two Chromes at once), and compare the script's `Selected N` to what you passed.
- It opens a visible Chrome window; tell the user to leave it alone until it finishes.
- Its default targets are "scrapers with `use_managed_browser = true`" — often none — so always
  pass `--agency` or `--property-ids` explicitly.
- If `.env.production` can't connect, check whether `.env.staging` does (they can differ); and if a
  `REDIS_URL` host doesn't resolve from this machine (internal hostname), you need the publicly
  reachable one — set it in the process environment for that run rather than editing the env file.

## 9b. Localized content — produced by the push; only run it manually when no push happened

A crawl/ingest never creates translated text: `property_localized_contents` rows (TITLE/DESCRIPTION per
language) only appear when content production runs (the app's "Produce content" action, or a push).
**The CRM push (§8) runs content production itself** for every property it sends (the orchestrator calls
`produceForUserProperties` before building the operations), so when the push ran there is nothing to do
here; the Localized content tab stays empty only until the push. Run the steps below only when no push
happened (the tracker's original auto-update was `false`) **and** the user wants the translations without
pushing. Do not assume which languages or strategies apply: read the tracker's real config first and let
the app's own job apply it:

```sql
select co.language, co.title_strategy, co.description_strategy, co.description_content_language
from content_publishing_configs cp join content_outputs co on co.config_id = cp.id
where cp.user_tracked_agency_id = '<tracker-id>' order by 1;
```

Then enqueue the real `content-production` job (same payload as `UserPropertiesService.produceContent`: a
`job_log` row plus one BullMQ job) for only this agency's properties that have a description, with
`run_translations: true`, `run_ai_titles: false` (titles already exist; set true only if the config needs
them and they are missing), `regenerate: false`, `push_to_crm: false`, using a throwaway `_tmp-*` script
that you delete afterwards. Verify with a count of `property_localized_contents` by `content_type` and
`language` for the agency. A language that reuses another language's text through
`description_content_language` has no row of its own, which is expected. Properties whose source has no
description legitimately stay empty.

## 10. Clean up when the agency is done

Before reporting, remove everything you created only to run the crawl. Keep only what is worth keeping.

- Delete **all** of the agency's working files: `driver.js`, `items.json`, `ingest*.log`,
  `resolve-*.log`, `stdout*.txt`, `items.json.log`, `items.json.checkpoint.json`, and any backup or
  seed copy of the items (e.g. `items.v1.json`). Nothing is kept: the DB has the data, and the driver is
  rebuilt from the scraper config next time. Work in the scratchpad / `%TEMP%` from the start so there is
  nothing in the repo to delete; `docs/mcp-crawl-progress/*/` is gitignored and must stay empty.
- Delete the throwaway scripts you wrote (`_q*.cjs`, `_tmp*.ts`/`.cjs` in `api/`, `api/scripts/` and
  `scripts/scraper-generator/`) as soon as each has served its purpose, and any scratch files in `%TEMP%`.
- Delete the per-agency Chrome profile directories you passed to `mcp-autocrawl.ts` via `--profile`
  (`%TEMP%/mcp-autocrawl-<agency>*`), after confirming no `mcp-autocrawl` process or Chrome using them is
  still running. Leave the default shared `mcp-autocrawl-profile` alone.
- If you need a one-off job restricted to one agency (e.g. re-resolving EstateWeb locations), copy the
  generic script to a `_tmp-*` file with the agency filter, run it, and delete the copy. Never run the
  `*-all-user-properties-*` scripts as they are: they act on every user's properties.
- Finish with `git status` and confirm that the only untracked paths are the ones you meant to keep.
