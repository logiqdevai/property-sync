import {
  buildEstateWebOwnershipCodes,
  buildEstateWebReconcileCodes,
  resolveEstateWebCode,
} from './estateweb-property-code.util';

describe('estateweb-property-code.util', () => {
  describe('resolveEstateWebCode', () => {
    it('strips whitespace and leading punctuation', () => {
      expect(resolveEstateWebCode('AP 419', null)).toBe('AP419');
      expect(resolveEstateWebCode('#1987', null)).toBe('1987');
    });

    it('falls back to property_id when internal_id is missing or unusable', () => {
      expect(resolveEstateWebCode(null, 'abc-123')).toBe('abc-123');
      expect(resolveEstateWebCode('###', 'abc-123')).toBe('abc-123');
    });

    it('returns an empty string when nothing is usable', () => {
      expect(resolveEstateWebCode(null, undefined)).toBe('');
      expect(resolveEstateWebCode('  ', '!!')).toBe('');
    });
  });

  describe('buildEstateWebReconcileCodes', () => {
    it('puts the pushed (sanitized) code first, then the raw internal_id', () => {
      expect(buildEstateWebReconcileCodes('AP 419', 'x1')).toEqual([
        'ap419',
        'ap 419',
      ]);
    });

    it('uses property_id when internal_id is missing (what would be pushed)', () => {
      expect(buildEstateWebReconcileCodes(null, 'Abc-123')).toEqual([
        'abc-123',
      ]);
    });

    it('does not duplicate identical codes', () => {
      expect(buildEstateWebReconcileCodes('ABC1', 'zzz')).toEqual(['abc1']);
    });

    it('is empty when there is no code at all', () => {
      expect(buildEstateWebReconcileCodes(null, null)).toEqual([]);
    });
  });

  describe('buildEstateWebOwnershipCodes', () => {
    it('includes raw internal_id, raw property_id and the pushed code', () => {
      expect(buildEstateWebOwnershipCodes('AP 419', 'X-1')).toEqual([
        'ap 419',
        'x-1',
        'ap419',
      ]);
    });

    it('is empty when there is no code at all', () => {
      expect(buildEstateWebOwnershipCodes(null, undefined)).toEqual([]);
    });
  });
});
