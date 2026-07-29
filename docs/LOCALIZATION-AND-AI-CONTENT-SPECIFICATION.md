# Property Content Publishing — Localization & AI Titles

Status: **replacement architecture** (supersedes the LocalizationProfile / ContentRule / TranslationRule / AiGenerationRule design)
Scope: Per-`UserTrackedAgency` configuration of how property titles and descriptions are produced and published into EstateWeb language slots

**Compatibility:** Development only. No migration path from the previous localization tables. Existing `LocalizationProfile`, `ContentRule`, `TranslationRule`, `AiGenerationRule`, and related code may be deleted and replaced.

---

## 0. Why the previous architecture is replaced

The previous design solved a different problem than the product needs.

| Previous assumption | Actual requirement |
|---|---|
| Rules hang off `SourceAgency` via a shared `LocalizationProfile` | Rules hang off **`UserTrackedAgency`** — each client configures their own publishing for each tracked agency |
| AI generates N paraphrases in **one** language, then `variant_index` places them into different CMS slots | AI **translates and rewrites** into each target language; a family is a named prompt run that fills one or more language slots |
| Separate `TranslationRule` rows declare every language pair | Source language comes from the agency; target language is the output slot — the pair is implied |
| `ContentRule` + `TranslationRule` + `AiGenerationRule` must be wired together | One list of **output slots** with a strategy per field |
| `estateweb_ad_languages` (per user integration) is the language gate | The tracker's output-slot list **is** the language selection |
| Prompt says “do not translate” | Prompt must translate **and** optimize when the target language differs from the source |

The previous graph was also hard to reason about at runtime (`primary_language` and `is_enabled` unused; AI batch submit unwired; first CMS push often fell back to ORIGINAL). This document replaces that model entirely.

---

## 1. Product goal

For each `UserTrackedAgency`, the user fully configures:

1. **Which EstateWeb languages** receive title/description
2. **How each field is produced** for each language (keep original, Google Translate, or AI title family)
3. **Which AI title families** exist, and which languages each family fills

Nothing about language pairs or slot placement is hardcoded per client.

### 1.1 Worked examples

**Client tracking a Greek agency** (`SourceAgency.content_language = EL`):

| EstateWeb language | Title | Description |
|---|---|---|
| Greek | ORIGINAL (or AI family A) | ORIGINAL |
| German | AI family A | TRANSLATE (EL→DE) |
| French | AI family A | TRANSLATE (EL→FR) |
| Russian | AI family A | TRANSLATE (EL→RU) |

AI family A = one generation job that produces Greek, German, French, and Russian titles (translate + rewrite as needed). Descriptions use Google Translate only.

**Client tracking an English agency** (`SourceAgency.content_language = EN`):

| EstateWeb language | Title | Description |
|---|---|---|
| English | ORIGINAL | ORIGINAL |
| Italian | ORIGINAL | ORIGINAL |

Same English text is published into both EstateWeb slots. No translation. No AI.

**Optional AI split (same Greek agency):**

| AI family | Fills title slots |
|---|---|
| Family A — “Primary markets” | Greek, German, French, Russian |
| Family B — “English markets” | English, Italian |

Each family is one AI call (or one batch line) that returns one title per assigned language.

### 1.2 Fixed technical constraints

- Translation provider: **Google Translate only**
- AI provider: **OpenAI only**
- Languages: the 6 EstateWeb languages (`EL`, `EN`, `DE`, `FR`, `IT`, `RU`) as a Prisma enum; numeric EstateWeb `lang_id` mapping stays a small in-code constant
- AI system prompt: fixed constant in code (not DB-editable). Optional per-family `instructions` string may append user notes; default behavior is translate+optimize into each target language

---

## 2. Design principles

1. **Config owner = `UserTrackedAgency`.** Publishing is a user decision about how they push an agency into their CMS — not a global property of the scraped agency.
2. **Source language = `SourceAgency.content_language`.** One authoritative field. Output configs never store a free-form “from” language; the pair is always `agency.content_language → output.language`.
3. **One concept for “what we publish”:** a list of **output slots**. Each slot is one EstateWeb language with a title strategy and a description strategy.
4. **AI families are named production jobs**, not variant indexes. A family owns a set of title slots and produces one title per language in that set.
5. **Derive translation work from slots.** No `TranslationRule` table. Any slot with strategy `TRANSLATE` implies Google Translate from the agency source language into that slot’s language.
6. **`estateweb_ad_languages` is not the source of truth** for which languages get content. Output slots are. Integration-level language settings may remain as a coarse safety allowlist or be removed; they must not redefine per-agency publishing.
7. **Keep derived content simple.** Store at most one derived text per `(user_property, content_type, language)`.

