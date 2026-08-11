---
name: scraper-generation
description: Build or fix a scraper (Scraper + ScraperVersion.config) for a real-estate agency site in property-sync, especially "hard" sites with no obvious unified listings page, sites that need one property category included/excluded, or a scraper whose crawl/normalization pipeline is stuck/broken. Use when asked to "create a scraper for <agency/url>", "the scraper isn't finding X", "exclude category Y", or "no properties/user properties were created after a crawl".
metadata:
  version: "1.0.0"
---

# Property-Sync Scraper Generation Playbook

Distilled from actually building scrapers for `euroland-crete.com` (WordPress) and `cretahouses.gr`
(Laravel), and from diagnosing a stuck production crawl end-to-end. Read this before improvising —
most of it is non-obvious and was learned the hard way by inspecting the real system.

## 0. Access you need

- **`DATABASE_URL`** — ask the user, or read it from `api/.env.production` / `api/.env.staging`.
  In this project both files point at the **same** Postgres instance — there is effectively one
  shared DB for prod and staging, not two.
- **`REDIS_URL`** — same env files. Only needed if you're debugging a stuck crawl (§8).
- **No browser-automation MCP is normally connected** in this project's sessions, even if the user
  says "use chrome mcp." Don't block on that — fall back to `curl` for static HTML inspection and a
  throwaway Playwright script for anything that needs real rendering/pagination verification (see §5).
  Playwright + `pg` are already installed under `scripts/scraper-generator/node_modules` — run scripts
  from inside that directory (or `api/`, which also has `pg`) so imports resolve; a script placed
  elsewhere (e.g. a temp/scratch dir) fails with `MODULE_NOT_FOUND`.

## 1. Find the agency, check for an existing scraper

```sql
select id, name, base_url, is_visible, is_enabled, content_language, crawl_interval
from source_agencies where base_url ilike '%<domain>%';   -- or: where id = '<uuid>'

select id, name, status from scrapers where source_agency_id = '<agency-id>';
```

If a `Scraper` already exists, don't create a second one — you'll violate the pattern every part of
the system assumes (one active scraper per agency). Fix/replace the existing `ScraperVersion` instead.

## 2. Find the real "browse everything" URL

Sites almost always have one, even when nothing in the nav links to it directly. Check in this order:

**WordPress sites** — fetch `{base_url}/sitemap_index.xml` (Yoast SEO default). It lists per-post-type
sitemaps, e.g. `property-sitemap.xml`. The post type's own **archive page** (e.g. `/properties/` for
post type `property`) usually paginates through the *entire* inventory even when every nav link only
points at curated category subsets. Don't assume `/page/N/` pagination — grep the page for
`<link rel="next" href=...>` or a `.pager`/`.pages` block; plugins like Search & Filter Pro use their
own query param instead (e.g. `?sf_paged=N`) and silently ignore or redirect `/page/N/`.

**Non-WordPress sites (Laravel/custom, etc.)** — view-source a category listing page and find its
filter/search `<form action="..." method="GET">`. Try hitting that action URL with **no query params
at all** — it often returns the unified, unfiltered result set (e.g. `cretahouses.gr`'s
`/properties/filter?category_id=N` returns everything when `category_id` is omitted). Also check for
`/search`, `/sitemap.xml` at other common paths (`wp-sitemap.xml`, `sitemap_index.xml` sometimes
still exist on non-WP stacks).

**Always validate**, don't guess:
- Cross-check math: sum of each category's individual item count should equal the unified page's
  count. If it doesn't, something's being double-counted or missed.
- Confirm pagination for real: fetch page 2 and diff its first item against page 1's; fetch one page
  past the last page and confirm it degrades gracefully (0 results / selector not found), not a
  redirect back to page 1 that would make the crawler loop forever.
- `ScraperConfig.start_url` is a **single string** — the platform has no native multi-URL/multi-category
  crawl. If you can't find one URL that covers what's needed, the unified-archive search above is not
  optional, it's the only way to get full coverage with one `Scraper`.

## 3. Category include/exclude

The site's filter usually only accepts **one** category value — array syntax
(`category_id[]=`), comma-separated (`category_id=7,8`), and repeated params
(`category_id=7&category_id=8`) are all worth trying but commonly don't work (last-value-wins or a
silent empty result). Don't spend long on this before falling back to:

Find a **per-card discriminator** — a class or attribute on each listing card that identifies its
category (icon class, data attribute, badge text) — and build `listing_selector` with CSS
`:not(:has(.the-class))` chains (to exclude) or `:has()` (to include only specific ones):

