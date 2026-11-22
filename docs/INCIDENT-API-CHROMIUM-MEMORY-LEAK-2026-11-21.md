# Incident: API crashes with Redis `ETIMEDOUT` / Postgres "Connection terminated unexpectedly" (2026-11-21)

## TL;DR

The API on Coolify logged many errors like these, then went down:

```
Error: connect ETIMEDOUT
    at Socket.<anonymous> (/app/node_modules/ioredis/built/Redis.js:171:41)
  { errorno: 'ETIMEDOUT', code: 'ETIMEDOUT', syscall: 'connect' }

[Scheduler] Error: Connection terminated unexpectedly
    at /app/node_modules/pg-pool/index.js:45:11
    at async PrismaPgAdapter.performIO ...
```

**Postgres and Redis were fine.** The host had run out of RAM and swap. The API process was stalling, so its own sockets timed out. The memory was held by the crawler's shared headless Chromium (`StealthBrowserService`). That browser could never recycle once a single context got stuck.

The redeploy fixed it straight away. The code fix (below) makes the leak bounded and self-healing.

## Where things run (as of 2026-11-21)

- The old GCE VM `coolify-personal` **no longer exists**.
- The API container, Postgres and Redis all run on the **OVH VPS `57.129.171.125`** (4 vCPU, 7.7 GB RAM, 4 GB `/swapfile`).
  - SSH in with `ssh root@57.129.171.125` (key `~/.ssh/id_ed25519`).
  - The Coolify control plane is *not* on this box.
- Container names:
  - API: `qvq7kl4cn0ghoabwzwy7fltl-<deploy timestamp>`
  - Postgres: `lw4va0qzsgfu4p5ohulbzwmj`
  - Redis: `xqhi1n9nn2wlus7dyionsm6k`
- The API reaches Postgres and Redis by container name over the `coolify` Docker network.
- `api/.env.staging` points at the live DB and Redis through the public IP. Use it for read-only checks only.

## How to diagnose if it happens again

Work through these in order. Each step takes about a minute.

1. **Are DB and Redis actually up?** Connect from your machine with `api/.env.staging` (node `pg` plus `ioredis` from `api/node_modules`).
   - Check Postgres uptime: `select now()-pg_postmaster_start_time()`.
   - Run Redis `PING` and `INFO`.
   - If both answer quickly, the problem is on the API side.
2. **Is the API container old, or restarting?**
   ```bash
   ssh root@57.129.171.125 'docker ps -a; docker inspect -f "{{.State.StartedAt}} restarts={{.RestartCount}}" <api-container>'
   docker logs --since 1h <api-container> 2>&1 | grep -cE "ETIMEDOUT|Connection terminated"
   ```
3. **Is the host out of memory?** This is the key step. `sysstat` keeps history in 10-minute samples:
   ```bash
   LC_ALL=C sar -f /var/log/sysstat/saDD -r   # %memused, %commit
   LC_ALL=C sar -f /var/log/sysstat/saDD -S   # %swpused  (99-100% = trouble)
   LC_ALL=C sar -f /var/log/sysstat/saDD -u   # CPU (baseline should be ~2% when no crawls run)
   LC_ALL=C sar -f /var/log/sysstat/saDD -B   # majflt/s spikes = thrashing, matches the error times
   journalctl --since today | grep -iE "out of memory|Killed process"
   docker stats --no-stream
   docker top <api-container> -o pid,rss,etime,args   # look for chrome-headless-shell processes
   ```
   Replace `DD` with the day of the month.
4. **Check what was running.** Look at `crawl_runs` and `job_logs` (`job_name`, `created_at`, `payload`) around the time memory or CPU started climbing.
   - `created_at` is stored in UTC. node-pg prints it shifted by the local offset, so cast to `::text`.

**Healthy reference:**
- A fresh API container uses about 500 MB, of which Chromium is about 250 MB.
- Host CPU idles at about 2%.
- Swap stays low.

## What happened (timeline, UTC)

| When | What |
|---|---|
| Nov 16 | Commit `3322be2` deployed. Same code throughout the incident, so it was **not** a bad deploy. |
| Nov 18 23:09–23:37 | Manual crawl of scraper **`hpr`**: 1,055 detail pages through the **local** shared Chromium (no proxy or managed browser). |
| Nov 18 23:30 → Nov 21 | With no crawls running, host CPU baseline crept up from 2% to 4%, 11%, 22%, then a steady ~55%. Memory grew about 1%/h until swap hit 100%. |
| Nov 21 09:25 | Kernel OOM killer killed `chrome-headless` inside a container, at **2.1 GB RSS**. |
| Nov 21 (all day) | The scheduler couldn't query the DB, so **no scheduled crawls ran that day**. |
| Nov 21 14:34 | Burst of major page faults, the API stalled, and Redis/PG sockets timed out (the errors above). |
| Nov 21 17:57 | Redeploy of the same commit. Memory went from 82% to 15% and swap from 99% to 9%. No errors since. |

