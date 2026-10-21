/**
 * Fully autonomous browser crawl for WAF/captcha-protected agencies (the `mcp-crawl` skill's §3c).
 *
 * Unlike the chrome-devtools MCP flow (one tool call per page, so a block is only noticed when the
 * session's next call returns), this launches its OWN visible Chrome via Playwright and runs the
 * site's in-page driver (the same `driver.js` the MCP flow uses) in a loop. When a page is blocked it
 * solves the captcha through 2captcha (same services as solve-captcha.ts), injects the token, verifies
 * the page moved on, and continues — seconds after the block, with no session involved.
 *
 *   cd api
 *   npx dotenv -e .env.staging -- node -r ts-node/register scripts/mcp-autocrawl.ts \
 *     --driver=<driver.js> --start=<url> --out=<items.json> [--seed=<items.json>] \
 *     [--profile=<dir>] [--checkpoint-every=50]
 *
 * driver.js contract (same as the MCP flow): an async-IIFE expression that reads/writes IndexedDB
 * db `mcpcrawl`/store `items` and `localStorage.mcpExpect`, navigates itself (`location.href = next`)
 * and returns {pending, next, ...} or {blocked:true}. --seed items (`{source_url, raw}[]`) are loaded
 * into IndexedDB when it is empty. On completion the items are written to --out with the driver-only
 * `_detail_done` flag removed, ready for mcp-crawl-ingest.ts.
 *
 * Progress is appended to <out>.log (one line per page); the script never stops on a block and only
 * exits when `pending` reaches 0 (or --max-minutes elapses).
 */
import { ConfigService } from '@nestjs/config';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { chromium, Page } from 'playwright';
import { CaptchaConfig } from '../src/integrations/captcha/config/captcha.config';
import { CaptchaClientService } from '../src/integrations/captcha/services/captcha-client.service';
import { CaptchaSolverService } from '../src/integrations/captcha/services/captcha-solver.service';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const need = (n: string): string => {
  const v = args.get(n);
  if (!v) throw new Error(`Missing --${n}`);
  return v;
};

const driverSrc = readFileSync(resolve(need('driver')), 'utf8').trim();
const startUrl = need('start');
const outFile = resolve(need('out'));
const seedFile = args.get('seed');
const profileDir = resolve(args.get('profile') ?? `${process.env.TEMP ?? '.'}/mcp-autocrawl-profile`);
const checkpointEvery = Number(args.get('checkpoint-every') ?? 50);
const maxMs = Number(args.get('max-minutes') ?? 0) * 60_000;
const logFile = `${outFile}.log`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + '\n');
};

const solver = new CaptchaSolverService(
  new CaptchaClientService(
    new CaptchaConfig(new ConfigService({ CAPTCHA_API_KEY: process.env.CAPTCHA_API_KEY })),
  ),
  new CaptchaConfig(new ConfigService({ CAPTCHA_API_KEY: process.env.CAPTCHA_API_KEY })),
);

const BLOCK_CHECK = `(() => {
  const t = document.title || '';
  const titled = /Pardon Our Interruption|Just a moment|Attention Required|Access Denied/i.test(t);
  const widget = !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"], .cf-turnstile, #cf-challenge-running, .g-recaptcha');
  const empty = (document.body?.innerText || '').trim().length < 200 && widget;
  return titled || empty;
})()`;

/** page.evaluate that survives in-flight navigations (context destroyed) and settles first. */
async function ev<T>(page: Page, fn: any, arg?: any): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 40; i++) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
      return (await page.evaluate(fn, arg)) as T;
    } catch (e) {
      last = e;
      await sleep(500);
    }
  }
  throw last;
}

async function isBlocked(page: Page): Promise<boolean> {
  try {
    return (await page.evaluate(BLOCK_CHECK)) as boolean;
  } catch {
    return false; // navigation in flight; the next loop turn re-checks
  }
}