```
.property-item:not(:has(.attribute-land-and-plots)):not(:has(.attribute-extra-large-land)):not(:has(.attribute-olive-groves))
```

Playwright's locator engine supports `:has()`/`:not()` regardless of the target browser's native CSS4
support, and modern Chromium supports `:has()` natively anyway — safe to rely on both in
`listing_selector` (evaluated via `page.locator()`) and inside `page.evaluate()` (plain
`document.querySelectorAll`, browser-native).

**Verify the count, not just the selector syntax** — with real Playwright, confirm:
`unfiltered count − excluded count == exclusion-selector count`, and that zero excluded-category cards
leaked into the result (`cards.filter(c => c.querySelector('.excluded-class'))`).

## 4. `ScraperConfig` schema (ground truth)

From `api/src/integrations/crawler/interfaces/scraper-config.interface.ts`:

```ts
type FieldType = 'text' | 'href' | 'src' | 'background_image';
interface FieldDef { selector: string; type: FieldType }

type PaginationType = 'next_button' | 'load_more' | 'infinite_scroll' | 'url_param' | 'none';
interface PaginationConfig { type: PaginationType; selector?: string; url_param?: string }

interface DetailPageConfig {
  image_selector?: string; image_type?: 'src' | 'background_image';
  description_selector?: string;
  specs_selector?: string; features_selector?: string;
  external_id_source?: 'url_path' | 'selector'; external_id_selector?: string;
  title_selector?: string; price_selector?: string; location_selector?: string;
}

interface ScraperConfig {
  start_url: string;
  listing_selector: string;               // matches EACH card container
  fields?: Record<string, string | FieldDef>;  // selectors are WITHIN a card
  pagination?: PaginationConfig;
  detail_page?: DetailPageConfig;
}
```

Notes that aren't obvious from the types alone:

- `fields.url` (type `href`) becomes `CrawlItem.source_url`. Always include it.
- Text extraction (`api/src/integrations/crawler/services/field-extraction.service.ts`) takes the
  matched element's full `textContent`, whitespace-collapsed — it does **not** strip label prefixes
  like `"Price: "` or `"Code: "`. That's fine; downstream AI normalization handles it. Don't waste time
  hand-crafting selectors just to avoid a label prefix unless a cleaner sibling-free selector is
  trivially available.
- `image` field type `src`/`background_image` at the **listing card** level only grabs one image per
  card (via `Locator.locator(selector).first()`); the **detail page** `image_selector` matches ALL
  elements (`document.querySelectorAll`) and the crawler dedupes with `[...new Set(images)]` — so
  carousel plugins that clone slides for infinite-loop behavior (Owl Carousel etc.) are handled
  automatically; don't worry if a raw count looks 2x too high, just confirm the *unique* count.
- `url_param` pagination: the crawler does `url.searchParams.set(paramName, String(pageNum + 2))` —
  i.e. page 1 has no param, page 2 uses value `2`, etc. Matches WP-style `?paged=N`/`?sf_paged=N`
  numbering directly; no off-by-one adjustment needed.
- `next_button` pagination requires a **persistent** selector (same on every page, e.g. `rel="next"`,
  an arrow icon, `aria-label="Next"`) — never target a specific page number's link text, it breaks once
  that number scrolls out of a windowed pagination widget.
- Coordinates: the production `DetailEnrichmentService` auto-extracts lat/lng from map embeds, data
  attributes, and embedded scripts **unconditionally**, regardless of what's in `config` — don't bother
  adding a coordinates field to the config, it isn't read for that.

## 5. Field-name conventions that feed normalization directly

`api/src/integrations/crawler/utils/crawler.utils.ts#extractDenormalizedRawFields` looks for these
specific `raw.*` keys and copies them onto typed `SourceProperty` columns, which
`buildNormalizationInput` then passes straight to the AI normalizer (more reliable than making the
model infer everything from free-text description alone):

| Typed column        | Accepted raw field keys (first match wins)                         |
|----------------------|----------------------------------------------------------------------|
| `raw_property_type`  | `property_type`, `_property_type`, `type`, `_type`                  |
| `raw_listing_type`    | `listing_type`, `_listing_type`, `transaction_type`, `_transaction_type` |
| `raw_sqm`             | `sqm`, `_sqm`, `square_meters`, `_square_meters`, `size`             |
| `raw_bedrooms`        | `bedrooms`, `_bedrooms`, `rooms`, `_rooms`                           |
| `raw_bathrooms`       | `bathrooms`, `_bathrooms`, `wc`, `_wc`                               |

