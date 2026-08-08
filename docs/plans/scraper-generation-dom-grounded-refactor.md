# Plan: Refactor Scraper Generation to DOM-Grounded Selector Authoring

## Goal

Replace vision-only “guess CSS from screenshots” generation with a pipeline that:

1. Explores the site with Playwright (keep browser automation).
2. Gives the model **structured DOM evidence**, not only pixels.
3. Proposes selectors from that evidence.
4. **Hard-verifies** selectors the same way production extraction works (N cards, field disjointness, lazy images, pagination growth).
5. Stages a config that matches `ScraperConfig` used by `CrawlerService` / `DetailEnrichmentService`.

Success = generation runs produce configs that pass multi-card + detail + pagination probes without human Chrome MCP rescue for typical WordPress/JetEngine/Elementor listing sites.

---

## Problem statement (do not re-diagnose forever — fix this)

Current flow (`ComputerUseOrchestratorService`):

- Model input ≈ viewport JPEG + short text hints.
- Model invents CSS selectors from pixels.
- `ScraperConfigVerificationService` only checks first card + shallow “non-empty” field values + one pagination hop.
- Prompt requires `detail_page.coordinates` with hardcoded lat/lng samples; production config interface does **not** use those for extraction (coords are auto-detected at enrich time). Schema drift wastes steps and teaches wrong success criteria.
- Context compaction keeps only last ~6 images → detail/pagination evidence disappears before `done`.

Chrome DevTools MCP fixes work in one pass because they `evaluate` the live DOM, sample many cards, and assert correct values. Generation must copy that pattern.

---

## Non-goals

- Do not replace Playwright as the crawl runtime.
- Do not rewrite the production crawler (except reuse shared extract/verify helpers if needed).
- Do not require Anthropic official Computer Use tool API.
- Do not build a full visual recorder / no-code UI in this refactor.
- Do not attempt to generate scrapers for heavily CAPTCHA-blocked sites beyond existing block-handling.

---

## Target architecture

```
GenerationRun (BullMQ)
  → PlaywrightDriver (headed/headless stealth — keep)
  → Agent loop with ACTIONS:
        navigate | click | scroll_* | type | wait | go_back | close_tab
        inspect_dom          ← NEW (structured snapshot)
        probe_selectors      ← NEW (run extract on N cards / detail)
        done(config)
  → Model sees: optional screenshot + inspect/probe JSON results (primary)
  → On done: ScraperConfigVerificationService (STRICT, shared extractors)
  → AWAITING_REVIEW | FAILED (same product flow)
```

**Principle:** Screenshots are layout orientation. Selectors are chosen from DOM snapshots and proven by probes.

---

## Source of truth files (read before changing)

| Area | Path |
|------|------|
| Orchestrator loop | `api/src/integrations/computer-use/computer-use-orchestrator.service.ts` |
| Driver | `api/src/integrations/computer-use/services/playwright-driver.service.ts` |
| Claude client | `api/src/integrations/computer-use/services/computer-use-client.service.ts` |
| Prompt | `api/src/integrations/computer-use/constants/generation-prompt.ts` |
| Constants | `api/src/integrations/computer-use/constants/generation.constants.ts` |
| Verify | `api/src/integrations/computer-use/services/scraper-config-verification.service.ts` |
| Action utils | `api/src/integrations/computer-use/utils/generation-action.util.ts` |
| Message compaction | `api/src/integrations/computer-use/utils/generation-message.util.ts` |
| Module | `api/src/integrations/computer-use/computer-use.module.ts` |
| Queue worker | `api/src/background/generation.processor.ts` |
| API entry | `api/src/modules/scraper-generation/` |
| Self-heal | `api/src/background/scraper-failure-handler.service.ts` |
| Production config schema | `api/src/integrations/crawler/interfaces/scraper-config.interface.ts` |
| Production extract | `api/src/integrations/crawler/services/field-extraction.service.ts` |
| Production crawl | `api/src/integrations/crawler/services/crawler.service.ts` |
| Detail enrich | `api/src/integrations/crawler/services/detail-enrichment.service.ts` |
| Reference CLI (keep in sync or deprecate) | `scripts/scraper-generator/generate/` |

