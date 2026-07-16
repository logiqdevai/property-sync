# AI Coding Task: Production Playwright Diagnostics & Debugging Architecture

## Objective

Design and implement a production-grade diagnostics subsystem for the existing Playwright scraping infrastructure.

The primary goal is to make production scraping failures easy to debug while minimizing runtime overhead and storage usage.

The implementation must integrate with the existing architecture, dependency injection, BullMQ workers, browser management, logging system, configuration system and storage layer.

Do not copy the example code provided in this document. Every code snippet is conceptual only and must be adapted to the existing codebase.

---

# Design Philosophy

The diagnostics system should be completely independent from the scraping logic.

Its responsibility is to observe scraper execution, collect debugging artifacts when required, and expose those artifacts for later inspection.

The scraper itself should not contain diagnostics-specific logic.

The diagnostics subsystem should be responsible for:

- configuring debugging
- starting tracing
- collecting artifacts
- storing diagnostics
- exposing debugging information

---

# Diagnostic Modes

Support multiple diagnostic modes.

## Production

Default mode.

Collect only:

- logs
- execution timings
- errors
- metrics

No tracing.

No video.

No screenshots.

This mode has the smallest runtime overhead.

---

## Trace Mode

Enable Playwright tracing.

Collect:

- Playwright Trace
- screenshots inside the trace
- DOM snapshots
- browser console
- Playwright actions
- timing information

No standalone video.

This mode should be the preferred debugging mode.

---

## Full Debug Mode

Enable every available diagnostic feature.

Collect:

- Playwright Trace
- browser video
- screenshots
- HTML snapshot
- console logs
- browser errors
- network summary
- optional HAR
- execution metadata

This mode is intended only for development or difficult production debugging.

---

# Important Technical Constraint

Playwright tracing is **not retroactive**.

Tracing cannot be enabled after a scraper has already failed.

The browser context must be configured before any page navigation or browser interaction begins.

The diagnostics system must therefore determine the debugging mode before creating the browser context.

Incorrect lifecycle:

```text
Run scraper

↓

Scraper fails

↓

Enable tracing
```

This cannot work.

Correct lifecycle:

```text
Receive Job

↓

Determine diagnostics mode

↓

Create Browser Context

↓

Start tracing (optional)

↓

Execute scraper

↓

Stop tracing

↓

Decide whether to keep or discard collected artifacts
```

The diagnostics configuration must always be decided before browser execution starts.

---

# Browser Lifecycle

The browser manager should remain responsible only for browser lifecycle.

The diagnostics subsystem should configure browser contexts.

Example concept:

```ts
// Example only.
// Adapt to the existing architecture.

const context = await browser.newContext(...);

if (diagnosticsEnabled) {

    await context.tracing.start(...);

}
```

After execution:

```ts
// Example only.

await context.tracing.stop(...);
```

Do not copy this implementation directly.

Integrate with the existing browser manager.

---

# Trace Retention Strategy

Tracing and storing traces are separate responsibilities.

The system may collect traces during execution but decide whether they should be persisted only after the job finishes.

Recommended strategy:

Successful jobs

- stop tracing
- discard trace

Failed jobs

- stop tracing
- store trace

This minimizes storage while still providing diagnostics for failures.

The implementation should support additional retention policies in the future.

---

# Why Playwright Trace

Playwright Trace should be considered the primary debugging artifact.

Compared to video, a trace contains significantly more diagnostic information.

A trace records:

- Playwright actions
- screenshots
- DOM snapshots
- browser console
- JavaScript exceptions
- action timings
- network activity
- selector failures
- browser state

Developers should be able to replay execution step-by-step.

This makes traces significantly more useful than simply watching a recording.

---

# Video Recording

Video recording should be optional.

Video recording must also be configured before browser execution begins.

It cannot be enabled after a failure occurs.

Video is useful for:

- visual debugging
- animation issues
- demonstrations
- timing problems

Video should not be enabled in normal production jobs because it consumes considerably more storage than traces while providing less diagnostic information.

---

# Failure Diagnostics Package

When diagnostics are enabled and a scraping job fails, generate a diagnostics package.

Recommended contents:

- trace.zip
- final screenshot
- page HTML
- browser console
- execution metadata
- browser errors
- optional HAR
- optional video

The diagnostics package should represent the complete execution state required for debugging.

---

# Storage Architecture

Diagnostics should be stored independently from scraping results.

Example:

```text
scraping/

    jobs/

    diagnostics/

        job-id/

            trace.zip

            screenshot.png

            page.html

            console.json

            metadata.json

            network.har

            video.webm
```

The diagnostics subsystem should depend on an abstract storage service.

The implementation should allow replacing the storage backend without modifying scraper logic.

---

# Metadata

Every diagnostics package should include metadata.

Examples:

- Job ID
- Worker ID
- Browser version
- Chromium version
- Playwright version
- URL
- Start timestamp
- End timestamp
- Duration
- Retry number
- Failure reason
- Exception
- Scraper version

This metadata should make failures searchable without opening the trace.

---

# Admin Dashboard

The existing administration interface should expose diagnostics generated by failed jobs.

Example:

```text
Failed Job

Status

Execution Duration

Failure Reason

Attachments

Open Trace

View Screenshot

View HTML

Download Console Log

Download HAR

Watch Video
```

The dashboard should not parse traces.

It should simply provide access to the generated artifacts.

---

# Future Extensibility

The diagnostics subsystem should be designed for future expansion.

Examples:

- AI failure analysis
- DOM comparison
- selector comparison
- network comparison
- retry comparison
- automatic root cause detection
- scraper repair suggestions
- browser performance metrics
- memory usage
- CPU usage
- previous successful execution comparison

Diagnostics should become the foundation for future AI-assisted scraper maintenance.

---

# Implementation Principles

- Keep diagnostics independent from scraper implementations.
- Keep diagnostics independent from browser lifecycle management.
- Keep diagnostics independent from storage implementation.
- Determine diagnostics mode before creating the browser context.
- Configure tracing before any browser interaction begins.
- Separate trace collection from trace retention.
- Prefer Playwright Trace as the primary debugging artifact.
- Treat video as an optional supplementary artifact.
- Use the existing dependency injection, configuration, queue, storage and logging architecture.
- Treat all code snippets in this document as conceptual examples rather than production-ready implementations.