If the listing card (or detail page) visibly shows any of these (a "For Sale"/"For Rent" badge, a
bedroom/bathroom/m² icon row), add them as extra `fields` entries using one of the accepted key names
above — cheap to add, meaningfully improves normalization accuracy.

## 6. ALWAYS verify against the live site with real Playwright before writing to the DB

Curl-only inspection can miss JS-rendered content and doesn't prove selectors actually work through
Playwright's locator engine. Write a throwaway script (delete it after, don't commit it) run from
`scripts/scraper-generator/`:

- Launch headless Chromium, navigate to `start_url`, assert the listing card count.
- Extract every field from a few sample cards. Mirror `field-extraction.service.ts`'s real timeout
  behavior — use a **short per-field timeout wrapped in try/catch returning `null`**, not Playwright's
  default action timeout (which can be 30s+ and make an absent-on-some-cards field look like a hang
  instead of a graceful miss):
  ```js
  try {
    await el.waitFor({ state: 'attached', timeout: 2000 });
    return (await el.textContent())?.replace(/\s+/g, ' ').trim() ?? null;
  } catch { return null; }
  ```
- If pagination is configured, fetch page 2 and confirm different content, and fetch one page past the
  last page and confirm graceful termination (§2).
- Visit one real detail-page URL and check `description_selector`, `price_selector`,
  `location_selector`, `external_id_selector`, and image gallery unique count.

## 7. Write to the DB

Insert `Scraper` + `ScraperVersion` in one transaction, mirroring what
`scripts/scraper-generator/promote/index.js` does for AI-generated configs but with `created_by: 'USER'`
since it's hand-authored (not produced by the `ComputerUseOrchestratorService` pipeline):

```js
await client.query('BEGIN');
// 1. confirm agency exists, confirm no existing scraper for it (abort if found)
// 2. insert scrapers (id, source_agency_id, name, version_count=1, status='TESTING', created_at, updated_at)
// 3. insert scraper_versions (id, scraper_id, version=1, config, created_by='USER', notes, created_at, updated_at)
// 4. update scrapers set active_version_id = <version-id>
await client.query('COMMIT');
```

Put the *investigation trail* in `notes` — what URL you found and why, what pagination mechanism, what
category exclusion trick and its verified counts. Future you (or a teammate) will need this context
far more than a generic "scraper for X" note.

New scrapers default to `status: 'TESTING'` — see §8 for what that actually means in this system
(it is **not** inert).

## 8. Safety checks before creating or running anything

- **`TESTING` is not a safe/inert status.** `CrawlSchedulerCron` (`api/src/background/crawl-scheduler.cron.ts`)
  picks up scrapers with status `ACTIVE` **or** `TESTING`. Before creating a scraper, check:
  ```sql
  select id, user_id, enabled from user_tracked_agencies where source_agency_id = '<agency-id>';
  ```
  The scheduler only fires if `is_visible && is_enabled` on the agency **and** at least one
  `user_tracked_agencies` row has `enabled: true`. If one does, your new scraper can get auto-run for
  real the moment `crawl_interval` is next due — this is often fine (it's how the feature is meant to
  work) but say so out loud before creating the scraper, don't let it be a silent surprise.
- **Before triggering any crawl run yourself**, check the relevant tracker's real-world side effects:
  ```sql
  select track_new_listings, track_updated_listings, track_removed_listings,
         remove_watermark, auto_update_to_crm
  from user_tracked_agencies where id = '<tracker-id>';
  ```
  `auto_update_to_crm: true` means new/updated properties get pushed live to a real external CMS
  (EstateWeb). `remove_watermark: true` means every new `UserProperty` fires a paid dewatermark
  pipeline (`platform_config.dewatermark_cost_per_image`, real $ per image). Flag these to the user
  before triggering a run; don't just do it because you can.
- `PropertyNormalizationService.normalizeForCrawlRun()` needs *someone's* AI key to bill the
  normalization calls to. For an agency-level crawl (no specific tracker attached) it falls back to
  the agency's earliest **enabled** `UserTrackedAgency`, and needs that user to have an active AI
  integration key for `AiDefaults.provider`. If neither exists, normalization is skipped **silently** —
  a `logger.log`, no notification, no error anywhere. See §9 if this has already happened.

## 9. Diagnosing a stuck/broken crawl → normalization → properties pipeline

When "the crawl succeeded but no properties/user properties were created", work through this in order:

