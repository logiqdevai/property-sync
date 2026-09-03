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

  it('resolves a municipality named only in the nominative to its genitive-cased catalog node', () => {
    // Regression for user_properties.id = e02c44ec-6412-4459-99dc-775d483883a4 (root cause #9):
    // city "Χανιά" / district "Αποκορώνας" resolved to Χανιά *town* (113671, under Δήμος
    // Χανίων) instead of the correct Δήμος Αποκορώνου (40300) -- a different, adjacent
    // municipality. The catalog only has "Δήμος Αποκορώνου" (genitive, no bare entry), and
    // "Αποκορώνας" is an irregular alternate lemma of that name unreachable via regular
    // declension, so an explicit alias is required even with the bare-municipality-name
    // indexing and -ος/-ου genitive guessing added alongside this fix.
    const loc = resolveEstateWebLocationFromSources({
      city: 'Χανιά',
      district: 'Αποκορώνας',
    });
    expect(loc).toEqual(
      expect.objectContaining({
        id: 40300,
        name: 'Δήμος Αποκορώνου',
        path: 'Κρήτη » Χανιά » Δήμος Αποκορώνου',
      }),
    );
  });

  it('resolves a bare (no "Δήμος" prefix) genitive municipality name via a Google hint', () => {
    // General case behind root cause #9: Google reverse-geocoding returns the municipality
    // in the plain nominative ("Αποκόρωνος"), which must reach the catalog's genitive-cased
    // "Δήμος Αποκορώνου" node via guessGreekGenitive + the bare-municipality-name index, with
    // no curated alias needed since -ος/-ου is a regular declension pattern.
    expect(
      resolveEstateWebLocation(null, 'Αποκόρωνος'),
    ).toEqual(
      expect.objectContaining({ id: 40300, name: 'Δήμος Αποκορώνου' }),
    );
    expect(resolveEstateWebLocation(null, 'Αποκορώνου')).toEqual(
      expect.objectContaining({ id: 40300, name: 'Δήμος Αποκορώνου' }),
    );
  });

  it('does not coarsen an already-specific village match down to its parent municipality', () => {
    // Guard for the bare-municipality-name indexing added alongside root cause #9: once
    // district "Αποκορώνας" can resolve to the municipality "Δήμος Αποκορώνου" itself, a
    // property whose city already names one of that municipality's own villages (e.g.
    // "Κεφαλάς", "Βάμος" -- both real production rows that were already correct) must keep
    // resolving to that specific village, not regress to the broader municipality node.
    expect(
      resolveEstateWebLocationFromSources({ city: 'Κεφαλάς', district: 'Αποκορώνας' }),
    ).toEqual(expect.objectContaining({ id: 105545, name: 'Κεφαλάς' }));
    expect(
      resolveEstateWebLocationFromSources({ city: 'Βάμος', district: 'Αποκορώνας' }),
    ).toEqual(expect.objectContaining({ id: 105544, name: 'Βάμος' }));
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
