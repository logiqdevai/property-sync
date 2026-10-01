import {
  extractInternalIdFromSpecs,
  extractInternalIdFromText,
  extractSourcePropertyIds,
} from './crawler.utils';

describe('extractInternalIdFromSpecs', () => {
  it('reads a numeric-category-prefixed code from a "Κωδικός" specs row', () => {
    expect(extractInternalIdFromSpecs({ Κωδικός: '4-2569' })).toBe('4-2569');
  });

  it('reads the abbreviated "Κωδ." label', () => {
    expect(extractInternalIdFromSpecs({ 'Κωδ.': 'GE3618 S' })).toBe('GE3618 S');
  });

  it('reads "Κωδικός Ακινήτου"', () => {
    expect(
      extractInternalIdFromSpecs({ 'Κωδικός Ακινήτου': 'PI-2901' }),
    ).toBe('PI-2901');
  });

  it('reads "Code"/"Reference"/"Property ID" labels', () => {
    expect(extractInternalIdFromSpecs({ Code: 'AB123' })).toBe('AB123');
    expect(extractInternalIdFromSpecs({ Reference: 'REF-9' })).toBe('REF-9');
    expect(extractInternalIdFromSpecs({ 'Property ID': '4308' })).toBe(
      '4308',
    );
  });

  it('ignores unrelated spec rows', () => {
    expect(
      extractInternalIdFromSpecs({ Εμβαδόν: '115 τ.μ', Όροφος: 'Ισόγειο' }),
    ).toBeNull();
  });

  it('is null when there are no specs', () => {
    expect(extractInternalIdFromSpecs(null)).toBeNull();
  });
});

describe('extractInternalIdFromText (unchanged free-text behaviour)', () => {
  it('still matches a labeled code in prose', () => {
    expect(extractInternalIdFromText('Κωδικός: AP 419, τιμή 100000€')).toBe(
      'AP419',
    );
  });

  it('returns null when nothing matches', () => {
    expect(extractInternalIdFromText('Πωλείται διαμέρισμα στο κέντρο')).toBeNull();
  });
});

describe('extractSourcePropertyIds', () => {
  it('prefers a specs-table code over the URL slug, keeping its category prefix (regression: docs/CLIENT-ISSUES-2026-10-01.md #4)', () => {
    const result = extractSourcePropertyIds(
      'https://www.bitsimis-real-homes.gr/property/2569/',
      {
        _detail_text: 'Περιγραφή\n\nΠΩΛΕΙΤΑΙ ΚΑΤΑΣΤΗΜΑ 115τμ...',
        _detail_specs: { Κωδικός: '4-2569' },
      },
    );

    expect(result).toEqual({ property_id: '2569', internal_id: '4-2569' });
  });

  it('falls back to the free-text code when there is no specs table', () => {
    const result = extractSourcePropertyIds(
      'https://example.gr/listing/some-slug',
      { _detail_text: 'Κωδικός: PI 29423. Διαμέρισμα 80τμ.' },
    );

    // A non-numeric URL slug ("some-slug") is overridden by the page code for
    // both fields (pre-existing behaviour -- see the WordPress/JetEngine note
    // in extractSourcePropertyIds).
    expect(result).toEqual({ property_id: 'PI29423', internal_id: 'PI29423' });
  });

  it('falls back to the URL slug when specs has no code-like label and text has none either', () => {
    const result = extractSourcePropertyIds('https://example.gr/property/555', {
      _detail_specs: { Εμβαδόν: '80 τ.μ' },
    });

    expect(result).toEqual({ property_id: '555', internal_id: '555' });
  });

  it('still prefers an explicit raw internal_id field over the specs table', () => {
    const result = extractSourcePropertyIds('https://example.gr/property/1', {
      _internal_id: 'OVERRIDE-1',
      _detail_specs: { Κωδικός: '4-2569' },
    });

    expect(result).toEqual({ property_id: '1', internal_id: 'OVERRIDE-1' });
  });
});