---

## Phase 0 — Align schemas and kill dead config

### Tasks

1. Update `GENERATION_SYSTEM_PROMPT` config schema to match production `ScraperConfig` / `DetailPageConfig`:
   - Support `detail_page.title_selector`, `price_selector`, `specs_selector`, `features_selector`.
   - **Remove** requirement to embed sample `coordinates.latitude/longitude` in the staged config (or mark as diagnostic-only and never persist into active scraper config).
   - Document that production finds lat/lng at enrich time; generation only needs to confirm coords exist via probe (optional boolean / sample in verify report, not in crawler config).
2. Document field optional rules: omit `location` / `listing_type` when no dedicated card node exists (prefer omit over duplicating price).
3. Sync or explicitly deprecate CLI prompt in `scripts/scraper-generator/generate/prompt.js` so it does not diverge.

### Acceptance

- Prompt schema ⊆ what crawler actually reads.
- No verifier or prompt step requires hardcoded map coordinates in `staged_config`.

---

## Phase 1 — DOM inspection tool (agent action)

### Add action: `inspect_dom`

**Input (JSON action fields):**

```json
{
  "action": "inspect_dom",
  "scope": "listing" | "card" | "detail" | "pagination",
  "selector": "optional CSS root",
  "card_index": 0,
  "max_nodes": 80
}
```

**Implementation (new service suggested):**

`api/src/integrations/computer-use/services/dom-inspection.service.ts`

Use `page.evaluate` to return compact JSON:

For `listing`:

- `url`, `title`
- Candidate repeating containers: elements whose first class (or tag+nth-child pattern) repeats 3–80 times; include sample count, outerHTML truncated (~500 chars) of first match, child tag summary.
- Top N card summaries for `listing_selector` if provided, else for best candidate.

For `card` (index N under listing_selector or best candidate):

- Truncated outerHTML (cap ~4–8 KB).
- Flat list of interesting nodes: `a[href]`, `img` (src + data-src + data-lazy-src), headings, nodes with text matching price-like `/€|\$|\d[\d.,\s]+\d/`, class names containing `price|title|location|address|jet-listing`.
- Each node: `{ tag, classes, id, attrs: {href,src,data-src}, text: slice(0,120), cssPath }` where `cssPath` is a short uniquely-ish path relative to the card root (prefer class chains that stay within card).

For `detail`:

- `h1` texts, `#id` landmarks, map iframe `src`/`data-src`/title, gallery img candidates, longest text blocks under main content (exclude header/footer/nav by tag/role heuristics).
- Candidates for description / title / price with sample text.

For `pagination`:

- Links/buttons with next-like text/aria, `rel=next`, infinite-scroll hints (no next control + growing list on scroll).

### Wire into orchestrator

1. Extend action union in `generation-action.util.ts` / interfaces.
2. On `inspect_dom`, execute service, push **text JSON result** into messages (not only screenshot).
3. Keep screenshot optional same turn (can send both).
4. Cap payload size; store full dump in generation run debug artifact if screenshot storage pattern already exists.

### Acceptance

- Agent can call `inspect_dom` and receive structured node lists with relative selectors.
- Unit/integration test: fixture HTML (JetEngine-like card) returns price vs title as distinct nodes.

---

## Phase 2 — Selector probe tool (agent action)

### Add action: `probe_selectors`

**Input:**

```json
{
  "action": "probe_selectors",
  "config": { "...partial or full ScraperConfig..." },
  "sample_cards": 5
}
```

**Implementation:** reuse production `FieldExtractionService` (inject into computer-use module) so probe ≡ crawl extract.

**Checks to return as structured report (not only pass/fail):**

