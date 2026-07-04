# AI Autonomous Scraper System — OpenAI Computer Use Architecture

## 1. Core Idea

You are building an agent loop system where the model controls a browser via actions (click, type, scroll, wait) and receives screenshots back. This creates a closed feedback loop between AI and browser state. Every action in that loop is persisted as a `ComputerUseStep`, and the loop's final output is promoted into an immutable `ScraperVersion`.

---

## 2. High-Level Architecture

SourceAgency (target website)
    ↓
ScraperGenerationRun (AI session, trigger: MANUAL | SELF_HEAL | SCHEDULED)
    ↓
Computer Use Loop (OpenAI model) → ComputerUseStep (per action, logged)
    ↓
Navigation + extraction logic
    ↓
ScraperVersion.config (promoted, immutable, versioned result)
    ↓
Scraper (active_version_id points at the current ScraperVersion)
    ↓
CrawlRun (Playwright execution)
    ↓
SourceProperty → Property → CMS sync

---

## 3. AI Generation Layer

- `ScraperGenerationRun` stores:
  - `source_agency_id` and optional `scraper_id` (set when fixing/updating an existing scraper)
  - `trigger`: `MANUAL`, `SELF_HEAL`, or `SCHEDULED`
  - `status` (`GenerationRunStatus`): `QUEUED` → `RUNNING` → `AWAITING_REVIEW` → `SUCCESS` / `FAILED` / `CANCELLED`
  - `prompt` — the goal/instructions given to the model
  - `staged_config` — the draft config produced by the model, held here until reviewed/approved
  - `produced_version_id` — set once `staged_config` is approved and copied into a `ScraperVersion`

- `ComputerUseStep` stores the individual steps of the loop:
  - `step_index`, `action_type` (click/type/scroll/wait/keypress/screenshot/drag/done)
  - `action_payload` — the raw action returned by the model
  - `screenshot_before_path` / `screenshot_after_path`
  - `model_reasoning` — optional rationale text from the model

  This is what makes a generation run replayable and debuggable: you can see exactly what the AI saw and did at each step, not just the final config.

---

## 4. Execution Layer

- `Scraper`:
  - identity + status only (`ACTIVE`, `INACTIVE`, `DEPRECATED`, `TESTING`)
  - holds **no config directly** — `active_version_id` points to the `ScraperVersion` currently in use
  - this is the single source of truth fix: previously config lived in both `Scraper.config` and `ScraperVersion.config` and could drift out of sync

- `ScraperVersion`:
  - immutable, versioned scraper definition (`start_url`, `listing_selector`, `fields`, `pagination`, etc.)
  - `created_by`: `"AI"` or `"USER"`
  - `notes` — reason for the fix / summary of what changed
  - every generation run either produces a new version or fails; nothing overwrites a version in place

- `CrawlRun`:
  - production scraping execution, runs against `Scraper.active_version.config`
  - no AI involvement unless it fails and triggers a self-heal run

- `ScraperExecutionTrace`:
  - step-by-step log of a **production** Playwright run (distinct from `ComputerUseStep`, which logs the AI's exploratory loop during generation)
  - used to detect broken selectors / navigation failures and feed them into a self-heal `ScraperGenerationRun`

- `JobLog`:
  - logs queue/job execution and failures, independent of the scraping domain model

---

## 5. Output Layer

- `SourceProperty`:
  raw extracted listings, one per (agency, url)

- `Property`:
  normalized, deduplicated dataset synced to the CMS

- `PropertySourceLink`:
  mapping layer between a `Property` and the `SourceProperty` rows it was built from

---

## 6. Computer Use Loop

1. Create a `ScraperGenerationRun` (`status: QUEUED` → `RUNNING`)
2. Send prompt + screenshot to the model
3. Model returns an action
4. Persist the action as a `ComputerUseStep` (`action_type`, `action_payload`, `screenshot_before_path`)
5. Execute the action via Playwright
6. Capture the resulting screenshot, write it to the same step's `screenshot_after_path`
7. Send the new screenshot back to the model
8. Repeat until the model returns a `DONE` action
9. Move the run to `AWAITING_REVIEW` with the final config in `staged_config`

---

## 7. Model Action Example

```json
{
  "type": "computer_call",
  "action": {
    "type": "click",
    "x": 320,
    "y": 540
  }
}
```

This maps directly onto one `ComputerUseStep` row: `action_type: CLICK`, `action_payload: {"x": 320, "y": 540}`.

---

## 8. Execution Flow

Playwright executes action → screenshot captured → step recorded (`ComputerUseStep`) → screenshot sent back to model → loop continues until `DONE`.

---

## 9. Final Output

AI produces a scraper config:

```json
{
  "start_url": "...",
  "listing_selector": ".card",
  "fields": {
    "title": "h2",
    "price": ".price"
  },
  "pagination": {
    "type": "next_button"
  }
}
```

Held in `ScraperGenerationRun.staged_config` while `status: AWAITING_REVIEW`. Once approved:

1. A new `ScraperVersion` row is created with this config, `created_by: "AI"`
2. `ScraperGenerationRun.produced_version_id` is set to point at it
3. `Scraper.active_version_id` is updated to activate it

Config is never stored in more than one place at a time — `ScraperVersion` is the only long-term home for it.

---

## 10. Production Flow

`Scraper` (via `active_version`) → `CrawlRun` → Playwright execution → `SourceProperty` → `Property` → CMS sync

---

## 11. Self-Healing Loop

1. Failure detected in `CrawlRun` (and logged in `ScraperExecutionTrace`)
2. A new `ScraperGenerationRun` is created with `trigger: SELF_HEAL` and `scraper_id` set to the broken scraper
3. Computer Use Loop runs again, writing new `ComputerUseStep` rows
4. AI produces a fixed config → staged, then reviewed/approved
5. A new `ScraperVersion` is created (incrementing the version number) and `Scraper.active_version_id` is flipped to it — the old version remains in history for rollback

---

## 12. Key Insight

AI = exploration + adaptation (`ScraperGenerationRun` + `ComputerUseStep`)
Playwright = execution (`CrawlRun` + `ScraperExecutionTrace`)
Database = memory system (`ScraperVersion` as the single source of truth, full history preserved)