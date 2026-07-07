# Task: Computer-use loop engine (Anthropic vision + Playwright)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 04: AI Computer-Use Scraper Generation**

## Objective

Replace the stub processor from the previous task with the real agent loop:
an Anthropic vision model drives a Playwright browser via screenshot feedback,
every action is persisted as a `ComputerUseStep` with before/after screenshots,
proposed configs are verified against the live page before acceptance, and the
loop ends by writing a scraper config into `staged_config` and moving the run
to `AWAITING_REVIEW`.

## Context — read this before touching anything

**Primary reference implementation:** `scraper-generator/generate/` — port this
logic into NestJS; do not invent a parallel approach.

| Reference file | Production target |
| --- | --- |
| `scraper-generator/generate/index.js` | `ComputerUseOrchestratorService.run()` |
| `scraper-generator/generate/prompt.js` | `ScraperGenerationPromptService` (or inline constant) |
| `scraper-generator/generate/actions.js` | `PlaywrightDriverService.executeAction()` |
| `scraper-generator/generate/verify.js` | `ScraperConfigVerificationService.verify()` |
| `scraper-generator/generate/config.js` | env-driven constants (`MAX_STEPS`, model id, timeouts) |
| `scraper-generator/generate/utils.js` | `extractJSON()` helper |

Also read `docs/scraping-generation-computer-use-architecture.md` sections 6–9
for domain-model invariants (`ComputerUseStep`, `staged_config` lifecycle).

Read `docs/plan/directions/03-domain-model.md` — **`UserIntegration` AI
credential rule**: every Anthropic call uses `UserIntegration.api_key_secret`
via `UserIntegrationsService` (Feature 09, exported). Import
`UserIntegrationsModule` in `ComputerUseModule`; do not read
`ANTHROPIC_API_KEY` from env.

This is a **new integration**, not an extension of the existing
`api/src/integrations/ai/` module — that module wraps the **Vercel AI SDK**
(`@ai-sdk/anthropic`, used for plain text/object generation elsewhere in the
app) which does not expose the multi-turn vision + action loop used here.
Build a separate integration using `@anthropic-ai/sdk` directly (same package
the reference CLI uses).

### Loop shape (from `scraper-generator/generate/index.js`)

The reference uses Anthropic Messages API with vision, not OpenAI's
`computer-use-preview` tool:

```ts
// Each step: screenshot → user message with image + hint → model returns JSON action
const response = await client.messages.create({
  model: 'claude-opus-4-8', // configurable via env
  max_tokens: 2048,
  thinking: { type: 'adaptive' },
  system: SYSTEM_PROMPT, // from generate/prompt.js — copy verbatim into api/
  messages, // accumulates user (screenshot) + assistant (JSON action) turns
});

const action = extractJSON(response.content.find(b => b.type === 'text')?.text);
// action.action: click | scroll_down | scroll_up | type | navigate | go_back | close_tab | wait | done
```

When `action.action === 'done'`, run **config verification** before accepting
(see `generate/verify.js`). If verification fails, feed errors back to the
model and continue the loop — do not set `AWAITING_REVIEW` until verification
passes.

### Action types → `ComputerActionType`

Map reference actions onto the schema enum (add members if missing in a
migration):

| Reference `action.action` | `ComputerActionType` |
| --- | --- |
| `click` | `CLICK` |
| `type` | `TYPE` |
| `scroll_down` / `scroll_up` | `SCROLL` (store direction in `action_payload`) |
| `navigate` | `NAVIGATE` (new — or store as `TYPE` with url; prefer adding `NAVIGATE`) |
| `go_back` | `GO_BACK` (new) |
| `close_tab` | `CLOSE_TAB` (new) |
| `wait` | `WAIT` |
| `done` | `DONE` |

Tab handling: when a click opens a new tab, switch to it (reference:
`actions.js` uses `context.waitForEvent('page')`).

### Config schema (from `generate/prompt.js`)

The `staged_config` shape produced by `done` is richer than the minimal
example in the architecture doc:

```json
{
  "start_url": "https://example.com/listings",
  "listing_selector": ".card",
  "fields": {
    "title": { "selector": "h2", "type": "text" },
    "price": { "selector": ".price", "type": "text" },
    "location": { "selector": ".loc", "type": "text" },
    "listing_type": { "selector": ".badge", "type": "text" },
    "url": { "selector": "a.detail", "type": "href" },
    "image": { "selector": ".thumb", "type": "background_image" }
  },
  "pagination": {
    "type": "next_button",
    "selector": ".next",
    "url_param": "page"
  },
  "detail_page": {
    "image_selector": ".gallery img",
    "image_type": "src",
    "description_selector": ".description",
    "external_id_source": "url_path",
    "external_id_selector": ".property-id"
  }
}
```

Field `type` values: `text`, `href`, `src`, `background_image`.
Pagination `type` values: `next_button`, `load_more`, `infinite_scroll`,
`url_param`, `none`.
`detail_page` is optional but the prompt instructs the model to visit a detail
page and populate it — Feature 05's crawler uses it in the enrichment phase.

## Requirements

1. Add dependencies to `api/package.json`: `@anthropic-ai/sdk` and `playwright`
   (+ run `npx playwright install chromium` as a documented setup step in the
   PR/task notes, not something the app does at runtime)
2. `api/src/integrations/computer-use/computer-use.module.ts`
3. `api/src/integrations/computer-use/services/computer-use-client.service.ts`
   — factory `createClient(apiKey: string)` wrapping `new Anthropic({ apiKey })`
   exposing `sendStep(messages, systemPrompt, apiKey)` returning a normalized
   `{ rawText, usage }` shape; the orchestrator parses JSON from `rawText`. Do
   **not** read `ANTHROPIC_API_KEY` from env
4. `api/src/integrations/computer-use/services/playwright-driver.service.ts`
   — port `scraper-generator/generate/actions.js`: `launch()`, `screenshot():
   Promise<Buffer>`, `executeAction(action): Promise<Page>` (returns active
   page after tab switches), `close()`
5. `api/src/integrations/computer-use/services/scraper-config-verification.service.ts`
   — port `scraper-generator/generate/verify.js`: `verify(context, page,
   config): Promise<string[]>` (empty array = pass)
6. `api/src/integrations/computer-use/services/screenshot-storage.service.ts`
   — persists a screenshot `Buffer` as a `Document` row (`type:
   DocumentType.IMAGE`): call the existing `GcsService.uploadImageFromBuffer(
   buffer, filename, 'image/png', folder)` (`api/src/integrations/storage/gcs/services/gcs.service.ts`,
   already implemented — import `GcsModule`, do not build a new storage
   integration) to upload, then `prisma.document.create(...)` with the
   returned URL/path. Note `Document.user_uuid` is a plain string column with
   no FK relation to `User` — for generation-run screenshots (which aren't
   tied to an end user) store the acting admin's `id` there, or leave a
   placeholder value if that's not available in this context; do not treat
   it as a real Prisma relation.
7. `api/src/integrations/computer-use/computer-use-orchestrator.service.ts`
   — port `scraper-generator/generate/index.js` as `async run(generationRunId:
   string, apiKey: string): Promise<void>`:
   1. Load the run + agency; set `status: 'RUNNING'`, `started_at: now()`
   2. Launch Playwright, navigate to the agency's `base_url` (or URL from
      `prompt` / run metadata)
   3. Loop (cap at `MAX_STEPS`, default 50 from reference):
      a. Screenshot → store as `Document` → append user message with image
      b. Call Anthropic client with accumulated `messages` + `SYSTEM_PROMPT` +
         the resolved `apiKey`
      c. Persist a `ComputerUseStep` row (`step_index`, `action_type`,
         `action_payload`, `screenshot_before_id`, `model_reasoning`)
      d. Parse JSON action; if `action === 'done'`, run verification — on
         failure, append feedback message and `continue` (do not break)
      e. If `done` and verification passes, set `finalConfig`, break
      f. Otherwise execute action via `PlaywrightDriverService`, take
         after-screenshot, update step's `screenshot_after_id`, append
         assistant message to `messages`
   4. On success: `staged_config` = verified config, `status:
      'AWAITING_REVIEW'`
   5. On any error or max-steps-exceeded: `status: 'FAILED'`,
      `error_message`
   6. Always `finished_at: now()` and always close the Playwright browser in
      a `finally` block
