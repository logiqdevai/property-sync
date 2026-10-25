---
name: scraper-generation
description: Two modes. (1) Onboard new agencies end to end from a list of "url, EstateWeb email, password" lines plus the user email(s) to track for - creates the agency, tracks it for those users, copies content-publishing settings and connects a new EstateWeb account per user, like the admin "New agency" wizard. (2) Build or fix a scraper (Scraper + ScraperVersion.config) for a real-estate agency site in property-sync, especially "hard" sites with no obvious unified listings page, sites that need one property category included/excluded, or a scraper whose crawl/normalization pipeline is stuck/broken; also finds and sets an agency's City from its site. Use when asked to "add/onboard agencies", "create a scraper for <agency/url>", "the scraper isn't finding X", "exclude category Y", "set the agency city", or "no properties/user properties were created after a crawl".
metadata:
  version: "1.1.0"
---

# Property-Sync Agencies and Scrapers

## Pick a mode first

Unless the request already makes it obvious, **ask the user which one they want** (AskUserQuestion,
two options) before doing anything else:

1. **Add agencies** - onboard one or many agencies end to end (Option 1 below).
2. **Create or fix a scraper** - the scraper playbook (Option 2 below), which also covers finding
   and setting an agency's City (§7).

## Option 1 - Add agencies

Does what the admin "New agency" wizard does (agency -> users -> publishing -> EstateWeb), for as
many agencies as the user gives, in one go. The work is done by `api/scripts/onboard-agency.ts`,
which calls the same services the admin routes use (credentials are encrypted/validated exactly as
in the app, and every step is idempotent, so a re-run skips what already exists).

### 1a. Collect the input

Ask only for what is missing, in one message:

- **User email(s)** - the property-sync user(s) who should track the agencies. One or several. Each
  must already exist and have their default AI (OpenAI) integration connected, otherwise tracking
  fails for that user (the script reports it per user).
- **Agency lines**, one per agency, in this shape (whitespace separated):
  `<website url>  <EstateWeb login email>  <EstateWeb password>  [<name>]`
  The trailing `<name>` is **not** the agency name (see below). It is the CRM last name used to find
  the CRM client id (§1c), so keep it exactly as typed, spaces and dashes included.
  The agency **name is always the site's domain** without `www.` and the TLD, e.g.
  `https://stathopoulosmesitiko.gr/property-search/?` -> `stathopoulosmesitiko`,
  `https://www.lesvos-home.gr/...` -> `lesvos-home`. Derive it from the url; do not use the typed name for the agency.
  Use the website url exactly as the user gave it for `base_url` (query string and path included);
  never reduce it to the site root. Only trailing slashes are trimmed.
  A password never contains spaces. If a line doesn't fit this shape, ask instead of guessing.
- **Copy content publishing from** - optionally, the name/url/id of an existing agency whose
  content-publishing config (languages, title/description strategies, AI families) should be
  copied onto each new tracker, as the wizard's "Copy from agency" does. Ask once; "none" is fine.
  It is read from the *same user's* tracker of that agency, so the user must track it.
- **CRM client id** per agency - never ask. If the user gave a number, pass it as `crm_client_id`;
  otherwise find it from the typed name in §1c.

The EstateWeb login is the agency's account on the CRM, not the property-sync user. Every selected
user gets their own EstateWeb connection created from those credentials, because an account links
to exactly one tracker.

### 1b. Run it

1. Write the input as JSON to the **scratchpad** directory (never into the repo - it holds
   passwords). The shape is documented at the top of the script:
   `{ "users": [...], "copy_publishing_from": "...", "agencies": [{ "name", "base_url",
   "estateweb": { "email", "password" }, "city?", "country?", "content_language?", "crawl_interval?", "crm_client_id?" }] }`
   Do not set `crawl_interval` unless the user asks: the script gives every **newly created** agency
   `0 9 * * *` (once a day at 09:00, scheduler timezone Europe/Athens) instead of the schema default
   `0 */6 * * *`. An agency that already exists keeps its current interval.