---

## 3. Domain model

### 3.1 Conceptual model

```
SourceAgency
  content_language: ContentLanguage          // authored language of scraped titles/descriptions

UserTrackedAgency
  └── ContentPublishingConfig (1:1)
        ├── ai_titles_enabled: boolean
        ├── AiTitleFamily[]                  // named families A, B, …
        └── ContentOutput[]                  // one row per EstateWeb language to fill
              title_strategy: ORIGINAL | TRANSLATE | AI
              description_strategy: ORIGINAL | TRANSLATE
              ai_title_family_id?            // required when title_strategy = AI

UserProperty.title / .description            // ORIGINAL text (source language)
UserProperty
  └── PropertyLocalizedContent[]             // derived TRANSLATE / AI text per language
```

### 3.2 Prisma sketch

```prisma
enum ContentLanguage {
  EL
  EN
  DE
  FR
  IT
  RU
}

enum ContentType {
  TITLE
  DESCRIPTION
}

enum TitleProductionStrategy {
  ORIGINAL   // publish UserProperty.title as-is into this language slot
  TRANSLATE  // Google Translate agency.content_language → output.language
  AI         // produce via AiTitleFamily (translate + rewrite into output.language)
}

enum DescriptionProductionStrategy {
  ORIGINAL   // publish UserProperty.description as-is into this language slot
  TRANSLATE  // Google Translate agency.content_language → output.language
}

model SourceAgency {
  // ...existing fields...
  content_language ContentLanguage // required once configured; admin-set
  // REMOVE: localization_profile_id
}

model UserTrackedAgency {
  // ...existing fields...
  content_publishing_config ContentPublishingConfig?
}

/// Per-tracker publishing plan. Replaces LocalizationProfile + the three rule tables.
model ContentPublishingConfig {
  id                     String   @id @default(uuid())
  user_tracked_agency_id String   @unique
  ai_titles_enabled      Boolean  @default(false)
  use_ai_batch           Boolean  @default(false) // default for new families; families may override
  is_enabled             Boolean  @default(true)
  notes                  String?
  created_at             DateTime @default(now())
  updated_at             DateTime @updatedAt

  user_tracked_agency UserTrackedAgency @relation(fields: [user_tracked_agency_id], references: [id], onDelete: Cascade)
  outputs             ContentOutput[]
  ai_title_families   AiTitleFamily[]

  @@map("content_publishing_configs")
}

/// One EstateWeb language slot this tracker publishes into.
model ContentOutput {
  id                   String                         @id @default(uuid())
  config_id            String
  language             ContentLanguage
  title_strategy       TitleProductionStrategy
  description_strategy DescriptionProductionStrategy
  ai_title_family_id   String?
  created_at           DateTime                       @default(now())
  updated_at           DateTime                       @updatedAt

  config          ContentPublishingConfig @relation(fields: [config_id], references: [id], onDelete: Cascade)
  ai_title_family AiTitleFamily?          @relation(fields: [ai_title_family_id], references: [id], onDelete: Restrict)

  @@unique([config_id, language])
  @@index([ai_title_family_id])
  @@map("content_outputs")
}

/// One AI title-generation job. Target languages = ContentOutputs that reference this family
/// with title_strategy = AI. One OpenAI call returns one title per those languages.
model AiTitleFamily {
  id                String   @id @default(uuid())
  config_id         String
  name              String   // e.g. "Primary markets", "English markets"
  model             String?
  use_batch         Boolean? // null = inherit ContentPublishingConfig.use_ai_batch
  instructions      String?  // optional extra user notes appended to the fixed prompt
  generation_options Json?
  is_enabled        Boolean  @default(true)
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  config  ContentPublishingConfig @relation(fields: [config_id], references: [id], onDelete: Cascade)
  outputs ContentOutput[]

  @@unique([config_id, name])
  @@map("ai_title_families")
}

/// Derived content for one language slot. ORIGINAL is never stored here.
model PropertyLocalizedContent {
  id               String                 @id @default(uuid())
  user_property_id String
  content_type     ContentType
  language         ContentLanguage
  production       String                 // "TRANSLATE" | "AI" — audit only
  text             String                 @db.Text
  is_stale         Boolean                @default(false)
  created_at       DateTime               @default(now())
  updated_at       DateTime               @updatedAt

  user_property UserProperty @relation(fields: [user_property_id], references: [id], onDelete: Cascade)

  @@unique([user_property_id, content_type, language])
  @@index([user_property_id])
  @@map("property_localized_contents")
}
```

