# Task: Computer-use loop engine (OpenAI + Playwright)

## Feature group

`docs/plan/PROGRESS.md` → **Feature 04: AI Computer-Use Scraper Generation**

## Objective

Replace the stub processor from the previous task with the real agent loop:
OpenAI's `computer-use-preview` model drives a Playwright browser, every
action is persisted as a `ComputerUseStep` with before/after screenshots,
and the loop ends by writing a scraper config into `staged_config` and
moving the run to `AWAITING_REVIEW`.

## Context — read this before touching anything

Read `docs/scraping-generation-computer-use-architecture.md` sections 6–9 in
full. This is a **new integration**, not an extension of the existing
`api/src/integrations/ai/` module — that module wraps the **Vercel AI SDK**
(`@ai-sdk/openai`, used for plain text/object generation elsewhere in the
app) which does not expose the Responses API's `computer_use_preview` tool.
Build a separate integration using the official `openai` npm package
directly.

The OpenAI computer-use loop shape (Responses API, Node SDK):

```ts
// First call
const response = await client.responses.create({
  model: "computer-use-preview",
  tools: [{ type: "computer_use_preview", display_width: 1280, display_height: 800, environment: "browser" }],
  input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/png;base64,${screenshot}` }] }],
  truncation: "auto",
});

// response.output contains items; find the one with type "computer_call" — it has { call_id, action: { type, ...params } }

