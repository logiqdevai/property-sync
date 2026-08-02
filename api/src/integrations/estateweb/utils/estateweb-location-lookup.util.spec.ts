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
});
