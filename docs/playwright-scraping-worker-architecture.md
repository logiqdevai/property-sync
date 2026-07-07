# AI Coding Task: Production Playwright Scraping Worker Architecture

## Objective

Design and implement a scalable browser scraping infrastructure using Playwright, BullMQ, Redis, and Docker.

The system should support concurrent scraping jobs across multiple websites while efficiently managing Chromium browser resources.

The implementation must integrate with the existing codebase architecture, naming conventions, dependency injection patterns, logging system, configuration system, and database layer.

Do not blindly copy the example code provided in this document. The examples are only architectural references. Adapt the implementation to match the existing project structure and coding standards.

---

# High-Level Architecture

The scraping system should be separated into independent services:

```
                    API Service
                        |
                        |
                  Create Scrape Jobs
                        |
                        ▼
                    Redis Queue
                    (BullMQ)
                        |
        ┌───────────────┴───────────────┐
        ▼                               ▼
 Scraper Worker Instance          Scraper Worker Instance
        |                               |
        |                               |
 Playwright + Chromium            Playwright + Chromium
        |                               |
 Browser Context Pool             Browser Context Pool
        |                               |
 Website A/B/C                    Website D/E/F


                        |
                        ▼

                 Result Processing
                        |
                        ▼

             Database / Storage / AI Pipeline
```

---

# Core Design Principles

## 1. Do not launch a browser for every job

Avoid:

```
Job 1 → Launch Chromium → Scrape → Close
Job 2 → Launch Chromium → Scrape → Close
Job 3 → Launch Chromium → Scrape → Close
```

This wastes CPU and memory.

Instead:

```
Chromium Process
        |
        |
        ├── Browser Context 1
        │       └── Website A
        |
        ├── Browser Context 2
        │       └── Website B
        |
        └── Browser Context 3
                └── Website C
```

A single Chromium instance should serve multiple isolated browser contexts.

---

# Browser Lifecycle

The worker should:

1. Start.
2. Launch one Chromium instance.
3. Keep Chromium alive.
4. Create browser contexts per scraping task.
5. Close contexts after each job.
6. Gracefully close Chromium when the worker shuts down.

---

# Browser Context Isolation

Each scraping job must use a separate browser context.

A context provides isolated:

* Cookies
* Local storage
* Session storage
* Cache
* Permissions
* Authentication state

Example concept:

```ts
// Example only.
// Adapt to the existing project structure.

const context = await browser.newContext();

const page = await context.newPage();

await page.goto(url);

const data = await page.content();

await context.close();
```

Do not reuse contexts between unrelated scraping jobs.

---

# BullMQ Worker Design

The worker should:

* Receive jobs from Redis.
* Control concurrency.
* Manage browser resources.
* Handle retries.
* Handle failures.
* Store execution metadata.
* Report scraping status.

Example:

```ts
// Example only.
// Modify according to existing queue implementation.

new Worker(
    "scraping",
    async job => {

        const result = await scraperService.execute(
            job.data
        );

        return result;

    },
    {
        concurrency: 10
    }
);
```

---

# Concurrency Management

Concurrency should not be unlimited.

The worker must consider:

* Available RAM
* CPU usage
* Browser memory consumption
* Network bandwidth

Recommended approach:

Start with:

```
1 Chromium process
5-10 concurrent browser contexts
```

Increase gradually.

---

# Horizontal Scaling

When one worker instance reaches capacity, add more worker containers.

Example:

```
                Redis Queue

                    |
        ┌───────────┼───────────┐
        ▼           ▼           ▼

    Worker 1    Worker 2    Worker 3

    Chromium    Chromium    Chromium

    Contexts    Contexts    Contexts
```

BullMQ automatically distributes jobs.

Do not manually assign jobs to workers.

---

# Docker Deployment

Use a Playwright-compatible Docker image.

Example:

```dockerfile
# Example only.
# Adapt versions and build process to the existing project.

FROM mcr.microsoft.com/playwright:<version>

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

CMD ["node", "dist/worker.js"]
```

The container should include:

* Chromium
* Browser dependencies
* Required fonts
* Linux libraries

---

# Browser Manager Responsibilities

The browser manager should:

* Initialize Chromium.
* Maintain browser lifecycle.
* Provide browser access.
* Handle shutdown signals.

Example:

```ts
// Example only.

class BrowserManager {

    private browser;

    async initialize() {
        this.browser = await chromium.launch();
    }

    async getBrowser() {
        return this.browser;
    }

    async shutdown() {
        await this.browser.close();
    }
}
```

---

# Scraping Job Flow

A complete job lifecycle:

```
1. API receives scraping request

2. Create BullMQ job

3. Worker receives job

4. Create browser context

5. Create page

6. Navigate website

7. Execute scraper logic

8. Extract data

9. Save result

10. Close context

11. Mark job completed
```

---

# Error Handling

The system must handle:

* Navigation timeout
* Browser crashes
* Invalid pages
* Network errors
* Blocked requests
* Unexpected HTML
* JavaScript errors

Failed jobs should:

* Capture error details.
* Save debugging metadata.
* Retry according to queue configuration.

---

# Observability

Track:

* Job ID
* Website URL
* Start time
* End time
* Duration
* Browser errors
* Navigation errors
* Number of requests
* Success/failure status

Store logs in the existing application logging system.

---

# Implementation Rules

* Follow the existing codebase architecture.
* Do not introduce unnecessary frameworks.
* Reuse existing configuration, logging, and dependency injection systems.
* Keep browser management separate from scraping logic.
* Keep queue management separate from extraction logic.
* Keep website-specific scraping logic modular.
* Treat provided code snippets as examples only, not final implementation.
