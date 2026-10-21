import type { Page } from 'playwright';

export type BlockSignal = 'blocked' | 'challenge';

/**
 * Tries to get past a captcha wall on `page` (solve + inject). Resolves true when the page left the
 * challenge. Never throws; resolves false when there is nothing solvable on the page.
 */
export type CaptchaSolveHook = (page: Page) => Promise<boolean>;

export type BlockRuleSource =
  | 'title'
  | 'text'
  | 'html'
  | 'path'
  | 'script_content'
  | 'selector';

export interface BlockRule {
  id?: string;
  signal: BlockSignal;
  source: BlockRuleSource;
  pattern: string;
  regex?: boolean;
  flags?: string;
}

export interface BlockHandlingConfig {
  version: 1;
  rules?: BlockRule[];
  wait_timeout_ms?: number;
  min_ready_body_length?: number;
  /**
   * Runtime-only (never persisted): set per crawl when the scraper has `use_captcha_solver`.
   * waitForBotChallengeClearance calls it when the page is still blocked/challenged after waiting.
   */
  captcha_solver?: CaptchaSolveHook;
}
