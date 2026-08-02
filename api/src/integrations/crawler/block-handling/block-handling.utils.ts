import { Page } from 'playwright';
import { BlockRule as PersistedBlockRule } from 'generated/prisma';
import {
  DEFAULT_BLOCK_RULES,
  DEFAULT_MIN_READY_BODY_LENGTH,
  DEFAULT_WAIT_TIMEOUT_MS,
  PENDING_BODY_LENGTH_THRESHOLD,
} from './block-handling.constants';
import { BlockHandlingConfig, BlockRule } from './block-handling.interface';

/// Shape needed from a SourceAgency to resolve its BlockHandlingConfig -- either the
/// eagerly-loaded `block_rules` relation, or a select projecting the same fields.
export interface AgencyBlockHandlingSource {
  block_rules: PersistedBlockRule[];
  block_handling_wait_timeout_ms: number | null;
  block_handling_min_ready_body_length: number | null;
}

type ClassifyResult = 'blocked' | 'challenge' | 'pending' | 'ok';

function resolveRules(config?: BlockHandlingConfig): BlockRule[] {
  return [...DEFAULT_BLOCK_RULES, ...(config?.rules ?? [])];
}

function evaluateRules(args: {
  rules: BlockRule[];
  minReadyBodyLength: number;
}): ClassifyResult {
  const { rules, minReadyBodyLength } = args;
  const testRule = (rule: BlockRule): boolean => {
    if (rule.source === 'selector') {
      return !!document.querySelector(rule.pattern);
    }

    let haystack: string;
    switch (rule.source) {
      case 'title':
        haystack = document.title ?? '';
        break;
      case 'text':
        haystack = document.body?.innerText ?? '';
        break;
      case 'html':
        haystack = document.documentElement?.innerHTML?.slice(0, 4000) ?? '';
        break;
      case 'path':
        haystack = location.pathname;
        break;
      case 'script_content':
        haystack = Array.from(document.scripts)
          .map((s) => `${s.src}\n${s.textContent ?? ''}`)
          .join('\n');
        break;
      default:
        return false;
    }

    if (rule.regex) {
      return new RegExp(rule.pattern, rule.flags ?? 'i').test(haystack);
    }
    return haystack.includes(rule.pattern);
  };

  if (rules.some((rule) => rule.signal === 'blocked' && testRule(rule))) {
    return 'blocked';
  }
  if (rules.some((rule) => rule.signal === 'challenge' && testRule(rule))) {
    return 'challenge';
  }
  if ((document.body?.innerText?.trim().length ?? 0) < minReadyBodyLength) {
    return 'pending';
  }
  return 'ok';
}

async function classify(
  page: Page,
  rules: BlockRule[],
  minReadyBodyLength: number,
): Promise<ClassifyResult> {
  return page
    .evaluate(evaluateRules, { rules, minReadyBodyLength })
    .catch(() => 'pending' as const);
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

/// Builds the runtime BlockHandlingConfig (consumed by isBlockedPage/waitForBotChallengeClearance)
/// from a SourceAgency's relational block-handling columns/rows. Returns undefined when the
/// agency has no overrides at all, so callers fall back to the built-in defaults untouched.
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
