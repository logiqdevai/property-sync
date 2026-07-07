# `api/` Folder Structure — Target End State

Personal reference snapshot of what `api/src/` (and `prisma/`) looks like once the
backend is fully built out. Not part of the task plan — just here to check the
codebase against.

```
api/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       └── <timestamp>_init/
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── controllers/email.controller.ts
│   │   │   ├── services/email.service.ts
│   │   │   ├── strategies/jwt.strategy.ts
│   │   │   ├── entities/auth-response.entity.ts
│   │   │   ├── interfaces/auth.interface.ts
│   │   │   └── dto/
│   │   │       ├── login-email.dto.ts
│   │   │       ├── register-email.dto.ts
│   │   │       └── waitlist.dto.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts                     # GET /users/me · GET /admin/users · GET /admin/users/:id
│   │   │   ├── users.service.ts
│   │   │   ├── dto/user-query.schema.ts
│   │   │   └── entities/user.entity.ts
│   │   │
│   │   ├── agencies/                                   # SourceAgency CRUD
│   │   │   ├── agencies.module.ts
│   │   │   ├── agencies.controller.ts
│   │   │   ├── agencies.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-agency.dto.ts
│   │   │   │   ├── update-agency.dto.ts
│   │   │   │   ├── update-agency-status.dto.ts
│   │   │   │   ├── update-agency-visibility.dto.ts
│   │   │   │   ├── update-tracker-crawl-interval.dto.ts
│   │   │   │   └── agency-query.schema.ts
│   │   │   ├── entities/agency.entity.ts
│   │   │   └── interfaces/agency.interface.ts
│   │   │
│   │   ├── scrapers/                                   # Scraper + ScraperVersion CRUD/versioning
│   │   │   ├── scrapers.module.ts
│   │   │   ├── scrapers.controller.ts
│   │   │   ├── scrapers.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-scraper.dto.ts
│   │   │   │   ├── create-scraper-version.dto.ts
│   │   │   │   ├── update-scraper.dto.ts
│   │   │   │   └── scraper-query.schema.ts
│   │   │   └── entities/
│   │   │       ├── scraper.entity.ts
│   │   │       └── scraper-version.entity.ts
│   │   │
│   │   ├── scraper-generation/                         # ScraperGenerationRun + ComputerUseStep
│   │   │   ├── scraper-generation.module.ts            # registers 'generation' queue, hosts @Processor('generation')
│   │   │   ├── scraper-generation.controller.ts
│   │   │   ├── scraper-generation.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-generation-run.dto.ts
│   │   │   │   ├── generation-run-query.schema.ts
│   │   │   │   └── reject-generation-run.dto.ts
│   │   │   └── entities/
│   │   │       ├── generation-run.entity.ts
│   │   │       └── computer-use-step.entity.ts
│   │   │
│   │   ├── crawl-runs/                                 # CrawlRun HTTP surface + queue registration
│   │   │   ├── crawl-runs.module.ts                    # registers 'crawl' queue
│   │   │   ├── crawl-runs.controller.ts
│   │   │   ├── crawl-runs.service.ts                   # enqueue() — single entry point for run-now/rerun/cron
│   │   │   ├── dto/create-crawl-run-query.schema.ts
│   │   │   └── entities/crawl-run.entity.ts
│   │   │
│   │   ├── jobs/                                       # generic JobLog read/monitor + retry
│   │   │   ├── jobs.module.ts
│   │   │   ├── jobs.controller.ts
│   │   │   ├── jobs.service.ts
│   │   │   ├── dto/job-log-query.schema.ts
│   │   │   └── entities/job-log.entity.ts
│   │   │
│   │   ├── properties/                                 # normalization/dedup/history + admin read API
│   │   │   ├── properties.module.ts                    # registers 'ai-batch-complete' queue
│   │   │   ├── properties.controller.ts
│   │   │   ├── properties.service.ts
│   │   │   ├── constants/normalization-prompt.ts
│   │   │   ├── services/property-normalization.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── property-query.schema.ts
│   │   │   │   └── merge-properties.dto.ts
│   │   │   └── entities/property.entity.ts
│   │   │
│   │   ├── openai-webhooks/                            # public webhook, no JwtGuard
│   │   │   ├── openai-webhooks.module.ts
│   │   │   ├── openai-webhooks.controller.ts           # POST /webhooks/openai — raw body, signature-verified
│   │   │   └── openai-webhooks.service.ts
│   │   │
│   │   ├── user-tracked-agencies/                      # user-scoped agency tracking
│   │   │   ├── user-tracked-agencies.module.ts
│   │   │   ├── user-tracked-agencies.controller.ts     # GET /agencies · POST/PATCH/DELETE /agencies/:id/track
│   │   │   ├── user-tracked-agencies.service.ts
│   │   │   └── dto/
│   │   │       ├── track-agency.dto.ts
│   │   │       └── agency-query.schema.ts
│   │   │
│   │   ├── user-properties/                            # user's editable Property copies
│   │   │   ├── user-properties.module.ts
│   │   │   ├── user-properties.controller.ts           # GET/PATCH /properties · POST /properties/:id/resync
│   │   │   ├── user-properties.service.ts              # + syncForProperty() called from normalization
│   │   │   ├── dto/
│   │   │   │   ├── update-user-property.dto.ts
│   │   │   │   └── user-property-query.schema.ts
│   │   │   └── entities/user-property.entity.ts
│   │   │
│   │   ├── notifications/                              # in-app Notification model + admin API
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts                # create() fire-and-forget via setImmediate
│   │   │   ├── dto/notification-query.schema.ts
│   │   │   └── entities/notification.entity.ts
│   │   │
│   │   ├── integration-targets/                        # admin CMS/AI target config + accounts-on-behalf-of
│   │   │   ├── integration-targets.module.ts
│   │   │   ├── integration-targets.controller.ts
│   │   │   ├── integration-targets.service.ts          # resolveActiveApiKey() / resolveForSourceAgency()
│   │   │   ├── dto/
│   │   │   │   ├── create-integration-target.dto.ts
│   │   │   │   ├── update-integration-target.dto.ts
│   │   │   │   ├── integration-target-query.schema.ts
│   │   │   │   ├── create-user-integration.dto.ts
│   │   │   │   └── update-user-integration-account.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── integration-target.entity.ts
│   │   │   │   └── user-integration.entity.ts
│   │   │   └── utils/mask-credentials.util.ts
│   │   │
│   │   ├── user-integrations/                          # user-scoped connections
│   │   │   ├── user-integrations.module.ts
│   │   │   ├── user-integrations.controller.ts         # GET /integrations/targets|connections · POST/PATCH/DELETE /integrations/connections
│   │   │   ├── user-integrations.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-user-integration.dto.ts
│   │   │   │   └── update-user-integration.dto.ts
│   │   │   └── entities/user-integration-connection.entity.ts
│   │   │
│   │   ├── dashboard/                                  # KPI + activity-feed aggregation
│   │   │   ├── dashboard.module.ts
│   │   │   ├── dashboard.controller.ts
│   │   │   ├── dashboard.service.ts                    # Promise.all() over every independent count/aggregate
│   │   │   └── entities/dashboard.entity.ts
│   │   │
│   │   ├── google-maps/                                # pre-existing, unrelated
│   │   ├── stripe/                                     # pre-existing, unrelated
│   │   └── internal/                                   # pre-existing scaffolds (ai, mail, redis-cache, sms), unrelated
│   │
│   ├── integrations/
│   │   ├── ai/                                         # Vercel AI SDK, sync text/object gen — used for sync normalization
│   │   │
│   │   ├── ai-batch/                                   # OpenAI Batch API (deferred normalization)
│   │   │   ├── ai-batch.module.ts
│   │   │   └── services/
│   │   │       ├── ai-batch-client.service.ts          # files.create / batches.create|retrieve|cancel / output download
│   │   │       └── property-ai-batch.service.ts        # builds .jsonl, submits, completes via PropertyNormalizationService
│   │   │
│   │   ├── computer-use/                               # Anthropic vision loop + Playwright action executor
│   │   │   ├── computer-use.module.ts
│   │   │   ├── computer-use-orchestrator.service.ts    # run() — the full generation loop
│   │   │   ├── constants/generation-prompt.ts
│   │   │   └── services/
│   │   │       ├── computer-use-client.service.ts      # @anthropic-ai/sdk wrapper, per-call apiKey
│   │   │       ├── playwright-driver.service.ts        # launch/screenshot/executeAction/close
│   │   │       ├── scraper-config-verification.service.ts
│   │   │       └── screenshot-storage.service.ts       # Buffer → GcsService → Document row
│   │   │
│   │   ├── crawler/                                    # production Playwright crawl + detail enrichment
│   │   │   ├── crawler.module.ts
│   │   │   ├── interfaces/scraper-config.interface.ts
│   │   │   └── services/
│   │   │       ├── stealth-browser.service.ts          # persistent browser manager: one Chromium per worker process, one context per job
│   │   │       ├── field-extraction.service.ts
│   │   │       ├── detail-enrichment.service.ts
│   │   │       └── crawler.service.ts                  # runCrawl() — pagination, MAX_PAGES cap, trace log
│   │   │
│   │   ├── storage/
│   │   │   ├── gcs/                                    # existing — reused as-is for screenshot storage
│   │   │   └── elasticsearch/                          # existing, unrelated
│   │   │
│   │   ├── notifications/                              # existing — email/SMS provider infra (resend, twillio); NOT the in-app Notification model above
│   │   │   ├── resend/
│   │   │   └── twillio/
│   │   │
│   │   └── stripe/                                     # existing, unrelated
│   │
│   ├── background/                                     # cron jobs + BullMQ processors
│   │   ├── generation.processor.ts                     # @Processor('generation')
│   │   ├── crawl.processor.ts                          # @Processor('crawl'), bounded concurrency
│   │   ├── crawl-scheduler.cron.ts                      # @Cron(EVERY_MINUTE) — per-tracker cron match + overlap prevention
│   │   ├── scraper-health.cron.ts                       # @Cron(EVERY_HOUR) — recomputes health/success_rate/avg_runtime_ms
│   │   └── ai-batch-complete.processor.ts              # @Processor('ai-batch-complete') — finishes deferred normalization
│   │
│   ├── core/
│   │   ├── databases/
│   │   │   ├── prisma/
│   │   │   └── redis/
│   │   ├── graphql/                                    # unused (GraphQLModule commented out)
│   │   └── queues/                                     # @Global BullMQ + ioredis wiring; queues registered per-module ('generation', 'crawl', 'ai-batch-complete')
│   │
│   └── shared/
│       ├── config/
│       │   ├── account/
│       │   ├── app-urls/
│       │   ├── email/
│       │   ├── error-codes/
│       │   └── env/
│       │       └── env.validation.ts                   # gains SCRAPER_GENERATION_MODEL, CRAWL_WORKER_CONCURRENCY, OPENAI_WEBHOOK_SECRET
│       ├── decorators/
│       ├── guards/
│       │   ├── jwt.guard.ts
│       │   └── roles.guard.ts
│       ├── models/graphql/
│       ├── pipes/zod.validation.pipe.ts
│       ├── services/
│       └── utils/
│
├── .env.template
├── .env.local / .env.development / .env.staging / .env.production
└── package.json                                        # gains @anthropic-ai/sdk, playwright, openai
```

## Things worth remembering

- **`integrations/crawler/`** is the only place that calls `chromium.launch()` for production
  crawling — `StealthBrowserService` launches once per worker process and reuses that browser
  across every `CrawlRun` job; only a `BrowserContext` is per-job. `integrations/computer-use/`
  launches its own separate, short-lived browser per generation run — different lifecycle, on
  purpose (one run at a time, not a job queue).
- **Two unrelated "AI" integrations**: `integrations/ai/` (Vercel AI SDK, sync text/object gen)
  vs. `integrations/computer-use/` (`@anthropic-ai/sdk` direct, multi-turn vision loop). Don't
  expect them to merge.
- **Naming collision, not a code relationship**: `modules/notifications/` (in-app `Notification`
  model) vs. `integrations/notifications/{resend,twillio}` (email/SMS provider clients). No shared
  code between them.
- `google-maps`, `stripe`, and `internal/*` are starter-template leftovers, not part of this
  product.