```sql
select id, status, started_at, finished_at, total_found, error_message, metadata
from crawl_runs where source_agency_id = '<agency-id>' order by created_at desc limit 5;

select count(*) from source_properties where source_agency_id = '<agency-id>';           -- scrape worked?
select count(*) from ai_batch_runs where crawl_run_id = '<crawl-run-id>';                -- batch path used?
select * from notifications where crawl_run_id = '<crawl-run-id>';                       -- any failure surfaced?
select count(*) from property_source_links psl join source_properties sp
  on sp.id = psl.source_property_id where sp.source_agency_id = '<agency-id>';           -- normalized?
```

**Root cause catalog** (all silent — none of these raise a `notification` or a visible error):

1. **No enabled tracker for the agency** — `resolveDefaultTrackerForAgency` returns `null`,
   `normalizeForCrawlRun` returns immediately after one `logger.log`. Fix: enable a
   `UserTrackedAgency` row for that agency.
2. **Tracker's user has no active AI key** — `resolveActiveApiKey` throws, caught, same silent skip.
   Fix: connect an API key for `AiDefaults.provider` (check `integration_targets.integration_type`)
   on that user.
3. **A previous crawl's normalization got wedged** — check `crawl_runs.metadata.normalization_status`;
   if it's stuck at `'running'` with no corresponding `ai_batch_runs`/`notifications`/`properties`
   progress, the BullMQ job that was running `normalizeForCrawlRun` never completed. Confirm live via
   Redis (needs `REDIS_URL`):
   ```js
   const { Queue } = require('bullmq'); const IORedis = require('ioredis');
   const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
   const q = new Queue('crawl', { connection });
   await q.getJobCounts();                 // active count > 0 with no matching progress = suspicious
   await q.getJobs(['active']);             // job.data.crawlRunId tells you which run
   await q.getWorkers();                    // confirms a live worker process is actually connected
   ```
   Before blaming the AI provider, **verify the key works** with a direct `fetch` call outside the app
   (few seconds, cheap) — if it authenticates fast, the hang is inside the app (commonly: no request
   timeout on the AI HTTP call), not the provider.
4. **`CrawlRunsService.enqueue()`'s own guard blocks a retry**: it refuses a new crawl for an agency
   while *any* prior `crawl_run.metadata.normalization_status === 'running'` — exactly the state #3
   leaves behind. A "Run Now" click (or your own retry) will fail with
   `"Agency still normalizing crawl ... — wait until it finishes"` until that flag is cleared.

**Recovery — mirror "Run Now" exactly, don't hand-roll a bypass**:

```js
// 1. clear the stuck flag so enqueue()'s guard doesn't block you
UPDATE crawl_runs SET metadata = jsonb_set(metadata, '{normalization_status}', '"failed"')
  WHERE id = '<stuck-crawl-run-id>';

// 2. insert a fresh CrawlRun row (status QUEUED) + push a real BullMQ job — same as the "Run Now" button:
await client.query(`insert into crawl_runs (id, source_agency_id, scraper_id, user_tracked_agency_id,
  status, created_at, updated_at) values ($1,$2,$3,$4,'QUEUED', now(), now())`, [...]);
const queue = new Queue('crawl', { connection });
await queue.add('crawl', { crawlRunId }, { attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
```

**Do NOT** try to reimplement `PropertyNormalizationService`/`UserPropertiesService` logic by hand or by
manually reconstructing their NestJS dependency graph outside the app. Both pull in real
side-effecting systems (CMS sync, watermark removal queue, content production queue, cost logging,
duplicate-group detection) that are easy to get subtly wrong under time pressure. And do **not**
`NestFactory.createApplicationContext(AppModule)` from a script either — that re-registers the *same*
cron jobs (`CrawlSchedulerCron` fires every minute) and BullMQ processors against the **same live
Redis queues** the real deployed worker is using, causing duplicate processing across the whole
platform, not just the one agency you're trying to fix. Always go through the real queue/worker via a
freshly enqueued job — it's both safer and less code.

## Anti-patterns

- Assuming a chrome/browser MCP is connected — check `ToolSearch`/`claude mcp list` first, don't error
  out if it's missing, just fall back to curl + Playwright scripts.
- Creating a second `Scraper` for an agency that already has one.
- Treating `status: TESTING` as "won't run" — it will, if the agency has an enabled tracker.
- Triggering a real crawl (cost, external CMS push) without checking `remove_watermark`/
  `auto_update_to_crm` first and telling the user.
- Writing a scraper config without running it through real Playwright first — curl-only "it should work"
  is not verification.
- Leaving throwaway verification scripts committed inside `scripts/scraper-generator/`.
- Bootstrapping the full NestJS app or hand-reconstructing service DI graphs to "just fix it now" —
  mirror the real enqueue path instead (§9).