Retain `AiBatchRun` (or equivalent) for OpenAI Batch tracking of title families. Drop the old localization rule models entirely.

### 3.3 EstateWeb language id mapping (code constant only)

```ts
const CONTENT_LANGUAGE_TO_ESTATEWEB_ID: Record<ContentLanguage, 1 | 2 | 3 | 4 | 5 | 6> = {
  EL: 1, EN: 2, DE: 3, FR: 4, IT: 5, RU: 6,
};
```

---

## 4. Validation rules (config-time)

Enforce in the admin/API write path:

1. `ContentPublishingConfig` requires at least one `ContentOutput`.
2. If `title_strategy = AI`:
   - `config.ai_titles_enabled` must be `true`
   - `ai_title_family_id` must be set and belong to the same config
3. If `title_strategy ≠ AI`, `ai_title_family_id` must be null.
4. If `ai_titles_enabled = false`, no output may use `title_strategy = AI`.
5. If `language === SourceAgency.content_language` and strategy is `TRANSLATE`, reject (noop / identity — use `ORIGINAL` instead).
6. `description_strategy` never includes AI in v1 (descriptions are ORIGINAL or TRANSLATE only). This matches the product rule: when AI titles are on, Google handles descriptions; when AI titles are off, Google may handle titles and descriptions via `TRANSLATE`.
7. An `AiTitleFamily` with zero referencing AI title outputs is allowed as a draft, but generation skips it.
8. `is_enabled = false` on the config means: CMS adapter uses legacy single-language ORIGINAL broadcast for that tracker (or skips multi-lang resolution) — behavior must be explicit in code and respected at resolve time.

---

## 5. Runtime semantics

### 5.1 Resolve source language

```
UserProperty
  → user_id
  → canonical Property → primary SourceAgency
  → UserTrackedAgency(user_id, source_agency_id)
  → ContentPublishingConfig
  → SourceAgency.content_language
```

If no config exists or config is disabled → publish ORIGINAL title/description only into languages allowed by whatever coarse fallback remains (document one clear fallback; prefer: require a config before multi-lang push).

### 5.2 Production matrix

For each `ContentOutput`:

| Field | Strategy | Behavior |
|---|---|---|
| Title | `ORIGINAL` | Use `UserProperty.title` in that EstateWeb slot (even if slot language ≠ source — intentional copy, e.g. EN→IT) |
| Title | `TRANSLATE` | Google Translate `title` from `content_language` → `output.language`; store in `PropertyLocalizedContent` |
| Title | `AI` | Included in that family’s generation job; store AI result in `PropertyLocalizedContent` |
| Description | `ORIGINAL` | Use `UserProperty.description` in that slot (copy allowed) |
| Description | `TRANSLATE` | Google Translate description `content_language` → `output.language` |

### 5.3 AI titles master switch

When `ai_titles_enabled = true`:

- Titles configured as `AI` run through families (translate + rewrite into each family language).
- Descriptions never use AI; `TRANSLATE` uses Google only.
- Title slots still allowed as `ORIGINAL` or `TRANSLATE` if the user chooses (e.g. keep Greek original title, AI only for DE/FR/RU).

When `ai_titles_enabled = false`:

- No AI families run.
- `TRANSLATE` on title and/or description uses Google.
- `ORIGINAL` copies as above.

### 5.4 AI family execution

For each enabled `AiTitleFamily` with one or more AI title outputs:

1. Collect target languages from those outputs.
2. After normalize (before CMS enqueue), process all affected properties for that family together:
   - If `family.use_batch ?? config.use_ai_batch`: submit one OpenAI Batch JSONL (one line per property). Defer CMS enqueue for those properties until the batch webhook completes.
   - Else: call OpenAI chat with a multi-property prompt (chunked), upsert titles, then enqueue CMS.
3. Upsert one `PropertyLocalizedContent(content_type=TITLE, language=…)` per returned language per property.
4. Single-property sync (`forceSyncAi`) remains for manual edits and `forceContentProduction` on CMS push.