// After executing `action` via Playwright and capturing a new screenshot:
const next = await client.responses.create({
  model: "computer-use-preview",
  previous_response_id: response.id,
  tools: [{ type: "computer_use_preview", display_width: 1280, display_height: 800, environment: "browser" }],
  input: [{ type: "computer_call_output", call_id: computerCall.call_id, output: { type: "computer_screenshot", image_url: `data:image/png;base64,${newScreenshot}` } }],
  truncation: "auto",
});
```

`action.type` values map 1:1 onto the schema's `ComputerActionType` enum
(`CLICK`, `DOUBLE_CLICK`, `TYPE`, `SCROLL`, `WAIT`, `KEYPRESS`, `SCREENSHOT`,
`DRAG`) plus a `DONE` you define yourself: the loop ends when a response has
no `computer_call` output item (the model has finished and returned a final
text/JSON message instead) — treat that as `DONE` and parse the final config
out of the response's text output.

Since the model only knows how to click/type/scroll — it does not
natively output a `{ start_url, listing_selector, fields, pagination }`
config — the `prompt` sent to the model must explicitly instruct it to (1)
navigate and explore the target listing site, then (2) once it has
identified the repeating listing element and field selectors, respond with
a final plain-text message containing **only** a JSON code block with that
exact shape (see architecture doc section 9 for the exact fields). Parse
that JSON out of the final response's output text; if parsing fails, mark
the run `FAILED` with a clear `error_message`.

## Requirements

1. Add dependencies to `api/package.json`: `openai` (official SDK) and
   `playwright` (+ run `npx playwright install chromium` as a documented
   setup step in the PR/task notes, not something the app does at runtime)
2. `api/src/integrations/computer-use/computer-use.module.ts`
3. `api/src/integrations/computer-use/services/computer-use-client.service.ts`
   — thin wrapper around `new OpenAI({ apiKey: config.get('OPENAI_API_KEY')
   })` exposing `startSession(prompt, screenshot)` and
   `continueSession(previousResponseId, callId, screenshot)`, both returning
   a normalized `{ responseId, computerCall: { callId, action } | null,
   finalText: string | null }` shape so the orchestrator (below) never
   touches the raw OpenAI response format directly
4. `api/src/integrations/computer-use/services/playwright-driver.service.ts`
   — wraps a single Playwright `Browser`/`Page` per generation run:
   `launch()`, `screenshot(): Promise<Buffer>`, `executeAction(action:
   ComputerActionType, payload: any): Promise<void>` (map every action type
   to the matching Playwright `page.mouse`/`page.keyboard`/`page.evaluate`
   call), `close()`
5. `api/src/integrations/computer-use/services/screenshot-storage.service.ts`
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
6. `api/src/integrations/computer-use/computer-use-orchestrator.service.ts`
   — the actual loop, `async run(generationRunId: string): Promise<void>`:
   1. Load the run + agency; set `status: 'RUNNING'`, `started_at: now()`
   2. Launch Playwright, navigate to the agency's `base_url`
   3. Loop (cap at a max step count, e.g. 40, to guarantee termination):
      a. Screenshot → store as `Document` → call the OpenAI client
      b. Persist a `ComputerUseStep` row (`step_index`, `action_type`,
         `action_payload`, `screenshot_before_id`, `model_reasoning` if the
         response included any text alongside the action)
      c. If no `computer_call` was returned, this is the final message —
         parse the JSON config from it, break the loop
      d. Otherwise execute the action via `PlaywrightDriverService`, take
         the after-screenshot, store it, update the step's
         `screenshot_after_id`
   4. On success: `staged_config` = parsed config, `status:
      'AWAITING_REVIEW'`
   5. On any error or max-steps-exceeded: `status: 'FAILED'`,
      `error_message`
   6. Always `finished_at: now()` and always close the Playwright browser in
      a `finally` block
7. Replace `api/src/background/generation.processor.ts` (the stub from the
   previous task): `@Processor('generation')` calling
   `ComputerUseOrchestratorService.run(job.data.runId)`, with the processor
   itself only responsible for job-level try/catch + logging (the
   orchestrator handles all DB status transitions itself so the run's status
   is always correct even if the processor crashes)
8. Add `OPENAI_API_KEY` as required (not optional) in
   `api/src/shared/config/env/env.validation.ts` if this feature is being
   actively developed — otherwise leave it optional and throw a clear
   runtime error from `ComputerUseClientService`'s constructor if missing

## Files to create or modify

### API (`api/`)

- `api/package.json` (add `openai`, `playwright`)
- `api/src/integrations/computer-use/computer-use.module.ts`
- `api/src/integrations/computer-use/services/computer-use-client.service.ts`
- `api/src/integrations/computer-use/services/playwright-driver.service.ts`
- `api/src/integrations/computer-use/services/screenshot-storage.service.ts`
- `api/src/integrations/computer-use/computer-use-orchestrator.service.ts`
- `api/src/background/generation.processor.ts` (replace stub body)
- `api/src/modules/scraper-generation/scraper-generation.module.ts` (import `ComputerUseModule`; register the `@Processor('generation')` class as a provider here since `api/src/background/` has no existing processors to pattern-match — this is the first one)

## Subtasks

- [ ] Add `openai` + `playwright` dependencies, install chromium
- [ ] Build `ComputerUseClientService` (OpenAI wrapper)
- [ ] Build `PlaywrightDriverService` (action executor)
- [ ] Build/reuse screenshot storage → `Document` rows
- [ ] Build `ComputerUseOrchestratorService` (the full loop with step persistence)
- [ ] Replace the stub processor with the real orchestrator call
- [ ] Manual test: trigger a generation run against a simple real estate listing page (or a static test HTML page you control) and confirm it reaches `AWAITING_REVIEW` with a plausible `staged_config`, and that every step has before/after screenshots visible via `GET /admin/generation-runs/:id`

## Technical Notes

- Follow `.cursor/rules/api-code-structure-and-best-practices.mdc` — no
  `process.env` access outside `ConfigService`; all OpenAI/Playwright SDK
  usage stays inside `integrations/computer-use/`, the orchestrator and
  processor are the only consumers
- Cap loop iterations and wrap the whole loop in a timeout to guarantee a
  stuck session can't run forever and block the queue
- This task deliberately does not touch approve/reject/cancel HTTP
  behavior — those already work from the previous task once `staged_config`
  is populated by a real run instead of a manual DB edit

## Acceptance Criteria

- Triggering `POST /admin/generation-runs` against a real target site runs an actual browser session, produces multiple `ComputerUseStep` rows with real screenshots, and ends in `AWAITING_REVIEW` with a `staged_config` matching the `{ start_url, listing_selector, fields, pagination }` shape
- A session that fails (bad URL, model never converges, timeout) ends in `FAILED` with a useful `error_message`, never left stuck in `RUNNING`
- Approving the resulting run (from the previous task's `approve` endpoint) produces a working `ScraperVersion`
