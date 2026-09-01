import { Page } from 'playwright';
import { BlockRule as PersistedBlockRule } from 'generated/prisma';
import {
  DEFAULT_BLOCK_RULES,
  DEFAULT_MIN_READY_BODY_LENGTH,
  DEFAULT_WAIT_TIMEOUT_MS,
  PENDING_BODY_LENGTH_THRESHOLD,
} from './block-handling.constants';
import {
  BlockHandlingConfig,
  BlockRule,
  BlockRuleSource,
} from './block-handling.interface';

export interface AgencyBlockHandlingSource {
  block_rules: PersistedBlockRule[];
  block_handling_wait_timeout_ms: number | null;
  block_handling_min_ready_body_length: number | null;
}

export type ClassifyResult = 'blocked' | 'challenge' | 'pending' | 'ok';

const HARD_BLOCK_STATUSES = new Set([401, 403, 429, 503]);
const lastDocumentStatus = new WeakMap<Page, number>();

function resolveRules(config?: BlockHandlingConfig): BlockRule[] {
  return [...DEFAULT_BLOCK_RULES, ...(config?.rules ?? [])];
}

export function trackDocumentResponses(page: Page): void {
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'document') return;
    if (response.frame() !== page.mainFrame()) return;
    lastDocumentStatus.set(page, response.status());
  });
}

export function getLastDocumentStatus(page: Page): number | undefined {
  return lastDocumentStatus.get(page);
}

function testContentRule(
  rule: BlockRule,
  snapshot: {
    title: string;
    text: string;
    html: string;
    path: string;
    scriptContent: string;
  },
): boolean {
  let haystack: string;
  switch (rule.source as BlockRuleSource) {
    case 'title':
      haystack = snapshot.title;
      break;
    case 'text':
      haystack = snapshot.text;
      break;
    case 'html':
      haystack = snapshot.html.slice(0, 8000);
      break;
    case 'path':
      haystack = snapshot.path;
      break;
    case 'script_content':
      haystack = snapshot.scriptContent;
      break;
    default:
      return false;
  }

  if (rule.regex) {
    return new RegExp(rule.pattern, rule.flags ?? 'i').test(haystack);
  }
  return haystack.includes(rule.pattern);
}

async function ruleMatches(
  page: Page,
  rule: BlockRule,
  snapshot: {
    title: string;
    text: string;
    html: string;
    path: string;
    scriptContent: string;
  },
): Promise<boolean> {
  if (rule.source === 'selector') {
    return page
      .locator(rule.pattern)
      .count()
      .then((n) => n > 0)
      .catch(() => false);
  }
  return testContentRule(rule, snapshot);
}

async function classifySnapshot(
  page: Page,
  snapshot: {
    title: string;
    text: string;
    html: string;
    path: string;
    scriptContent: string;
    httpStatus?: number;
  },
  rules: BlockRule[],
  minReadyBodyLength: number,
): Promise<ClassifyResult> {
  // Challenge patterns are checked before the hard-status short-circuit below:
  // bot-management interstitials (e.g. Cloudflare's "Just a moment..." managed
  // challenge) commonly respond with a 401/403/429/503 themselves while the JS
  // challenge is still resolving, which would otherwise read identically to a
  // real, unrecoverable block and skip the poll loop in
  // waitForBotChallengeClearance that exists specifically to wait these out.
  for (const rule of rules) {
    if (
      rule.signal === 'challenge' &&
      (await ruleMatches(page, rule, snapshot))
    ) {
      return 'challenge';
    }
  }

  if (
    snapshot.httpStatus != null &&
    HARD_BLOCK_STATUSES.has(snapshot.httpStatus)
  ) {
    return 'blocked';
  }

  for (const rule of rules) {
    if (rule.signal === 'blocked' && (await ruleMatches(page, rule, snapshot))) {
      return 'blocked';
    }
  }
  if (snapshot.text.trim().length < minReadyBodyLength) {
    return 'pending';
  }
  return 'ok';
}

