import { redactError, redactSecrets } from './redact-secrets.util';

describe('redactSecrets', () => {
  it('strips credentials from a URL, keeping scheme and host', () => {
    const message =
      'browserType.connectOverCDP: WebSocket error: wss://brd-customer-hl_abc-zone-x:s3cr3tpw@brd.superproxy.io:9222/ 403 Auth Failed';
    const out = redactSecrets(message);
    expect(out).toBe(
      'browserType.connectOverCDP: WebSocket error: wss://***:***@brd.superproxy.io:9222/ 403 Auth Failed',
    );
    expect(out).not.toContain('s3cr3tpw');
    expect(out).not.toContain('brd-customer');
  });

  it('redacts every occurrence, including the Playwright call log line', () => {
    const message =
      'x wss://u:pw1@h.io:9222/\nCall log:\n  - <ws connecting> wss://u:pw1@h.io:9222/';
    expect(redactSecrets(message)).not.toContain('pw1');
  });

  it('redacts secret query params and bearer tokens', () => {
    expect(redactSecrets('GET https://a.com/x?api_key=abc123&page=2')).toBe(
      'GET https://a.com/x?api_key=***&page=2',
    );
    expect(redactSecrets('Authorization: Bearer abcdefghijkl123')).toBe(
      'Authorization: Bearer ***',
    );
  });

  it('leaves ordinary messages and URLs untouched', () => {
    const message =
      'HTTP 403 on https://openhousechania.com/our-listings/ (challenge)';
    expect(redactSecrets(message)).toBe(message);
  });

  it('passes null/undefined through as null', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeNull();
  });
});

describe('redactError', () => {
  it('redacts message and stack and keeps the error name', () => {
    const original = new TypeError('failed wss://u:pw@h.io/');
    original.stack = 'TypeError: failed wss://u:pw@h.io/\n    at x';
    const out = redactError(original);
    expect(out.name).toBe('TypeError');
    expect(out.message).toBe('failed wss://***:***@h.io/');
    expect(out.stack).not.toContain('pw@');
  });

  it('wraps non-Error values', () => {
    expect(redactError('oops wss://u:pw@h.io/').message).toBe(
      'oops wss://***:***@h.io/',
    );
  });
});