| Check | Rule |
|-------|------|
| listing_selector | count ≥ `sample_cards` (or all if fewer) |
| Per card fields | extract title/price/url/image for indices `0..N-1` |
| url | absolute or resolvable http(s); same host as start_url preferred |
| title vs price | if both present, normalized strings must differ |
| price | if present, must match currency/digit heuristic |
| image | not `data:`; prefer resolved lazy attrs (same as FieldExtractionService) |
| Ambiguity | if field selector matches >1 node in a card, warn and show all texts |
| detail_page (if URL open or derived from card url) | title/price/description selectors return distinct sensible values; description length >> price length |
| pagination.next_button | selector visible; after click, listing href set changes; click again still works |
| pagination.infinite_scroll | scroll bottom; wait/poll; card count increases within max wait (reuse crawler poll constants) |
| pagination.load_more | click; card count increases |

Return `{ ok: boolean, errors: string[], samples: {...}, warnings: string[] }` into the model context.

### Acceptance

- Bad domilux-style config (title selector = `.jet-listing-dynamic-field__content`) fails probe with clear “title equals price” error.
- Good disjoint selectors pass with printed samples.

---

## Phase 3 — Harden `ScraperConfigVerificationService`

Make final `done` verification at least as strict as `probe_selectors` (ideally call the same function).

### Required upgrades

1. Sample **min(5, cardCount)** cards, not only first.
2. Field disjointness + price/url/image heuristics.
3. Pagination:
   - `next_button`: two successful advances (align with prompt).
   - `infinite_scroll` / `load_more`: prove card count growth (use `INFINITE_SCROLL_*` constants from crawler).
4. Detail page: open URL from card 0 **and** card 1 if available; verify description selector does not resolve to price text; prefer checking `title_selector` / `price_selector` when present.
5. Reject configs whose `image` / gallery values are only `data:` URIs after lazy resolution.
6. Stop suggesting fragile “first class token” candidates as primary fix path; prefer returning `inspect_dom`-style candidate paths from repeated containers.
7. Strip/ignore unknown `detail_page.coordinates` sample fields on approve if still present for backward compatibility.

### Acceptance

- Historical broken domilux v1 config would fail verification.
- Fixed v2-style config would pass.

---

## Phase 4 — Rewrite generation prompt + loop policy

### Prompt changes (`generation-prompt.ts`)

1. Mandate workflow:
   - Navigate listings → `inspect_dom` listing → choose listing_selector → `inspect_dom` card → draft field selectors → `probe_selectors` → fix until samples look right → open detail → `inspect_dom` detail → draft detail_page → probe detail → test pagination with probe → `done`.
2. State explicitly: **Do not invent class names from screenshots.** Prefer classes/ids returned by `inspect_dom`.
3. Screenshots are optional orientation; after every inspect/probe, reason over JSON.
4. Prefer specific selectors (id, unique class combo, `h3.jet-listing-dynamic-field__content`) over shared generic classes.
5. For shared class grids (JetEngine): use structural distinctions (tag `h3` vs `div`, parent `#property-content`, link class `.jet-listing-dynamic-link__link`).
6. Omit fields that cannot be distinguished.
7. Align pagination / coordinates language with Phase 0.

### Orchestrator policy changes

1. Add actions to allowed set; reject `done` if no successful `probe_selectors` in this run (or last probe not ok) — soft-force quality.
2. Message compaction: when dropping old images, **retain last inspect/probe JSON summaries** (text) so evidence survives.
3. Optionally reduce screenshot frequency (e.g. screenshot only after navigate/click, not after inspect) to save tokens/cost.
4. Step hints: if model calls `done` without probe, inject “run probe_selectors first”.

### Acceptance

- Dry-run on one JetEngine site and one simple Bootstrap site completes with probe ok.
- Token usage not dramatically worse than today (inspect JSON replaces many failed vision iterations).

---

## Phase 5 — Module wiring, self-heal, CLI parity