async function readPageSnapshot(page: Page): Promise<{
  title: string;
  text: string;
  html: string;
  path: string;
  scriptContent: string;
  httpStatus?: number;
}> {
  const httpStatus = lastDocumentStatus.get(page);
  try {
    const snapshot = await page.evaluate(() => {
      const scripts = Array.from(document.scripts)
        .map((s) => `${s.src}\n${s.textContent ?? ''}`)
        .join('\n');
      return {
        title: document.title ?? '',
        text: document.body?.innerText ?? '',
        html: document.documentElement?.innerHTML?.slice(0, 8000) ?? '',
        path: location.pathname,
        scriptContent: scripts,
      };
    });
    return { ...snapshot, httpStatus };
  } catch {
    const [title, html, url] = await Promise.all([
      page.title().catch(() => ''),
      page.content().catch(() => ''),
      Promise.resolve(page.url()),
    ]);
    let path = '';
    try {
      path = new URL(url).pathname;
    } catch {
      path = '';
    }
    const htmlSlice = html.slice(0, 8000);
    const text = htmlSlice
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      title,
      text,
      html: htmlSlice,
      path,
      scriptContent: htmlSlice,
      httpStatus,
    };
  }
}

async function classify(
  page: Page,
  rules: BlockRule[],
  minReadyBodyLength: number,
): Promise<ClassifyResult> {
  const snapshot = await readPageSnapshot(page);
  return classifySnapshot(page, snapshot, rules, minReadyBodyLength);
}

export async function classifyPageAccess(
  page: Page,
  config?: BlockHandlingConfig,
): Promise<ClassifyResult> {
  const rules = resolveRules(config);
  const minReadyBodyLength =
    config?.min_ready_body_length ?? DEFAULT_MIN_READY_BODY_LENGTH;
  return classify(page, rules, minReadyBodyLength);
}

export async function isBlockedPage(
  page: Page,
  config?: BlockHandlingConfig,
): Promise<boolean> {
  return (await classifyPageAccess(page, config)) === 'blocked';
}

export async function isAccessBarrierPage(
  page: Page,
  config?: BlockHandlingConfig,
): Promise<boolean> {
  const state = await classifyPageAccess(page, config);
  return state === 'blocked' || state === 'challenge';
}

export function isAccessBarrierTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  for (const rule of DEFAULT_BLOCK_RULES) {
    if (rule.source !== 'title') continue;
    if (rule.regex) {
      if (new RegExp(rule.pattern, rule.flags ?? 'i').test(trimmed)) {
        return true;
      }
    } else if (trimmed.includes(rule.pattern)) {
      return true;
    }
  }
  return false;
}

export async function waitForBotChallengeClearance(
  page: Page,
  config?: BlockHandlingConfig,
  timeoutMs?: number,
): Promise<ClassifyResult> {
  const rules = resolveRules(config);
  const minReadyBodyLength =
    config?.min_ready_body_length ?? DEFAULT_MIN_READY_BODY_LENGTH;
  const effectiveTimeoutMs =
    timeoutMs ?? config?.wait_timeout_ms ?? DEFAULT_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + effectiveTimeoutMs;

  let state = await classify(page, rules, PENDING_BODY_LENGTH_THRESHOLD);
  if (state === 'ok') {
    await page.waitForTimeout(1500);
    state = await classify(page, rules, PENDING_BODY_LENGTH_THRESHOLD);
    if (state === 'ok') return state;
  }

  if (state === 'blocked') return state;

  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    state = await classify(page, rules, minReadyBodyLength);
    if (state === 'ok' || state === 'blocked') break;
  }

  await page.waitForTimeout(500);
  return state;
}

export function buildBlockHandlingConfig(
  agency: AgencyBlockHandlingSource | null | undefined,
): BlockHandlingConfig | undefined {
  if (!agency) return undefined;

  const hasRules = agency.block_rules.length > 0;
  const hasOverrides =
    agency.block_handling_wait_timeout_ms != null ||
    agency.block_handling_min_ready_body_length != null;

  if (!hasRules && !hasOverrides) return undefined;

  return {
    version: 1,
    rules: agency.block_rules
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((rule) => ({
        id: rule.id,
        signal: rule.signal === 'BLOCKED' ? 'blocked' : 'challenge',
        source: rule.source.toLowerCase() as BlockRule['source'],
        pattern: rule.pattern,
        regex: rule.is_regex,
        flags: rule.regex_flags ?? undefined,
      })),
    wait_timeout_ms: agency.block_handling_wait_timeout_ms ?? undefined,
    min_ready_body_length:
      agency.block_handling_min_ready_body_length ?? undefined,
  };
}