2. Dry run, read the output, then the real run (from `api/`; we work only with `.env.staging`, see §0):
   ```
   npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/onboard-agency.ts --input-file=<path> --dry-run
   npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/onboard-agency.ts --input-file=<path>
   ```
3. **Delete the input file** when done.

### 1c. Find the CRM client id

Does the wizard's "Find CRM client by last name" and stores the id on the tracker's EstateWeb link.
Run it per agency and user, after the onboarding run (it needs the EstateWeb link to exist). The
search goes through the user's **default** EstateWeb account, as in the wizard. Use the typed name
as `--last-name`; an exact last-name match is used, a single partial hit is used, anything
ambiguous prints the candidates and writes nothing (rerun with `--client-id=<n>` to pick one):
```
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/find-crm-client.ts --agency=<id | base_url | exact name> --user=<email> --last-name=<typed name> --dry-run
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/find-crm-client.ts --agency=<id | base_url | exact name> --user=<email> --last-name=<typed name>
```
An `EstateWeb upstream HTTP 500 on GET /api/client` means the user's default EstateWeb account
cannot list clients; report it, don't retry in a loop.

### 1d. Report

Show a short table: agency, whether it was created or already existed, and per user tracked /
publishing / EstateWeb. Never print the passwords back. Call out every `FAILED:` line with its
reason; the common ones:

- *"Connect <provider> on the Integrations page before tracking agencies"* - that user has no
  OpenAI connection. Tell the user; nothing else was done for that user.
- *"You already have a connection to this integration target"* - the EstateWeb target does not
  allow multiple accounts (`integration_targets.allow_multiple`). Stop and tell the user rather
  than reusing someone else's account.
- A duplicate `base_url` is not an error: the existing agency is reused.

Finish by offering the city step (§7, "Set the agency's main city") for the new agencies: the name
often ends with a town, but City stays empty unless the input had `city`. Don't set a city without
checking it against the site.

## Option 2 - Create or fix a scraper

# Property-Sync Scraper Generation Playbook

Distilled from actually building scrapers for `euroland-crete.com` (WordPress) and `cretahouses.gr`
(Laravel), and from diagnosing a stuck production crawl end-to-end. Read this before improvising —
most of it is non-obvious and was learned the hard way by inspecting the real system.

## 0. Access you need

- **`DATABASE_URL`** — read it from `api/.env.staging`. We work **only** with staging
  — never use `api/.env.production` (stale, points at a retired host). The staging DB is the live one.
- **`REDIS_URL`** — same env files. Only needed if you're debugging a stuck crawl (§8).
- **No browser-automation MCP is normally connected** in this project's sessions, even if the user
  says "use chrome mcp." Don't block on that — fall back to `curl` for static HTML inspection and a
  throwaway Playwright script for anything that needs real rendering/pagination verification (see §5).
  Playwright + `pg` are already installed under `scripts/scraper-generator/node_modules` — run scripts
  from inside that directory (or `api/`, which also has `pg`) so imports resolve; a script placed
  elsewhere (e.g. a temp/scratch dir) fails with `MODULE_NOT_FOUND`.

## 1. Find the agency, check for an existing scraper