async function probeCaptcha(page: Page) {
  return page.evaluate(() => {
    const hc = document.querySelector('.h-captcha[data-sitekey]') as HTMLElement | null;
    const hcFrame = [...document.querySelectorAll('iframe')]
      .map((f) => f.src)
      .find((s) => /hcaptcha/.test(s));
    const ts = document.querySelector('.cf-turnstile[data-sitekey]') as HTMLElement | null;
    const rc = document.querySelector('.g-recaptcha[data-sitekey]') as HTMLElement | null;
    const frameKey = hcFrame ? new URLSearchParams(hcFrame.split('#')[1] ?? '').get('sitekey') : null;
    return {
      hcaptcha: hc?.dataset.sitekey ?? frameKey,
      hcCallback: hc?.dataset.callback ?? null,
      turnstile: ts?.dataset.sitekey ?? null,
      recaptcha: rc?.dataset.sitekey ?? null,
      url: location.href,
    };
  });
}

let solves = 0;
let failedStreak = 0;

/** Solve + inject; resolves true when the page left the challenge. Never throws. */
async function solveBlock(page: Page): Promise<boolean> {
  const probe = await probeCaptcha(page);
  const type = probe.hcaptcha ? 'hcaptcha' : probe.turnstile ? 'turnstile' : probe.recaptcha ? 'recaptcha2' : null;
  if (!type) {
    log(`BLOCK unsupported/no sitekey at ${probe.url}; reloading in 20s`);
    await sleep(20_000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return false;
  }
  log(`BLOCK ${type} at ${probe.url} -> solving (solve #${solves + 1})`);
  let solution;
  try {
    const websiteURL = probe.url;
    solution =
      type === 'hcaptcha'
        ? await solver.solveHCaptcha({ websiteURL, websiteKey: probe.hcaptcha! })
        : type === 'turnstile'
          ? await solver.solveTurnstile({ websiteURL, websiteKey: probe.turnstile! })
          : await solver.solveRecaptchaV2({ websiteURL, websiteKey: probe.recaptcha! });
  } catch (e) {
    failedStreak++;
    const wait = Math.min(300_000, 15_000 * failedStreak);
    log(`SOLVE failed (${e instanceof Error ? e.message : String(e)}); streak ${failedStreak}, retry in ${wait / 1000}s`);
    await sleep(wait);
    return false;
  }
  solves++;
  await page.evaluate(
    ({ token, kind, cb }) => {
      const set = (sel: string) =>
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLTextAreaElement).value = token;
          el.innerHTML = token;
        });
      if (kind === 'hcaptcha') {
        set('textarea[name="h-captcha-response"]');
        set('textarea[name="g-recaptcha-response"]');
        const fn = (window as any)[cb ?? 'solvedCaptcha'];
        if (typeof fn === 'function') setTimeout(() => fn(token), 50);
      } else if (kind === 'turnstile') {
        const i = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
        if (i) i.value = token;
        const cbName = (document.querySelector('.cf-turnstile') as HTMLElement | null)?.dataset.callback;
        if (cbName && typeof (window as any)[cbName] === 'function') setTimeout(() => (window as any)[cbName](token), 50);
      } else {
        set('textarea[name="g-recaptcha-response"]');
        const cbName = (document.querySelector('.g-recaptcha') as HTMLElement | null)?.dataset.callback;
        if (cbName && typeof (window as any)[cbName] === 'function') setTimeout(() => (window as any)[cbName](token), 50);
      }
    },
    { token: solution.token, kind: type, cb: probe.hcCallback },
  );
  // The page navigates/reloads on success; wait until the challenge is gone.
  let passed = false;
  for (let i = 0; i < 30 && !passed; i++) {
    await sleep(1000);
    passed = !(await isBlocked(page));
  }
  if (passed) {
    failedStreak = 0;
    log(`SOLVED task ${solution.taskId} (page moved on)`);
    await solver.reportCorrect(solution.taskId).catch(() => undefined);
  } else {
    failedStreak++;
    log(`token not accepted (task ${solution.taskId}); reporting incorrect`);
    await solver.reportIncorrect(solution.taskId).catch(() => undefined);
  }
  return passed;
}

async function dumpItems(page: Page, final: boolean) {
  const items = (await ev(page, async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('mcpcrawl', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res) => {
      const rq = db.transaction('items').objectStore('items').getAll();
      rq.onsuccess = () => res(rq.result);
    });
  })) as { source_url: string; raw: Record<string, unknown> }[];
  const cleaned = final
    ? items.map((i) => {
        const raw = { ...i.raw };
        delete raw._detail_done;
        return { ...i, raw };
      })
    : items;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(final ? outFile : `${outFile}.checkpoint.json`, JSON.stringify(cleaned));
  return items.length;
}