### 5.5 Translation execution

Collect unique `(content_type, target_language)` pairs from outputs with strategy `TRANSLATE`. For each:

- Skip if `target_language === content_language` (should already be rejected at config time).
- Skip if fresh non-stale `PropertyLocalizedContent` exists.
- Call Google Translate; upsert.

Run Google Translate in the same pre-CMS production phase as AI titles (not during normal EstateWeb push).

### 5.6 Publishing (`buildAds`)

```
for each ContentOutput in config:
  titles[estatewebId] = resolve title (ORIGINAL field or PropertyLocalizedContent)
  descriptions[estatewebId] = resolve description (same)
for each EstateWeb language with no ContentOutput:
  titles/descriptions = ""
```

No intersection with a parallel `estateweb_ad_languages` list is required. If a global allowlist is kept for account-level reasons, document it as a hard cap — not as the place where agency publishing is configured.

Fallback when derived content is missing/stale: use ORIGINAL text for that slot (never empty if ORIGINAL exists).

Queue ordering: produce content after normalize and before CMS enqueue. When OpenAI title Batch is used, hold CMS create/update until the batch completes. Normal crawl CMS push does not call OpenAI/Google; pass `forceContentProduction` only for manual regenerate-and-push flows.

---

## 6. Configuration shapes (examples)

### 6.1 Greek agency — AI titles family A, Google descriptions

```jsonc
{
  "source_agency": { "content_language": "EL" },
  "config": {
    "ai_titles_enabled": true,
    "use_ai_batch": true,
    "ai_title_families": [
      { "name": "Primary markets" }
    ],
    "outputs": [
      { "language": "EL", "title_strategy": "AI", "description_strategy": "ORIGINAL", "ai_title_family": "Primary markets" },
      { "language": "DE", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" },
      { "language": "FR", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" },
      { "language": "RU", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" }
    ]
  }
}
```

### 6.2 English agency — copy EN into EN and IT

```jsonc
{
  "source_agency": { "content_language": "EN" },
  "config": {
    "ai_titles_enabled": false,
    "outputs": [
      { "language": "EN", "title_strategy": "ORIGINAL", "description_strategy": "ORIGINAL" },
      { "language": "IT", "title_strategy": "ORIGINAL", "description_strategy": "ORIGINAL" }
    ]
  }
}
```

### 6.3 Greek agency — two AI families + Google for remaining descriptions

```jsonc
{
  "source_agency": { "content_language": "EL" },
  "config": {
    "ai_titles_enabled": true,
    "ai_title_families": [
      { "name": "Primary markets" },
      { "name": "English markets" }
    ],
    "outputs": [
      { "language": "EL", "title_strategy": "AI", "description_strategy": "ORIGINAL", "ai_title_family": "Primary markets" },
      { "language": "DE", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" },
      { "language": "FR", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" },
      { "language": "RU", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "Primary markets" },
      { "language": "EN", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "English markets" },
      { "language": "IT", "title_strategy": "AI", "description_strategy": "TRANSLATE", "ai_title_family": "English markets" }
    ]
  }
}
```

### 6.4 No AI — Google Translate titles and descriptions to several languages

```jsonc
{
  "source_agency": { "content_language": "EL" },
  "config": {
    "ai_titles_enabled": false,
    "outputs": [
      { "language": "EL", "title_strategy": "ORIGINAL", "description_strategy": "ORIGINAL" },
      { "language": "EN", "title_strategy": "TRANSLATE", "description_strategy": "TRANSLATE" },
      { "language": "DE", "title_strategy": "TRANSLATE", "description_strategy": "TRANSLATE" }
    ]
  }
}
```

Any source→target pair among the six languages is expressible: add an output with `TRANSLATE` (or an AI family that includes that language).

---

## 7. Service architecture

```
modules/content-publishing/          (replaces modules/localization/)
├── services/
│   ├── content-publishing-config.service.ts   // CRUD + validation
│   ├── content-production.service.ts          // enqueue + run TRANSLATE / AI for a UserProperty
│   ├── content-resolution.service.ts          // Map<estatewebLangId, text> for TITLE/DESCRIPTION
│   ├── google-translation.service.ts          // thin orchestrator over GoogleTranslateService
│   ├── ai-title-family.service.ts             // sync OpenAI path
│   └── ai-title-batch.service.ts              // batch submit + complete
├── constants/
│   ├── content-language.constants.ts
│   └── ai-title-prompt.ts                     // translate + optimize; one title per target language
└── content-publishing.module.ts
```

