import {
  resolveEstateWebLocation,
  resolveEstateWebLocationFromSources,
  resolveEstateWebLocationId,
  resolveEstateWebLocationIdFromSources,
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

  it('resolves Latin raw_location aliases used by English Crete listings', () => {
    expect(
      resolveEstateWebLocationIdFromSources({
        rawLocation: 'Malia',
        title: 'Buildable land',
      }),
    ).toBe(113312);
    expect(
      resolveEstateWebLocationIdFromSources({
        rawLocation: 'Stalis',
      }),
    ).toBe(113314);
    expect(
      resolveEstateWebLocationIdFromSources({
        rawLocation: 'Plaka',
        title: 'Luxury villa Spinalonga',
      }),
    ).toBe(100055);
    expect(
      resolveEstateWebLocationIdFromSources({
        rawLocation: 'Epano Sissi',
      }),
    ).toBe(100185);
  });

  it('scopes a nationwide-homonym district to the correct region via googleMunicipality', () => {
    // Regression for user_properties.id = 69912719-e055-4102-b68a-614f5b1143e2:
    // 11 unrelated "Αγία Σοφία" nodes exist nationwide. Without a scoping hint,
    // "Νέο Ψυχικό" (not an exact/aliased catalog city label) fails to scope the
    // district match, and the resolver falls back to picking whichever same-named
    // node happens to sit deepest in the catalog tree -- Thessaloniki's (114915),
    // not the correct Athens one (101123). The googleMunicipality hint (from
    // reverse-geocoding this property's real coordinates) fixes that.
    const withoutHint = resolveEstateWebLocationFromSources({
      city: 'Νέο Ψυχικό',
      district: 'Αγία Σοφία',
    });
    expect(withoutHint?.id).toBe(114915);

    const withHint = resolveEstateWebLocationFromSources({
      city: 'Νέο Ψυχικό',
      district: 'Αγία Σοφία',
      googleMunicipality: 'Δήμος Φιλοθέης-Ψυχικού',
    });
    expect(withHint).toEqual(
      expect.objectContaining({
        id: 101123,
        name: 'Αγία Σοφία',
        path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Φιλοθέης-Ψυχικού » Αγία Σοφία',
      }),
    );
  });
});
