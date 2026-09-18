import { ActivityChangeOperation } from 'generated/prisma';
import { computeChanges, inferOperation } from './diff.util';

describe('computeChanges', () => {
  it('reports changed scalar fields and ignores updated_at', () => {
    const changes = computeChanges(
      { id: '1', title: 'Old', price: 100, updated_at: new Date(1) },
      { id: '1', title: 'New', price: 100, updated_at: new Date(2) },
    );
    expect(changes).toEqual([{ path: 'title', from: 'Old', to: 'New' }]);
  });

  it('diffs nested objects by dotted path', () => {
    const changes = computeChanges(
      { meta: { a: 1, b: { c: 2 } } },
      { meta: { a: 1, b: { c: 3 } } },
    );
    expect(changes).toEqual([{ path: 'meta.b.c', from: 2, to: 3 }]);
  });

  it('compares arrays as whole values', () => {
    const changes = computeChanges({ tags: ['a', 'b'] }, { tags: ['a', 'b', 'c'] });
    expect(changes).toEqual([
      { path: 'tags', from: ['a', 'b'], to: ['a', 'b', 'c'] },
    ]);
    expect(computeChanges({ tags: ['a'] }, { tags: ['a'] })).toEqual([]);
  });

  it('treats key order as irrelevant and null as equal to missing', () => {
    expect(computeChanges({ a: 1, b: null }, { b: undefined, a: 1 })).toEqual([]);
  });

  it('normalizes Dates and Decimal-like values before comparing', () => {
    const decimal = (v: string) => ({ toJSON: () => v });
    expect(
      computeChanges(
        { at: new Date('2026-01-01T00:00:00.000Z'), price: decimal('10.5') },
        { at: '2026-01-01T00:00:00.000Z', price: '10.5' },
      ),
    ).toEqual([]);
  });

  it('emits a redacted marker without values for sensitive keys', () => {
    const changes = computeChanges(
      { password: 'old-secret', name: 'a' },
      { password: 'new-secret', name: 'a' },
    );
    expect(changes).toEqual([{ path: 'password', redacted: true }]);
    expect(JSON.stringify(changes)).not.toMatch(/secret/);
  });

  it('does not emit a redacted marker when the sensitive value is unchanged', () => {
    expect(computeChanges({ token: 'x' }, { token: 'x' })).toEqual([]);
  });

  it('lists every populated field on create and delete', () => {
    expect(computeChanges(null, { a: 1, b: null })).toEqual([
      { path: 'a', from: null, to: 1 },
    ]);
    expect(computeChanges({ a: 1 }, null)).toEqual([
      { path: 'a', from: 1, to: null },
    ]);
  });
});

describe('inferOperation', () => {
  it('infers CREATE, DELETE, UPDATE and ACTION', () => {
    const change = [{ path: 'a', from: 1, to: 2 }];
    expect(inferOperation(null, { id: 1 }, change)).toBe(ActivityChangeOperation.CREATE);
    expect(inferOperation({ id: 1 }, null, change)).toBe(ActivityChangeOperation.DELETE);
    expect(inferOperation({ id: 1 }, { id: 1 }, change)).toBe(ActivityChangeOperation.UPDATE);
    expect(inferOperation({ id: 1 }, { id: 1 }, [])).toBe(ActivityChangeOperation.ACTION);
  });
});
