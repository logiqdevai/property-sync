export const CAPTCHA_BASE_URL = 'https://api.2captcha.com';
export const CAPTCHA_REQUEST_TIMEOUT_MS = 30_000;
/** 2captcha asks for >= 5s between getTaskResult polls. */
export const CAPTCHA_POLL_INTERVAL_MS = 5_000;
/**
 * Tokens usually take 10-30s, but hCaptcha tasks that need a second worker
 * attempt take 3+ minutes (task 84186986352 finished at 183s, billed, after a
 * 180s limit had already given up on it). Token lifetime starts at solve time.
 */
export const CAPTCHA_SOLVE_TIMEOUT_MS = 300_000;
/** Total submissions per solve (1 + resubmits after ERROR_CAPTCHA_UNSOLVABLE etc.). */
export const CAPTCHA_MAX_SOLVE_ATTEMPTS = 2;

export const CAPTCHA_API_PATHS = {
  createTask: '/createTask',
  getTaskResult: '/getTaskResult',
  getBalance: '/getBalance',
  reportCorrect: '/reportCorrect',
  reportIncorrect: '/reportIncorrect',
} as const;

/** Error codes worth resubmitting the task for (see 2captcha error-codes page). */
export const CAPTCHA_RETRYABLE_ERROR_CODES = new Set([
  'ERROR_NO_SLOT_AVAILABLE',
  'ERROR_CAPTCHA_UNSOLVABLE',
  'ERROR_BAD_DUPLICATES',
]);

/** Logged per solve when 2captcha's response carries no `cost` (observed ~$0.003 for hCaptcha). */
export const DEFAULT_CAPTCHA_SOLVE_COST_USD = 0.003;