**Lookup for publish:** resolve `UserTrackedAgency` from `(userProperty.user_id, sourceAgencyId)`, load config + outputs, resolve texts. Do **not** look up a profile on `SourceAgency`.

**Trigger:** on `UserProperty` create/update of title/description → mark stale → enqueue production for that property’s tracker config. CMS sync should wait on production completion when practical (same crawl pipeline stage, or “content ready” gate before push).

---

## 8. AI prompt contract

Fixed system behavior (code constant):

- Input: original title, original description, source language, ordered list of target languages.
- Output: JSON object `{ "titles": { "DE": "...", "FR": "...", ... } }` with exactly one string per requested target language.
- Instructions: for each target language, write a natural marketing title in that language; translate from the source when the target differs; rewrite/optimize for clarity and appeal; keep facts (type, place, size); do not invent amenities.

Optional `AiTitleFamily.instructions` appends client-specific notes after the fixed block.

---

## 9. What to delete

Remove (schema + module + admin UI):

- `LocalizationProfile`
- `ContentRule`
- `TranslationRule`
- `AiGenerationRule`
- `PropertyContentVariant` (replace with `PropertyLocalizedContent`)
- `SourceAgency.localization_profile_id`
- Admin “Localization Profiles” pages and agency profile picker
- Title prompt that forbids translation / generates same-language variant arrays

Keep / reuse:

- `GoogleTranslateService`
- `AiService` / OpenAI integration
- `AiBatchRun` + webhook routing pattern (wire a real submit path)
- EstateWeb adapter publish seam (`buildAds` fed by resolution maps)
- `ContentLanguage` enum and EstateWeb id constant

Clarify or remove:

- `UserIntegrationSettings.estateweb_ad_languages` as the per-agency language selector — replace with `ContentOutput` list on the tracker. Keep only if there is a separate account-level “languages enabled in EstateWeb account” concern.

---

## 10. UI model (admin / user settings)

Preferred UX on the **UserTrackedAgency** detail (or a dedicated “Content publishing” tab):

1. Show source language (read-only from `SourceAgency`; link to admin agency edit if wrong).
2. Toggle **AI titles**.
3. Table of **output languages** (checkboxes for the 6 languages, or add-row). Per row:
   - Title: Original | Translate | AI family (dropdown of families)
   - Description: Original | Translate
4. Section **AI title families**: name, model, batch, optional instructions; show which languages are assigned (derived from the table).

This UI maps 1:1 to `ContentOutput` + `AiTitleFamily`. No separate “translation rules” or “content rules” screens.

---

## 11. Non-goals (v1)

- Multiple AI providers or translation providers
- DB-editable full prompt templates / versioning
- AI-generated descriptions
- Admin-managed language catalog beyond the 6 EstateWeb languages
- Shared profiles reused across many trackers (can add later as “templates to copy”, not as live shared mutable profiles)
- Per-CMS abstraction beyond `ContentLanguage` → EstateWeb id at the adapter boundary

---

## 12. Implementation outline (for a later planning pass)

1. Add `SourceAgency.content_language`; backfill manually per agency.
2. Add `ContentPublishingConfig` / `ContentOutput` / `AiTitleFamily` / `PropertyLocalizedContent`; drop old localization tables.
3. Replace `modules/localization` with `modules/content-publishing`.
4. Point EstateWeb `buildAds` at the new resolver (UTA-scoped).
5. Build tracker UI for outputs + families.
6. Wire sync + multi-property + OpenAI Batch AI title production before CMS enqueue; defer CMS when Batch is pending; `forceContentProduction` on push for manual regenerate.
7. Seed configs for the known Greek and English client cases; verify EstateWeb payloads.

---

## 13. Success criteria

- akinitakritis-style Greek tracker: configurable EL/DE/FR/RU (and more) without code changes.
- English tracker: EN+IT both ORIGINAL without fake translation rules.
- Any `ContentLanguage` → any other `ContentLanguage` via `TRANSLATE` or an AI family.
- Two AI families can target disjoint language sets from one tracker.
- Operators configure publishing on the tracker, not on a global agency profile.
- No `variant_index`, no three-table rule graph, no “Greek AI text stuffed into the German slot” as the default model.
