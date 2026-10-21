---
name: mcp-crawl
description: Crawl one property-sync Scraper via the chrome-devtools MCP browser (a real, visible Chrome) instead of the server's Playwright crawler, when that agency's site blocks the server's datacenter IP (Cloudflare/WAF bot protection). Runs AI normalization and creates UserProperty rows for tracked users, but never pushes to the CRM. Use when asked to "crawl <scraper/agency> with chrome mcp", "the crawler is blocked/getting 403s for this agency", or when scraper-generation SKILL.md's diagnosis points at bot-management blocking, not a broken selector.
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
`Property`/`UserProperty` creation) a normal crawl uses. It deliberately stops there — it never
pushes anything to the CRM (see §7).

This is the sibling of `scraper-generation` (which *authors* a `Scraper`/`ScraperVersion.config`).
This skill *runs* an existing one through a different transport when the normal one is blocked. If
the scraper doesn't have a working config yet, use `scraper-generation` first.

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
   auto_update_to_crm = true;` (prod DB, so tell the user in one line that you did it).
3. Crawl and ingest (§4-§6) with the flag off. **Never** use `--force` to get past the check.
4. **Restore it only once normalization has finished** — the `normalize-crawl-chunk` job(s) for the
   `CrawlRun` are `COMPLETED` and the `Property` count has reached the item count (see §7). Turning
   it back on earlier lets the still-running normalization auto-push to the CRM. Then
   `update user_tracked_agencies set auto_update_to_crm = true where id = '<uta.id>' and
   auto_update_to_crm = false;` and tell the user it is back on.
5. If the run is abandoned or blocked (bot challenge you can't clear), restore the flag right away
   — never leave a user's auto-update off unannounced. Say in the final reply whether it is on or
   off and what it was before.

Restoring it does not push anything by itself, but later syncs for that user will resume pushing
normal updates; the listings this skill created still need the user's review (§7) and the
no-photos warning (§8) before they press "Update CRM".

**Caveat — removals are pushed even with auto-update off.** A full-coverage ingest runs removal
detection, and the app then enqueues a `cms-sync` job that sends `REMOVE` operations to the CRM for
listings that disappeared from the site, regardless of `auto_update_to_crm` (seen on a realeze run:
one genuinely unpublished listing was removed from the CRM minutes after ingest). Creates/updates
are what the flag holds back. So after ingest, look at `cms_sync_runs` for the `CrawlRun`
(`total_removed`, `payload.operations`) and tell the user about any removals; verify a sample
against the live site (e.g. a "property is not published" page) before calling them correct.

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
     page's inline script to see the exact arguments, then call it with the solved token). **Untested
     end to end** — if the page doesn't move on, report `incorrect`, then ask the user.
   - reCAPTCHA v2: set every `textarea[name="g-recaptcha-response"]` (`innerHTML` and `value`), then call
     the `data-callback` function (`window[el.dataset.callback](token)`) or submit the form.
4. Check the page actually moved past the challenge (title/URL/listing selector present), then
   `--report=<taskId>:correct` (or `incorrect` if it didn't work — that refunds the solve).
5. Solves cost money (~$0.003 each) and a token is single-use and short-lived: solve only when blocked,
   inject immediately, and don't solve in a loop — if the same page blocks again right after a
   successful solve, stop and ask the user.

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

## 7. Review before touching the CRM at all

Stop here and tell the user to review the new `UserProperty` rows for this agency in the dashboard
(`/dashboard/properties`, filtered by agency) before anything else happens. Nothing so far has
touched EstateWeb.

Before calling the rows "reviewed/ready", run the **source-image check** (read-only SQL). Every
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

If `no_source_images > 0`, the detail-page extraction (§5) missed the gallery for those listings —
fix the extraction and re-ingest; don't move on.

Also tell the user, in one line, that normalization is done when the `normalize-crawl-chunk` job in
`job_logs` (filter by the `CrawlRun` id) is `COMPLETED` and the `Property` count reaches the item
count — the `CrawlRun.metadata.normalization_status` can stay `running` even after that, so don't
wait on it.

## 8. The user presses "Update CRM" — warn them what it will do to images

This skill never pushes properties itself; that is the app's explicit "Update CRM" / "Push to CRM"
button. **Warn the user before they press it**: for an agency whose site blocks the server, the
server can't download the photos either (a bare `fetch()` hits the same WAF), and the CRM push
treats that as success — so the listings are created/updated **with zero photos** and no error is
shown (the CREATE path's `uploadImages` only logs a warning per failed image, `cms_sync_runs` still
says `SUCCESS`, `total_failed = 0`). That is expected; §9 fixes it. Never tell the user the work is
"done" or "ready" at this step.

## 9. Image gate — do NOT report "ready/done" until every listing has photos in the CRM

After the user says the push finished, verify the CRM listings really have images. Check the cached
CRM gallery (it is refreshed after each push/upload):

```sql
select count(*) total,
       count(*) filter (where ip.images is null or ip.images::text in ('[]','null')) missing_images
from user_properties up
join integration_properties ip on ip.user_property_id = up.id
where up.user_id = '<tracker-user-id>' and up.integration_property_id is not null
  and up.canonical_property_id in (
    select l.property_id from property_source_links l
    join source_properties sp on sp.id = l.source_property_id
    where sp.source_agency_id = '<agency-id>');
```

Also ask the user to open one listing in EstateWeb as a spot-check (the cache is only a cache).
Properties with no `integration_property_id` yet haven't been pushed — they are out of scope here,
not "missing images".

If `missing_images = 0` → report ready. If `> 0` → **fix it yourself, don't hand it back**: push the
photos through a real local Chrome with the existing script, which needs the CRM listing to already
exist (that's why this comes after §8). Use `--property-ids` with ONLY the missing ones (take the
`up.id`s from the query above) — the script has no de-dup, so never run it by `--agency` over
listings that already have photos, and never re-run it on one that succeeded (duplicate photos in
EstateWeb):

```
# 1) dry-run: confirm the list and image counts
TS_NODE_TRANSPILE_ONLY=1 npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --property-ids=<id1,id2,...> --dry-run
# 2) real run on ONE property first, check it succeeded (and the gallery in EstateWeb)
# 3) real run on the rest, redirected to a log file (needed for --retry-log if some images fail)
```

Then re-run the §9 query; only when `missing_images = 0` say it's done. If images fail to download
even through Chrome, use `--retry-log=<log>` (re-uploads only the failed URLs).

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
