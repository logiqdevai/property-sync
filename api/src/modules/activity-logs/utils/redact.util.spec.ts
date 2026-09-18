import { MAX_STRING_LENGTH } from '../constants/activity-log.constants';
import { REDACTED, isSensitiveKey, sanitizeForLog } from './redact.util';

describe('sanitizeForLog', () => {
  it('redacts sensitive keys at any depth, including arrays', () => {
    const result = sanitizeForLog({
      email: 'a@b.com',
      password: 'hunter2',
      nested: { api_key_secret: 'k', access_token: 't', keep: 1 },
      list: [{ webhook_key: 'w', name: 'x' }],
      headers: { Authorization: 'Bearer abc' },
    }) as any;

    expect(result.email).toBe('a@b.com');
    expect(result.password).toBe(REDACTED);
    expect(result.nested).toEqual({
      api_key_secret: REDACTED,
      access_token: REDACTED,
      keep: 1,
    });
    expect(result.list[0]).toEqual({ webhook_key: REDACTED, name: 'x' });
    expect(result.headers.Authorization).toBe(REDACTED);
    expect(JSON.stringify(result)).not.toMatch(/hunter2|Bearer abc/);
  });

  it('redacts extra keys case-insensitively', () => {
    const result = sanitizeForLog(
      { Config: { a: 1 }, other: 2 },
      { extraSensitiveKeys: ['config'] },
    ) as any;
    expect(result).toEqual({ Config: REDACTED, other: 2 });
  });

  it('truncates long strings with a marker', () => {
    const result = sanitizeForLog({ text: 'x'.repeat(MAX_STRING_LENGTH + 50) }) as any;
    expect(result.text.startsWith('x'.repeat(MAX_STRING_LENGTH))).toBe(true);
    expect(result.text).toContain('[truncated 50 chars]');
  });

  it('serializes Dates, BigInts, Buffers and toJSON objects', () => {
    const result = sanitizeForLog({
      d: new Date('2026-01-02T03:04:05.000Z'),
      big: BigInt(10),
      buf: Buffer.from('abc'),
      dec: { toJSON: () => '12.50' },
    }) as any;
    expect(result).toEqual({
      d: '2026-01-02T03:04:05.000Z',
      big: '10',
      buf: '[binary 3 bytes]',
      dec: '12.50',
    });
  });

  it('survives circular references without throwing', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(sanitizeForLog(a)).toEqual({ name: 'a', self: '[circular]' });
  });

  it('replaces oversized documents with a preview', () => {
    const big = { rows: Array.from({ length: 40 }, (_, i) => `${i}`.repeat(9_000)) };
    const result = sanitizeForLog(big) as any;
    expect(result._truncated).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(MAX_STRING_LENGTH);
  });

  it('maps null/undefined to null and passes primitives through', () => {
    expect(sanitizeForLog(undefined)).toBeNull();
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(5)).toBe(5);
    expect(sanitizeForLog(false)).toBe(false);
  });
});

describe('isSensitiveKey', () => {
  it.each([
    'password',
    'current_password',
    'new_password',
    'token',
    'access_token',
    'api_key_secret',
    'apiKey',
    'webhook_key',
    'Authorization',
    'set-cookie',
    'session_data',
  ])('flags %s', (key) => expect(isSensitiveKey(key)).toBe(true));

  it.each(['email', 'title', 'price', 'user_id', 'status'])(
    'does not flag %s',
    (key) => expect(isSensitiveKey(key)).toBe(false),
  );
});
