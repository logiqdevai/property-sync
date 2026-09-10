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

## 3. Decide the run size

Default to a **small first run** — stop after roughly **20 properties** (fewer detail-page
navigations against a bot-protection-sensitive site, faster to review, cheap to redo bigger once you
know the config still matches the live site). Only crawl the full listing set if the user explicitly
asks for it. Track a running count as you go (§4) and stop once you hit the cap, even mid-page.

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

## 8. Once confirmed: push images

Only after the user explicitly confirms the `UserProperty` rows look correct, push their images to
EstateWeb using the existing `push-images-via-local-chrome.ts` script (same local-Chrome-bypasses-
Cloudflare approach as this skill, already built and safe to reuse as-is):

```
npx dotenv -e .env.production -- node -r tsconfig-paths/register -r ts-node/register scripts/push-images-via-local-chrome.ts --agency=<domain-substring> --dry-run
```

Check the dry-run listing matches expectations, then drop `--dry-run` to actually push. See that
script's own header comment for its full flag reference (`--property-ids`, `--limit`,
`--retry-log`). This skill does **not** cover pushing the properties themselves to the CRM (only
images) — that's the existing "Push to CRM" action in the app, a separate, explicit, user-triggered
step outside this skill's scope.
