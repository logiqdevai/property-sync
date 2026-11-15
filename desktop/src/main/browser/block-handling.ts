import type { Page } from "playwright-core";
import { BlockStates, type BlockState } from "@shared/ipc";
import { api } from "../api/api-client";
import type { CaptchaKind } from "../api/api.interfaces";
import { errorMessage, sleep } from "../utils/async.utils";

/**
 * Detecting and clearing bot walls, the same way scripts/mcp-autocrawl.ts and the server's
 * PageCaptchaSolverService do: solve supported captchas (hCaptcha incl. Imperva, Turnstile,
 * reCAPTCHA v2) through the API's 2captcha account and inject the token; anything else, or a
 * solve that keeps failing, is left to the person at the computer, and the crawl carries on by
 * itself as soon as the page is clear. It never gives up while the user hasn't pressed Stop.
 */

const BLOCK_CHECK = `(() => {
  const t = document.title || '';
  const titled = /Pardon Our Interruption|Just a moment|Attention Required|Access Denied/i.test(t);
  const widget = !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"], .cf-turnstile, #cf-challenge-running, .g-recaptcha');
  const empty = (document.body?.innerText || '').trim().length < 200 && widget;
  return titled || empty;
})()`;

/** Solve attempts per wall before handing over to the user. */
const MAX_SOLVE_ATTEMPTS = 3;
const ACCEPT_TIMEOUT_MS = 30_000;
const USER_POLL_MS = 3_000;

export interface BlockContext {
  /** Needed to solve captchas through the API; null disables solving (photo repair). */
  scraperId: string | null;
  captchaSolverAvailable: boolean;
  setBlock(state: BlockState): void;
  log(line: string): void;
  throwIfStopped(): void;
  /** Called once per wall when the user has to act (bring the window up, notify). */
  onNeedsUser(): void;
  onSolved(): void;
}

interface CaptchaProbe {
  kind: CaptchaKind | null;
  sitekey: string | null;
  callback: string | null;
  url: string;
}

export async function isBlocked(page: Page): Promise<boolean> {
  try {
    return (await page.evaluate(BLOCK_CHECK)) as boolean;
  } catch {
    return false; // navigation in flight; the caller checks again
  }
}

/** Resolves once the page is past the wall. Throws StoppedError if the user stops meanwhile. */
export async function clearBlock(page: Page, ctx: BlockContext): Promise<void> {
  let attempts = 0;
  let askedUser = false;
  while (await isBlocked(page)) {
    ctx.throwIfStopped();
    if (ctx.scraperId && ctx.captchaSolverAvailable && attempts < MAX_SOLVE_ATTEMPTS) {
      attempts++;
      ctx.setBlock(BlockStates.SOLVING);
      const outcome = await trySolve(page, ctx, ctx.scraperId);
      if (outcome === "unsupported") attempts = MAX_SOLVE_ATTEMPTS;
      continue;
    }
    if (!askedUser) {
      askedUser = true;
      ctx.setBlock(BlockStates.NEEDS_USER);
      ctx.log(`waiting for the check on ${page.url()} to be completed in the browser`);
      ctx.onNeedsUser();
    }
    await sleep(USER_POLL_MS);
  }
  ctx.setBlock(BlockStates.NONE);
}

async function trySolve(
  page: Page,
  ctx: BlockContext,
  scraperId: string,
): Promise<"solved" | "failed" | "unsupported"> {
  let probe: CaptchaProbe;
  try {
    probe = await probeCaptcha(page);
  } catch {
    return "failed"; // the page navigated mid-probe; re-checked by the caller
  }
  if (!probe.kind || !probe.sitekey) {
    ctx.log(`no solvable captcha on ${probe.url}`);
    return "unsupported";
  }

  let solution: { token: string; task_id: number };
  try {
    ctx.log(`solving ${probe.kind} on ${probe.url}`);
    solution = await api.solveCaptcha({
      scraper_id: scraperId,
      kind: probe.kind,
      sitekey: probe.sitekey,
      url: probe.url,
    });
  } catch (error) {
    ctx.log(`captcha solve failed: ${errorMessage(error)}`);
    await sleep(5_000);
    return "failed";
  }

  await inject(page, probe, solution.token).catch(() => undefined);
  const accepted = await waitUntilClear(page);
  await api.reportCaptcha(solution.task_id, accepted).catch(() => undefined);
  if (accepted) {
    ctx.onSolved();
    ctx.log(`captcha solved (task ${solution.task_id})`);
    return "solved";
  }
  ctx.log(`captcha token not accepted (task ${solution.task_id})`);
  return "failed";
}

function probeCaptcha(page: Page): Promise<CaptchaProbe> {
  return page.evaluate(() => {
    const el = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const hc = el(".h-captcha[data-sitekey]");
    const hcFrame = Array.from(document.querySelectorAll("iframe"))
      .map((f) => f.src)
      .find((s) => /hcaptcha/.test(s));
    const frameKey = hcFrame ? new URLSearchParams(hcFrame.split("#")[1] ?? "").get("sitekey") : null;
    const ts = el(".cf-turnstile[data-sitekey]");
    const rc = el(".g-recaptcha[data-sitekey]");
    const hcaptcha = hc?.dataset.sitekey ?? frameKey;
    if (hcaptcha) {
      return { kind: "hcaptcha" as const, sitekey: hcaptcha, callback: hc?.dataset.callback ?? null, url: location.href };
    }
    if (ts?.dataset.sitekey) {
      return { kind: "turnstile" as const, sitekey: ts.dataset.sitekey, callback: ts.dataset.callback ?? null, url: location.href };
    }
    if (rc?.dataset.sitekey) {
      return { kind: "recaptcha2" as const, sitekey: rc.dataset.sitekey, callback: rc.dataset.callback ?? null, url: location.href };
    }
    return { kind: null, sitekey: null, callback: null, url: location.href };
  });
}

function inject(page: Page, probe: CaptchaProbe, token: string): Promise<void> {
  return page.evaluate(
    ({ token, kind, callback }) => {
      const setAll = (sel: string) =>
        document.querySelectorAll(sel).forEach((node) => {
          (node as HTMLTextAreaElement).value = token;
          node.innerHTML = token;
        });
      const w = window as unknown as Record<string, unknown>;
      // Imperva's wrapped hCaptcha uses the global `solvedCaptcha(payload)` as its callback.
      const fnName = callback ?? (kind === "hcaptcha" ? "solvedCaptcha" : null);
      if (kind === "hcaptcha") {
        setAll('textarea[name="h-captcha-response"]');
        setAll('textarea[name="g-recaptcha-response"]');
      } else if (kind === "turnstile") {
        const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
        if (input) input.value = token;
      } else {
        setAll('textarea[name="g-recaptcha-response"]');
      }
      const fn = fnName ? w[fnName] : undefined;
      if (typeof fn === "function") setTimeout(() => (fn as (t: string) => void)(token), 50);
    },
    { token, kind: probe.kind, callback: probe.callback },
  );
}

async function waitUntilClear(page: Page): Promise<boolean> {
  const deadline = Date.now() + ACCEPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(1_000);
    if (!(await isBlocked(page))) return true;
  }
  return false;
}