```sql
select id, name, base_url, is_visible, is_enabled, content_language, crawl_interval, city
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

**Sales only, every sale category.** We keep only sale listings (never rentals), but all property
categories (residential, commercial, land, other...). The agency's `base_url` is often a single-category
search (e.g. residential only), so **always check the site's other categories** before settling on
`start_url`: list the category options in the search form, count the sale results for each (and for the
form with no category), and confirm the per-category counts sum to the unfiltered sale count. If the
unfiltered sale search covers them all, use that as `start_url` and tell the user how many listings the
original `base_url` would have missed. Only drop a category if the user asks. Also check whether an
optional region filter hides listings (compare counts with and without it) and report it.

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
  image_selector?: string; image_type?: 'src' | 'background_image' | 'href';
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
- **Never add a location to the scraper config.** Do not put a `location` entry in `fields` and do
  not set `detail_page.location_selector`, even when the card or detail page shows an address, area
  or breadcrumb. The only location the scraper side carries is the agency's **City**
  (`source_agencies.city`, see "Set the agency's main city" in §7). Listing location is left to
  the title/description and the coordinates the crawler extracts on its own.
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
- **Lightbox/gallery detail pages** — a common legacy pattern wraps each gallery thumbnail in
  `<a href="full-size.jpg"><img src="tiny-thumbnail.jpg"></a>` (jQuery Lightbox-style plugins, often
  `rel="lightbox[...]"` on the anchor) where the visible `<img>` is only a small thumbnail and the
  real full-resolution URL lives in the anchor's `href`. Detect this by checking whether a gallery
  thumbnail's `<img>` filename looks like a downsized variant (e.g. an `xs`/`thumb`/size suffix) of a
  different, unlinked full-size file — if so, point `detail_page.image_selector` at the **anchor**
  (e.g. `a[rel^="lightbox"]`) with `image_type: 'href'` instead of at the `<img>`. A single such
  selector/anchor set can often replace a separate "hero image" selector entirely if every gallery
  photo (including the first) is wrapped the same way — check before assuming you need both.

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
  `external_id_selector`, and image gallery unique count (no location check: we never configure one).
- **Never judge "this site has no description" from one page.** Many sites render the prose description
  only on some listings (an optional block that is simply absent from the sample you opened). Fetch
  ~20 detail pages spread across the whole listing set (every Nth id, same-origin fetch from a real
  browser tab with ~700ms between requests), and for each list every text block over ~150 characters
  outside the specs/amenities tables. If any listing has one, set `description_selector` to that block.
  A missing description leaves the CRM ad description empty in every language the tracker's content
  publishing config outputs (read that config, never assume languages), and it is only noticed after the
  whole agency was crawled.

### 6a. Ground-truth cross-check: you pick a sample, the user confirms it

Before trusting `external_id_selector`/`price_selector` (or any detail-page field selector), **pick one
example property yourself and give the user its full URL, ID and price (block below) for them to confirm
against the live page**. Do not ask the user to supply an example. Do not write the Scraper to the DB
until they confirm the sample. A selector can be syntactically valid and still resolve to the wrong element — e.g. it
matches a different row/column than intended — without erroring anywhere. The only real proof is
resolving the selector against a page whose correct answer you already know, then confirming the
extracted text equals it exactly (not "looks plausible"). This applies to any site's markup — don't
special-case it to one platform or layout.

**Always show the sample property up front — never make the user ask for it.** As soon as you have
opened any sample listing/detail page (and again whenever you report progress or ask for ground
truth), print, immediately and without being prompted:

```
- Listing URL: <FULL detail-page URL, never just the ID or a path>
- Listing ID (from the URL): <id>
- Agency code / reference (if the page shows one): <code>
- Price: <price as displayed> (<m², bedrooms, bathrooms if shown>)
```

The full clickable URL is mandatory — the user opens it to check the values themselves. An ID alone
is useless to them. Say plainly that these are what *you* read from the page (a selector sanity
check), and that an independent example from the user is still the real ground truth.

Practical technique:

1. `curl -sL -A "Mozilla/5.0 ..." "<detail-page-url>" -o page.html` — always send a real browser
   `User-Agent`; some sites block/serve minimal content to bare `curl`.
2. **Check the declared charset before grepping.** Older/legacy sites sometimes serve a non-UTF-8
   `<meta charset>` (e.g. an ISO-8859-x or windows-125x variant for a non-Latin alphabet). Grepping or
   reading raw bytes on a non-UTF8 page mangles or hides multi-byte text. If the charset isn't UTF-8,
   convert first (`iconv -f <declared-charset> -t UTF-8 page.html > page.utf8.html`) and work from the
   converted file.
3. Locate the target text in the (converted) HTML and manually walk the DOM ancestry the selector
   describes, step by step, against the *actual* markup on that specific page — don't assume the
   structure from a similar-looking site or from memory of a different agency's layout.
4. **Table selectors — implicit `<tbody>` gotcha.** `detail_page` selectors run inside a real browser
   DOM (`page.evaluate()` → `document.querySelector`, per §6), which follows the HTML5 tree-construction
   algorithm: any `<tr>` that appears directly under a `<table>` *before* an explicit `<tbody>` tag gets
   auto-wrapped into an **implicit first `<tbody>`**, shifting every explicit `<tbody>` after it one
   index later (`nth-of-type(2)`, not `nth-of-type(1)`). Raw HTML source never shows this auto-inserted
   tag, so counting literal `<tbody>` occurrences in the page text gets the index wrong whenever a
   selector uses `tbody:nth-of-type(N)`. Reason about the parsed tree (or confirm live via a throwaway
   Playwright `page.evaluate` call) instead of trusting a literal tag count from curl'd source. This only
   applies when the config actually targets table rows this way — irrelevant for div/list-based markup.
5. Confirm the resolved text equals the user-supplied ground truth (ID and price) exactly before
   marking the scraper/field as verified. If it doesn't match, don't guess-adjust the selector — re-walk
   the DOM ancestry against that page's real markup.

## 7. Write to the DB

Insert `Scraper` + `ScraperVersion` in one transaction, mirroring what
`scripts/scraper-generator/promote/index.js` does but with `created_by: 'USER'` since it's hand-authored:

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

### Set the agency's main city

`source_agencies.city` is the agency's main city. **Always find it yourself while building a scraper**,
without being asked or asking whether to look: do the site lookup below during investigation, report
the city and where you found it, and set it (when blank) as part of creating the scraper.

1. Find the main city from the agency's own site, in this order: the contact or about page address,
   or the footer (an `<address>` block, or schema.org `PostalAddress`/`addressLocality` in JSON-LD);
   then the office or location text in the header or footer. Only if the site shows no office address,
   use the most common city named in the listing titles or descriptions, and say in `notes` that it
   came from listings, since listings can be in other cities than the office.
2. Write the city name in the agency's `content_language` (for `EL` agencies, the Greek name), matching
   how existing rows are written. Use the city name, not the region. If the site only documents the
   region, use the region and say so in `notes`.
3. Don't overwrite a value that is already set. If `city` is non-empty and differs from what you found,
   report both values and ask before changing it. Set it only when it is null or blank:
   ```sql
   update source_agencies set city = $1, updated_at = now()
   where id = $2 and (city is null or btrim(city) = '');
   ```
   Zero rows updated means the city is already set; compare it as above.

**When the user asks for the city directly** ("set the city for agency X", or after Option 1) this
step stands on its own, with no scraper involved. Find it the same way (steps 1-2), then use
`api/scripts/set-agency-city.ts` (plain Prisma, about a second to start). Because the user asked for
the change, a differing existing value may be replaced, but always show `old -> new` and where on the
site you found it. Check the stored spelling first so you don't add a second variant of a city that
already exists (stored in the agency's language, nominative, e.g. `Θεσσαλονίκη`, `Αθήνα`):

```
cd api
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/set-agency-city.ts --list-cities
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/set-agency-city.ts --agency=<id | base_url | exact name> --city=<city> --dry-run
npx dotenv -e .env.staging -- node -r tsconfig-paths/register -r ts-node/register scripts/set-agency-city.ts --agency=<id | base_url | exact name> --city=<city>
```

A changed city only affects later location resolution; properties already resolved keep their stored
location, so don't promise existing listings will move.

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
- Trusting a detail-page selector because it "looks right" without cross-checking its resolved text
  against a user-supplied example property's real ID/price (§6a) — and, for table-based markup, counting
  literal `<tbody>` tags in raw HTML source instead of reasoning about the browser's auto-inserted
  implicit `<tbody>` (§6a).
- Leaving throwaway verification scripts committed inside `scripts/scraper-generator/`.
- Bootstrapping the full NestJS app or hand-reconstructing service DI graphs to "just fix it now" —
  mirror the real enqueue path instead (§9).