async function seedIfEmpty(page: Page) {
  if (!seedFile) return;
  const have = (await ev(page, async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('mcpcrawl', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res) => {
      const rq = db.transaction('items').objectStore('items').count();
      rq.onsuccess = () => res(rq.result);
    });
  })) as number;
  const items = JSON.parse(readFileSync(resolve(seedFile), 'utf8')) as { source_url: string }[];
  if (have >= items.length) {
    log(`IndexedDB already has ${have} items (seed ${items.length}); not seeding`);
    return;
  }
  log(`IndexedDB has ${have}/${items.length} items; adding the missing ones (existing/done items are kept)`);
  for (let i = 0; i < items.length; i += 200) {
    await ev(page, async (chunk: any[]) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('mcpcrawl', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res) => {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');
        // add() fails on an existing key, keeping already-crawled items untouched.
        for (const it of chunk) {
          const rq = store.add(it, it.source_url.split('?')[0]);
          rq.onerror = (ev) => ev.preventDefault();
        }
        tx.oncomplete = () => res();
      });
    }, items.slice(i, i + 200));
  }
  log(`seeded ${items.length} items into IndexedDB`);
}

async function main() {
  if (!process.env.CAPTCHA_API_KEY) throw new Error('CAPTCHA_API_KEY missing (run via dotenv -e .env.staging)');
  if (!existsSync(dirname(outFile))) mkdirSync(dirname(outFile), { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const started = Date.now();
  log(`start ${startUrl} (profile ${profileDir})`);

  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => log(`goto: ${e.message}`));
  for (let i = 0; i < 12 && (await isBlocked(page)); i++) await solveBlock(page);
  await seedIfEmpty(page);

  // Resume point: first pending item (the driver picks it up via mcpExpect).
  const firstPending = (await ev(page, async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('mcpcrawl', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all: any[] = await new Promise((res) => {
      const rq = db.transaction('items').objectStore('items').getAll();
      rq.onsuccess = () => res(rq.result);
    });
    return all.find((x) => !x.raw._detail_done && !x.raw._detail_enrichment_error)?.source_url ?? null;
  })) as string | null;
  if (firstPending && !page.url().startsWith(firstPending)) {
    await page.evaluate((u) => localStorage.setItem('mcpExpect', u), firstPending);
    await page.goto(firstPending, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => log(`goto: ${e.message}`));
  }

  let pages = 0;
  let lastDone = '';
  let sameDone = 0;
  let lastCheckpoint = 0;
  for (;;) {
    if (maxMs && Date.now() - started > maxMs) {
      log('max-minutes reached; dumping checkpoint and stopping');
      await dumpItems(page, false);
      break;
    }
    let res: any = null;
    try {
      res = await page.evaluate(driverSrc);
    } catch {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await sleep(300);
    }
    if (!res) {
      if (await isBlocked(page)) await solveBlock(page);
      continue;
    }
    if (res.blocked || (await isBlocked(page))) {
      for (let i = 0; i < 8 && (await isBlocked(page)); i++) if (await solveBlock(page)) break;
      continue;
    }
    if (res.error) {
      log(`driver error: ${JSON.stringify(res)}`);
      if (res.error === 'not at expected page') {
        await sleep(2000);
        const expect = await page.evaluate(() => localStorage.getItem('mcpExpect')).catch(() => null);
        if (expect) await page.goto(expect, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
      } else await sleep(1500);
      continue;
    }
    pages++;
    const key = res.done ?? res.page ?? '';
    sameDone = key && key === lastDone ? sameDone + 1 : 0;
    lastDone = key;
    if (sameDone >= 3) {
      log(`stall on ${key}; reloading`);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
      sameDone = 0;
    }
    log(`#${pages} ${JSON.stringify(res)}`);
    if (res.pending === 0 && !res.next) break;
    if (pages - lastCheckpoint >= checkpointEvery) {
      lastCheckpoint = pages;
      await dumpItems(page, false).catch((e) => log(`checkpoint failed: ${e.message}`));
    }
    if (res.next) {
      await page
        .waitForURL((u) => u.href.startsWith(res.next), { timeout: 60_000, waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
    }
  }

  const n = await dumpItems(page, true);
  log(`DONE: ${n} items written to ${outFile}; ${solves} captcha solves`);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
