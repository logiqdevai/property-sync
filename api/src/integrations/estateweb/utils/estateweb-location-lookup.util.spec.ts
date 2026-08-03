import {
  resolveEstateWebLocation,
  resolveEstateWebLocationId,
} from './estateweb-location-lookup.util';

describe('resolveEstateWebLocation', () => {
  it('resolves parenthetical district Locality (Municipality) via sibling under shared parent', () => {
    const loc = resolveEstateWebLocation(
      null,
      'Άγιος Κωνσταντίνος (Νικηφόρος Φωκάς)',
    );
    expect(loc).toEqual(
      expect.objectContaining({
        id: 105456,
        name: 'Άγιος Κωνσταντίνος',
        path: 'Κρήτη » Ρέθυμνο » Δήμος Ρεθύμνης » Άγιος Κωνσταντίνος',
      }),
    );
    expect(
      resolveEstateWebLocationId(
        null,
        'Άγιος Κωνσταντίνος (Νικηφόρος Φωκάς)',
      ),
    ).toBe(105456);
  });

  it('prefers exact catalog name with parentheses when present', () => {
    const loc = resolveEstateWebLocation(
      null,
      'Άγιος Κωνσταντίνος (Άμφισσα)',
    );
    expect(loc).toEqual(
      expect.objectContaining({
        id: 112934,
        name: 'Άγιος Κωνσταντίνος (Άμφισσα)',
      }),
    );
  });

  it('falls back to parenthetical municipality when locality has no related node', () => {
    const loc = resolveEstateWebLocation(
      null,
      'Unknown Locality (Νικηφόρος Φωκάς)',
    );
    expect(loc).toEqual(
      expect.objectContaining({
        id: 105470,
        name: 'Νικηφόρος Φωκάς',
      }),
    );
  });

  it('resolves unique district even when city is an unknown marketing region', () => {
    expect(resolveEstateWebLocationId('Νότια Κρήτη', 'Τριόπετρα')).toBe(
      100442,
    );
    expect(
      resolveEstateWebLocation('Νότια Κρήτη', 'Τριόπετρα'),
    ).toEqual(
      expect.objectContaining({
        id: 100442,
        name: 'Τριόπετρα',
        path: 'Κρήτη » Ρέθυμνο » Δήμος Αγίου Βασιλείου » Τριόπετρα',
      }),
    );
  });

  it('resolves Τριόπετρα (Λάμπη) parenthetical from Περιοχή-style district', () => {
    expect(resolveEstateWebLocationId(null, 'Τριόπετρα (Λάμπη)')).toBe(100442);
  });
});
