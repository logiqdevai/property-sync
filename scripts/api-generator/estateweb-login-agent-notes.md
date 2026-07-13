# EstateWeb login/auth — agent notes (cookie + CSRF + token)

This document captures what we discovered while reverse‑engineering authentication for `https://app.estateweb.gr`.

Goal: make automated login reliable for scrapers/workers and reuse session for `/api/*` calls.

---

## What we observed (facts)

### 1) Session cookie exists before login submit

Browser flow shows `POST /login` requests already include:

- `Cookie: estate_session=...`

So the server expects a **pre-session cookie** to already exist when you submit credentials.

That pre-session cookie is typically set by:

- `GET /login` response (`Set-Cookie: estate_session=...`)

### 2) CSRF token comes from the login HTML and changes

`GET /login` HTML contains:

```html
<input type="hidden" name="__csrf" value="...">
```

`__csrf` is a CSRF token and **must be fetched fresh** (it changes frequently; don’t hardcode).

### 3) Login submit is a POST + redirect

`POST /login` returns:

- `302 Found`
- `Location: /app`

This indicates successful login without returning JSON tokens. Cookies are the primary state carrier.

### 4) A JS “token” exists in app HTML, separate from `__csrf`

After login we also saw an inline script:

```js
var token = '...';
```

This token is **not** the `__csrf` token. It appears to be an **app token** used by the frontend (often sent as Bearer on API calls).

You should treat it as **volatile** and refresh when session/login refreshes.

---

## Correct automated login algorithm (must follow)

### Step A — GET `/login`

1. Request `GET https://app.estateweb.gr/login`
2. Store cookies returned by server (especially `estate_session`) in a cookie jar
3. Parse HTML and extract `__csrf`

### Step B — POST `/login`

1. Request `POST https://app.estateweb.gr/login`
2. Send same cookie jar from Step A (must include `estate_session`)
3. Body is `application/x-www-form-urlencoded`:
   - `__csrf=<from Step A>`
   - `email=<email>`
   - `password=<password>`
4. Expect redirect to `/app` (302)

### Step C — Use session for API requests

For subsequent API calls (e.g. `GET /api/property`), send:

- `Cookie: estate_session=<cookie_jar_value>`
- and, if required for the endpoint/app version, also:
  - `Authorization: Bearer <token>`
  - `Accept-Language: en-US,en;q=0.9,el;q=0.8`

---

## Sample implementation (Playwright) — recommended

Reason: Playwright automatically handles redirects + cookie jar + dynamic DOM/HTML parsing reliably.

Repo helper already exists:

- `scripts/scraper-generator/crawl/estateweb-login.js`

### Minimal usage (create a logged-in session and reuse it)

```js
import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = "https://app.estateweb.gr";
const email = process.env.ESTATEWEB_EMAIL;
const password = process.env.ESTATEWEB_PASSWORD;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl, locale: "en-US" });
const page = await context.newPage();

await page.goto("/login", { waitUntil: "domcontentloaded" });
const csrf = await page.locator('input[name="__csrf"]').getAttribute("value");
if (!csrf) throw new Error("Missing __csrf");

await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(password);
await Promise.all([page.waitForNavigation(), page.locator('form[action="/login"] button').click()]);

const cookies = await context.cookies();
const estateSession = cookies.find((c) => c.name === "estate_session")?.value;
if (!estateSession) throw new Error("Missing estate_session cookie after login");

const html = await page.content();
const token = html.match(/var\\s+token\\s*=\\s*'([^']+)'/)?.[1] ?? null;

const storageState = await context.storageState();

await fs.writeFile(
  "estateweb-session.json",
  JSON.stringify(
    {
      baseUrl,
      createdAt: new Date().toISOString(),
      csrf,
      token,
      estateSession,
      storageState,
    },
    null,
    2,
  ),
  "utf-8",
);

await context.close();
await browser.close();
```

### Reuse session later (no login)

```js
import fs from "node:fs/promises";
import { chromium } from "playwright";

const session = JSON.parse(await fs.readFile("estateweb-session.json", "utf-8"));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: session.baseUrl,
  storageState: session.storageState,
  locale: "en-US",
});

// context now has cookies; API calls or page navigation should be authenticated
const page = await context.newPage();
await page.goto("/app", { waitUntil: "domcontentloaded" });
```

---

## Sample API call shape (Node fetch/axios)

If you call the API directly (not through a browser page), use headers derived from session data:

```js
const headers = {
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
  Cookie: `estate_session=${estateSession}`,
};

if (token) {
  headers.Authorization = `Bearer ${token}`;
}
```

Then call:

```js
await fetch("https://app.estateweb.gr/api/property?status_id=0&agent_scope=0&page=1&rpp=50", {
  method: "GET",
  headers,
});
```

---

## Pitfalls and troubleshooting

### No cookie after login

If automation yields no `estate_session`:

- Confirm you did **GET /login first**
- Confirm CSRF extracted from **that same GET response**
- Confirm POST includes cookie jar (not a new session)
- Check for anti-bot protections if running from a non-browser HTTP client

### Token vs CSRF confusion

- `__csrf`: hidden form field in `/login` page; changes; required for POST
- `token`: JS variable in app HTML; separate; may be used for API authorization

### Redirects hide where cookies are set

Cookies can be set on intermediate responses (302). Playwright handles this automatically.

---

## Where to plug this in the main API

Suggested integration pattern:

- Create an “EstateWebAuthProvider” inside your server that:
  - lazily logs in when no valid session exists
  - caches `storageState` + `token` + `estate_session` in memory (and optionally on disk)
  - refreshes on `401` responses or when cookie expires
- For concurrent jobs: create contexts from a shared `storageState` snapshot, not by logging in per job.

---

## References (evidence we used)

- `GET /login` HTML includes `__csrf` hidden input and requires fresh extraction
- `POST /login` returns `302` `Location: /app` and sends `estate_session` cookie in request headers
- DevTools “Cookies” tab shows `estate_session` present on login requests