1. Register new services in `computer-use.module.ts`; export if tests need them.
2. Ensure `FieldExtractionService` / crawler constants are importable without circular deps (extract shared verify helper to `api/src/integrations/computer-use/services/scraper-config-probe.service.ts` if needed).
3. Update `scraper-failure-handler` self-heal prompts to mention DOM inspect/probe (same orchestrator).
4. Update `scripts/scraper-generator` to the same actions **or** mark CLI as deprecated and point to API path only — do not leave two divergent brains.
5. Persist probe reports on generation run records if schema already stores steps/debug (extend carefully; avoid huge blobs — store truncated samples).

---

## Phase 6 — Tests

### Unit

- `DomInspectionService` on static HTML fixtures (listing grid + detail with shared Jet classes).
- `ScraperConfigProbeService` / verification:
  - disjoint fields pass
  - colliding fields fail
  - data: image fails until data-src resolved
  - infinite_scroll growth mock

### Integration (optional but valuable)

- Recorded Playwright route fixtures or small local static server under `api/test/fixtures/agency-pages/`.
- One generation-loop smoke with mocked LLM that emits scripted actions (inspect → probe → done) to prove wiring without paying Claude.

---

## Phase 7 — Rollout

1. Ship behind flag if platform config supports it (`generation_dom_grounded=true`), default on in staging.
2. Re-run generation for 2–3 known-bad agencies (including domilux-like JetEngine).
3. Compare: staged config probe samples vs previous failed source_properties.
4. Only then enable for self-heal in production.
5. Keep human review (`AWAITING_REVIEW`) until probe pass rate is high.

---

## Implementation order for the coding agent

Execute strictly in this order unless blocked:

1. Phase 0 (prompt/schema alignment) — small, unblocks correct targets.
2. Phase 1 (`inspect_dom`) + wire action.
3. Phase 2 (`probe_selectors`) sharing `FieldExtractionService`.
4. Phase 3 (strict verify = probe).
5. Phase 4 (prompt + compaction + done gate).
6. Phase 5 (module/self-heal/CLI).
7. Phase 6 (tests).
8. Phase 7 (flag + manual validation notes in PR).

Do **not** start with deleting screenshots entirely. Keep them as secondary signal until probes are stable.

---

## Coding constraints (project)

- NestJS feature-style services; constructor injection; no service locator.
- No new comments in code (project rule).
- Prefer reusing crawler extraction over duplicating attribute logic.
- Keep changes scoped to computer-use + shared probe helper; avoid drive-by refactors.
- Caveman not required in PR description — write clear Summary / Test plan.

---

## Definition of done

- [ ] Generation agent has `inspect_dom` and `probe_selectors` actions.
- [ ] Final verification samples ≥5 cards and enforces title≠price, real URLs, non-data images.
- [ ] Infinite scroll / load_more verified by card-count growth.
- [ ] Prompt schema matches production `ScraperConfig` (incl. detail title/price selectors; no required hardcoded coordinates in config).
- [ ] Probe/inspect summaries survive message compaction.
- [ ] Fixture tests cover JetEngine-like collision case.
- [ ] CLI either updated or deprecated with one source of truth.
- [ ] Staging generation on a previously broken agency produces a probe-passing config without manual MCP.

---

## Reference: what “good” looked like (domilux)

Use as regression narrative, not hardcode into generator:

- Listing card: `.jet-listing-grid__item`
- Title: `.jet-listing-dynamic-link__link`
- Price: `.jet-listing-dynamic-field__content` (only price field on card)
- Detail title: `h1.elementor-heading-title`
- Detail price: `h3.jet-listing-dynamic-field__content`
- Detail description: `#property-content .jet-listing-dynamic-field__content`
- Pagination: `infinite_scroll`
- Specs/features scoped to `#jet-theme-core-single`

A correct pipeline should rediscover equivalent selectors via inspect+probe, not by memorizing this site.

---

## Out-of-scope follow-ups (later)

- Accessibility-tree-first snapshots as smaller alternative to HTML snippets.
- Automatic selector uniquify algorithm (nth-child refinement) without LLM.
- Multi-page detail template clustering when detail layouts differ by property type.
- Cost/latency dashboards for generation runs.
