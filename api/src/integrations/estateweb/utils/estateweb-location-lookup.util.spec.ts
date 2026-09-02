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
      googleAddressSegments: ['Δήμος Φιλοθέης-Ψυχικού'],
    });
    expect(withHint).toEqual(
      expect.objectContaining({
        id: 101123,
        name: 'Αγία Σοφία',
        path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Φιλοθέης-Ψυχικού » Αγία Σοφία',
      }),
    );
  });

  it('scopes via a bare prefecture-level Google segment with no "Δήμος" wording', () => {
    // Google essentially never spells the municipality out with a "Δήμος " prefix
    // outside Attica -- for Thessaloniki/Crete addresses it returns bare names like
    // "Θεσσαλονίκη" (administrative_area_level_3) with no "Δήμος" anywhere. That name
    // still matches the catalog's prefecture path segment directly, so it must still
    // work as a scoping hint even though it's not a literal municipality string.
    const loc = resolveEstateWebLocationFromSources({
      district: 'Καλαμαριά, Αρετσού',
      googleAddressSegments: ['Θεσσαλονίκη', 'Καλαμαριά'],
    });
    expect(loc).toEqual(
      expect.objectContaining({
        id: 103986,
        name: 'Αρετσού',
        path: 'Μακεδονία » Θεσσαλονίκη » Δήμος Καλαμαριάς » Αρετσού',
      }),
    );
  });

  it('scopes a "Neighborhood (Street A - Street B)" district by the Google hint', () => {
    // resolveParentheticalDistrict's `related` path needs a real inner-label catalog
    // match, which a street-range parenthetical (not a "Village (Municipality)" pair)
    // never has -- it must fall through to the outer-label scopedOuter lookup, which
    // previously dropped preferredPathSegments entirely. That silently re-opened the
    // same "deepest/lowest-id node nationwide wins" landmine even with a good hint:
    // "Άγιος Νικόλαος" alone matched 51 nationwide, including Thessaloniki's deeper
    // node (114954), while Athens' own (113253) sat one level shallower.
    const withoutHint = resolveEstateWebLocationFromSources({
      city: 'Άγιος Νικόλαος',
      district: 'Άγιος Νικόλαος (Λεωφόρος Πατησίων - Λεωφόρος Αχαρνών)',
    });
    expect(withoutHint?.id).toBe(114954);

    const withHint = resolveEstateWebLocationFromSources({
      city: 'Άγιος Νικόλαος',
      district: 'Άγιος Νικόλαος (Λεωφόρος Πατησίων - Λεωφόρος Αχαρνών)',
      googleAddressSegments: ['Στερεά Ελλάδα', 'Αθήνα', 'Δήμος Αθηναίων'],
    });
    expect(withHint).toEqual(
      expect.objectContaining({
        id: 113253,
        name: 'Άγιος Νικόλαος',
        path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Αθηναίων » Άγιος Νικόλαος',
      }),
    );
  });

  it('does not blindly default to Crete when no hint segment has an is_city anchor', () => {
    // Regression for user_properties.id = cb630743-30b6-4c49-a14b-45e1a4fdec7d: city
    // "Σύρος" has no exact/aliased catalog node (only "Άνω Σύρος" etc. exist), and none
    // of Syros's real catalog nodes are flagged `is_city`. The old last-resort fallback
    // unconditionally returned the single island-level "Κρήτη" node (id 4) whenever no
    // hint segment matched an `is_city` node -- ~300km from the actual property, on a
    // different island entirely. It must instead pick the most specific catalog node
    // actually named by one of the Google hint segments.
    const loc = resolveEstateWebLocationFromSources({
      city: 'Σύρος',
      googleAddressSegments: [
        'Περιφέρεια Νοτίου Αιγαίου',
        'Σύρος',
        'Άνω Σύρος',
        'Ερμούπολη',
      ],
    });
    expect(loc?.id).not.toBe(4);
    expect(loc).toEqual(
      expect.objectContaining({
        id: 107399,
        name: 'Άνω Σύρος',
        path: 'Νησιά Αιγαίου » Κυκλάδες » Δήμος Σύρου-Ερμουπόλεως » Άνω Σύρος',
      }),
    );
  });

  it('still resolves via city/district alone when Google returns no usable segments', () => {
    // A property whose district is a globally unique catalog name must not be left
    // unresolved just because Google's response (or its absence) yielded an empty
    // hint array -- the resolver's own fallback must still run.
    expect(
      resolveEstateWebLocationFromSources({
        district: 'Αρετσού',
        googleAddressSegments: [],
      })?.id,
    ).toBe(103986);
  });
});