## Root cause

`api/src/integrations/crawler/services/stealth-browser.service.ts` keeps **one long-lived shared Chromium** for every local crawl and detail page.

- **Recycling was gated on `browser.contexts().length === 0`.** It was meant to recycle every `crawler_chromium_max_contexts_before_restart` contexts (250 in prod).
- `closeContext()` races `context.close()` against a 10 s timeout. If a close never completes, the caller moves on, but **Chromium still lists that context**. So `contexts().length` never returns to 0, and the browser never recycles again for the life of the process.
- A page that stays open keeps running the site's JavaScript (timers, carousels, trackers) forever. That matches the observed slow, continuous climb in CPU and memory with no crawls running, and a single renderer reaching 2.1 GB.

Other leak paths found and fixed at the same time:

- **Concurrent launch race:** two callers hitting `ensureBrowser()` together during a launch or recycle could each launch a Chromium. One of them was orphaned.
- **Managed/proxy browser:** if building the page failed after `openProxyBrowser()` or `openManagedBrowser()`, that dedicated browser was never closed.
- **`diagnostics-capture.service.ts`:** if `tracing.start`/`stop` or a screenshot threw, `closeContext()` was skipped. The context leaked, and so did its page-concurrency semaphore slot.
- **`estateweb-auth.service.ts`:** `newContext()`/`newPage()` ran before the `try`/`finally` that closes the browser. A failure there leaked a whole Chromium.

> Not proven: the exact page that got stuck. The old container and its logs were destroyed by the redeploy. The fix closes the whole class of leak rather than one specific page.

## The fix

### `stealth-browser.service.ts`

- **Lease tracking instead of `browser.contexts()`.**
  - `localLeases: Map<BrowserContext, openedAt>` records contexts that callers still hold.
  - `pendingLocal` counts callers that are between acquiring the browser and getting their context.
  - `closeContext()` removes the lease first. A context whose `close()` hangs is therefore released and can no longer block recycling. When that happens it logs a warning: `Browser context did not close within …ms; it is discarded on the next Chromium recycle`.
- **Serialized launch/recycle.** A promise-chain lock (`withBrowserLock`) wraps `acquireLocalBrowser()` (which replaced `ensureBrowser()`), so only one shared browser ever exists. `pendingLocal` is incremented inside the lock, so housekeeping can't close the browser under a caller.
- **Housekeeping timer** runs every 60 s (`unref`'d, cleared in `onModuleDestroy`):
  - **Idle recycle.** If the browser has served at least one context and has had no leases or pending callers for **10 min**, it is closed. The next page relaunches it lazily, so every crawl window starts with a fresh Chromium.
  - **Max context age.** Any lease older than **3 h** is force-closed, with an error log: `Force-closing a browser context leased N min ago`. This also frees its semaphore slot.
- On recycle, the log reports `Discarding N unreleased browser context(s) with Chromium` when stuck contexts are killed along with the browser.
- **Managed/proxy path.** If `newStealthPageOnBrowser()` throws, the dedicated browser or connection is closed.

### `diagnostics-capture.service.ts`

Everything between opening and closing the context is now inside `try { … } finally { closeContext(context) }`.

### `estateweb-auth.service.ts`

In both `loginWithPlaywright()` and `refreshToken()`, a failure in `newContext()` / `addCookies()` / `newPage()` now closes the browser before rethrowing.

### Verification

- A scratch script ran the real `StealthBrowserService` against local Chromium. All 7 checks passed:
  - concurrent opens share one browser;
  - a hung `close()` releases the lease;
  - the browser recycles despite the hung context;
  - idle recycle, then lazy relaunch;
  - a 3-hour-old lease is force-closed;
  - a busy browser is never recycled.
- `tsc` is clean for the changed files.
- The crawler, diagnostics and EstateWeb jest suites were run. In the full run, `page-extractors.spec.ts` failed once, most likely a timeout launching Chromium under parallel load. It passes when run alone, both with and without this change, and it doesn't import the changed files.

## Operational follow-ups

- **Set a memory limit on the API container in Coolify** (Resource Limits → Memory, e.g. `3g`). It had none, so a leak in the API could take down Postgres and Redis on the same box.
- After a thrash, check `crawl_runs` for the day. The scheduler may have skipped crawls, and they need triggering by hand.
- After deploying, grep the API logs for `did not close within` and `Force-closing`. Either one means some caller is still leaving pages open, and it points at which crawl to investigate.

## Related

- `docs/INCIDENT-MISSED-SCHEDULED-CRAWLS.md`: crawls skipped for a different reason (cron tick drops).
- `docs/crawler-bot-detection-blocking.md`: managed (Bright Data) and proxy browser background.
