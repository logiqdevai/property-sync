# Incident: Active scrapers silently skipping their daily crawl

**Date investigated:** 2026-09-19
**Fixed in:** `api/src/background/crawl-scheduler.cron.ts`

## Symptom

Every day, a few scrapers with status `ACTIVE` did not run. These scrapers were not broken. They had no `crawl_runs` row for that day at all: no failed run, no error, nothing.

On 2026-09-19 the missed agencies were:

| Agency | Last crawl before fix | Scheduled slot (UTC) |
|---|---|---|
| euroland-crete | 2026-09-17 | 03:04 |
| domilux | 2026-09-17 | 03:04 |
| elgrecogeopap | 2026-09-18 | 03:02 |

On other days, different agencies were missed.

## Background: how scheduling works

`CrawlSchedulerCron.enqueueDueAgencyRuns` runs once a minute through `@nestjs/schedule`, which uses the `cron` package v4. It loops over every enabled, visible agency that at least one user tracks. For each agency it checks whether `source_agencies.crawl_interval` is due. The schedule timezone is `Europe/Athens`, so `0 6 * * *` means 03:00 UTC.

So that every agency doesn't start in the same minute, each one gets a fixed offset of 0–9 minutes, calculated from a hash of its ID. With the default interval, agencies start somewhere between 03:00 and 03:09 UTC.

## Findings

### 1. Whole minutes are missing, for every agency at once

Listing every `crawl_runs` row created in the morning window by minute shows gaps where no agency got a run:

| Day | Minutes with no crawl runs created |
|---|---|
| 09-16 | 03:01–03:04, 03:07 |
| 09-18 | 03:03–03:06, 03:08 |
| 09-19 | 03:01–03:04 |

Each missed agency's slot falls exactly in one of those gaps. The problem is not in any particular agency or scraper. The scheduler tick never ran in those minutes.

### 2. The `cron` library drops late ticks and doesn't catch up

In `node_modules/cron/dist/job.js` (around line 196), when a tick fires later than `threshold` (default **250ms**), the library logs:

```
[Cron] Missed execution deadline by Xms ... Skipping execution as it exceeds threshold (250ms).
```

It then schedules the *next* tick. The missed tick is never run.

### 3. The event loop is blocked right after 03:00

At 03:00 the first crawls start inside the same Node process. Several `started_at` timestamps land at odd seconds, such as `03:05:40` and `03:11:18`, instead of on the minute. That shows the process was too busy to fire timers on time. While the loop is blocked, every per-minute tick misses its 250ms deadline and gets dropped.

### 4. The scheduler only accepted the exact minute

The old due check:

```ts
const prev = interval.prev().toDate();
const msSincePrev = now.getTime() - prev.getTime();
return msSincePrev >= 0 && msSincePrev < 60_000;
```

An agency was due only if a tick ran within the 60 seconds after its slot. If that tick was dropped, the agency wasn't due again until the next day.

The same check also caused a second, smaller bug. If an agency still had an active or normalizing run at its slot minute, it was skipped for the whole day instead of being retried a minute later.

### Root cause, end to end

The first crawls block the event loop. The `cron` library then drops the ticks for minutes 03:01–03:0x. The old check only accepted the exact slot minute, so every agency whose slot fell in a dropped minute got no crawl until the next day.

It hit different agencies each day because which minutes are lost depends on how heavy the first crawls are that morning.

## Fix

In `api/src/background/crawl-scheduler.cron.ts`:

1. **Catch-up instead of an exact minute.** Each tick calculates the agency's most recent slot with its offset (`latestScheduledSlot`). The agency is due if:
   - the slot is less than `SCHEDULE_CATCH_UP_WINDOW_MS` (6 hours) old, **and**
   - no `crawl_runs` row for that agency was created at or after the slot. A manual run also counts, so the agency is not crawled twice.

   A dropped minute now only delays the crawl until the next tick that does run. The latest run time for all agencies is fetched in one `groupBy` query per tick.

2. **Retry when an agency is busy.** If the agency has an active run, is still normalizing, or an error is thrown, the slot stays unserved and the next tick tries again. The "still active/normalizing" rejections (`BadRequestException` from `CrawlRunsService.enqueue`) are logged at debug level instead of error, because they mean "wait", not "failed".

3. **Stop ticks from overlapping.** An in-process `isTickRunning` flag makes sure one tick finishes before another starts. Without it, two overlapping ticks could both see the slot as unserved and create two runs for the same agency.

4. **Keep log volume the same.** Agencies with no active scraper are now checked every minute during the catch-up window. The "no scraper for agency" warning only fires in the first minute after the slot, so it is still logged once per slot.

## Verification

- `tsc --noEmit` and `eslint` pass.
- The new logic was replayed against production data for 2026-09-19 (read-only), using only the tick minutes that actually ran (03:00, 03:05–03:12):
  - elgrecogeopap (slot 03:02), euroland-crete (03:04) and domilux (03:04) are all started at 03:05.
  - Every other agency is started at its normal slot, exactly once.
  - The agencies that only run on Monday and Friday (`0 6 * * 1,5`) are correctly not started, because 09-19 is a Saturday.

## Known limitations and follow-ups

- **The event-loop blocking itself is not fixed.** Crawls still block the API process around 03:00. The scheduler no longer depends on on-time ticks, but other cron jobs in the same process, such as the watchdogs, can still lose ticks. They run every 5–30 minutes and are not tied to one minute, so they recover on the next run. The proper long-term fix is to run the crawl worker in a separate process or service from the API and schedulers.
- **One process only.** The overlap guard works inside one process. If the API ever runs more than one replica, both replicas would schedule crawls. The old code had the same problem. That would need a distributed lock, for example in Redis, or a single scheduler instance.
- **New agencies and schedule changes.** If an agency is added, or its `crawl_interval` is changed, less than 6 hours after its slot, it is crawled on the next tick instead of waiting for the next day.
- **Lost enqueue.** If `crawlRun.create` succeeds but the BullMQ `add` fails, the `QUEUED` row makes the slot look served. This existed before and is not addressed here.

## How to diagnose this again

```sql
select to_char(cr.created_at, 'MM-DD HH24:MI') as minute, sa.name, cr.status
from crawl_runs cr
join source_agencies sa on sa.id = cr.source_agency_id
where cr.created_at > now() - interval '5 days'
  and extract(hour from cr.created_at) = 3
order by cr.created_at;
```

- If whole minutes are missing across all agencies, ticks are being dropped. That is this issue.
- If a run exists but is `FAILED`, it is a different problem: a broken scraper, the watchdog, or the AI batch.
