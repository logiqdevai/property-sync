// Error messages from libraries (Playwright's connectOverCDP, fetch, pg, ...) echo
// the full URL they were given, credentials included -- e.g. the Bright Data
// `wss://brd-customer-...:<password>@brd.superproxy.io:9222` endpoint. Anything that
// persists or logs an error message must pass it through here first.

const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const SECRET_QUERY_PARAM =
  /([?&;\s](?:password|passwd|pwd|token|access_token|api[_-]?key|apikey|secret|auth|key)=)[^\s&"']+/gi;
const BEARER_TOKEN = /(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/g;

export function redactSecrets(text: string): string;
export function redactSecrets(text: string | null | undefined): string | null;
export function redactSecrets(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text
    .replace(URL_USERINFO, '$1***:***@')
    .replace(SECRET_QUERY_PARAM, '$1***')
    .replace(BEARER_TOKEN, '$1***');
}

// Same message, redacted, with the original error's type/stack preserved so callers
// can rethrow without leaking credentials to whatever catches it next.
export function redactError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(redactSecrets(String(error)));
  const redacted = new Error(redactSecrets(error.message));
  redacted.name = error.name;
  if (error.stack) redacted.stack = redactSecrets(error.stack);
  return redacted;
}