8. Replace `api/src/background/generation.processor.ts` (the stub from the
   previous task): `@Processor('generation')` resolves the API key first
   (`MANUAL` → `resolveActiveApiKey(job.data.initiatedByUserId, ANTHROPIC)`;
   `SELF_HEAL` → `resolveForSourceAgency` from the run's `source_agency_id`),
   then calls `ComputerUseOrchestratorService.run(job.data.runId, apiKey)`;
   processor-level try/catch + logging only (orchestrator handles DB status)
9. Add `SCRAPER_GENERATION_MODEL` (default `claude-opus-4-8`) optional env for
   model id only. Do **not** add `ANTHROPIC_API_KEY` to `env.validation.ts`

## Files to create or modify

### API (`api/`)

- `api/package.json` (add `@anthropic-ai/sdk`, `playwright`)
- `api/src/integrations/computer-use/computer-use.module.ts`
- `api/src/integrations/computer-use/constants/generation-prompt.ts` (port `generate/prompt.js`)
- `api/src/integrations/computer-use/services/computer-use-client.service.ts`
- `api/src/integrations/computer-use/services/playwright-driver.service.ts`
- `api/src/integrations/computer-use/services/scraper-config-verification.service.ts`
- `api/src/integrations/computer-use/services/screenshot-storage.service.ts`
- `api/src/integrations/computer-use/computer-use-orchestrator.service.ts`
- `api/src/background/generation.processor.ts` (replace stub body)
- `api/src/modules/scraper-generation/scraper-generation.module.ts` (import `ComputerUseModule`; register the `@Processor('generation')` class as a provider here since `api/src/background/` has no existing processors to pattern-match — this is the first one)
- `api/prisma/schema.prisma` (extend `ComputerActionType` if needed for `NAVIGATE`, `GO_BACK`, `CLOSE_TAB`)

### Reference (read-only — do not import at runtime)

- `scraper-generator/generate/` — CLI proof-of-concept; run `npm run generate`
  locally to validate behaviour before wiring NestJS

## Subtasks

- [ ] Add `@anthropic-ai/sdk` + `playwright` dependencies, install chromium
- [ ] Port `SYSTEM_PROMPT` from `generate/prompt.js`
- [ ] Build `ComputerUseClientService` (Anthropic vision wrapper)
- [ ] Port `PlaywrightDriverService` from `generate/actions.js`
- [ ] Port `ScraperConfigVerificationService` from `generate/verify.js`
- [ ] Build screenshot storage → `Document` rows
- [ ] Port orchestrator loop from `generate/index.js` with step persistence
- [ ] Replace the stub processor with the real orchestrator call
- [ ] Manual test: `cd scraper-generator && npm run generate` against a target site, then trigger `POST /admin/generation-runs` for the same site and confirm equivalent `staged_config` shape + `AWAITING_REVIEW`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc` — no
  `process.env` access outside `ConfigService`; all Anthropic/Playwright SDK
  usage stays inside `integrations/computer-use/`, the orchestrator and
  processor are the only consumers
- Cap loop iterations and wrap the whole loop in a timeout to guarantee a
  stuck session can't run forever and block the queue
- The verification retry loop is intentional — a `done` action with bad
  selectors must not reach `AWAITING_REVIEW` (matches reference behaviour)
- This task deliberately does not touch approve/reject/cancel HTTP
  behavior — those already work from the previous task once `staged_config`
  is populated by a real run instead of a manual DB edit

## Acceptance Criteria

- Triggering `POST /admin/generation-runs` against a real target site runs an actual browser session, produces multiple `ComputerUseStep` rows with real screenshots, and ends in `AWAITING_REVIEW` with a `staged_config` matching the reference schema (`fields` with typed defs, `pagination`, optional `detail_page`)
- A session where verification rejects the config retries until fixed or max steps — never promotes a broken config
- A session that fails (bad URL, model never converges, timeout) ends in `FAILED` with a useful `error_message`, never left stuck in `RUNNING`
- Approving the resulting run (from the previous task's `approve` endpoint) produces a working `ScraperVersion` that `scraper-generator/crawl/index.js` can execute when pointed at the same config
