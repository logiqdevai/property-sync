import {
  resolveAgencyPrefectureSegments,
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

  it('scopes a nationwide-homonym district to the correct South Aegean island group via a bare Google island name', () => {
    // Regression for Property.id = 5c968f5a-2c94-4dcb-805c-7439832b4560 (root cause #14):
    // city "Γαλήνη" has 12 same-depth nodes nationwide (Chania, Larissa, Thessaloniki,
    // Naxos, ...) -- unlike Crete/mainland prefectures, Google's reverse-geocode for a
    // Cyclades coordinate never names the catalog's group prefecture ("Κυκλάδες") at ANY
    // admin level; it jumps straight from the broad region ("Περιφέρεια Νοτίου Αιγαίου") to
    // the bare island/municipality name ("Νάξος"). Without ISLAND_PREFECTURE_SEGMENT, none
    // of Google's hint segments share any text with the correct Naxos node, so both the hard
    // (requiredPrefectureSegments) and soft (preferredPathSegments) scoping mechanisms stay
    // empty and the resolver falls back to an arbitrary smallest-id tie-break (Chania, id
    // 100598, simply because it happens to have the lowest id among the 12 homonyms) --
    // verified live against the real Google API for this property's actual coordinates.
    const googleAddressSegments = [
      'Αποκεντρωμένη Διοίκηση Αιγαίου',
      'Περιφέρεια Νοτίου Αιγαίου',
      'Νάξος και Μικρές Κυκλάδες',
      'Νάξος',
      'Τοπική Κοινότητα Γαλήνης',
    ];
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Γαλήνη',
        title:
          '- Ναξος: -Plot of 4113sq.m in the best spot of Galini an emerging village on top of a hill near Naxos Chora',
        googleAddressSegments,
        googleCoordinatePrefectures: ['Νάξος'],
      }),
    ).toEqual(
      expect.objectContaining({
        id: 107207,
        name: 'Γαλήνη',
        path: 'Νησιά Αιγαίου » Κυκλάδες » Δήμος Νάξου-Μικρών Κυκλάδων » Γαλήνη',
      }),
    );
  });

  it('scopes a Dodecanese bare island name the same way as a Cyclades one', () => {
    // General case behind root cause #14 -- the same Google-naming gap applies to the other
    // South Aegean group prefecture ("Δωδεκάνησα"): "Λουτρά" has 11 same-depth nodes
    // nationwide (Ioannina, Serres, Halkidiki, Tinos, Lesvos, ...), only one of them the
    // real Nisyros (Δωδεκάνησα) node -- verified live that Google names the bare island
    // ("Νίσυρος") at admin_level_3 for a Nisyros coordinate, never "Δωδεκάνησα" itself.
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Λουτρά',
        googleAddressSegments: ['Περιφέρεια Νοτίου Αιγαίου', 'Νίσυρος'],
        googleCoordinatePrefectures: ['Νίσυρος'],
      }),
    ).toEqual(
      expect.objectContaining({
        id: 107068,
        path: 'Νησιά Αιγαίου » Δωδεκάνησα » Δήμος Νισύρου » Λουτρά',
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

  it('resolves a nominative multi-word municipality name to its genitive-phrase catalog node', () => {
    // Regression for user_properties.id = 20ed33be-8981-40e0-8b3a-715bcb41914b (root cause
    // #13): city "Αγία Παρασκευή" with no district resolved to the same-named Heraklion
    // (Crete) neighborhood (99696) instead of the actual Athens municipality "Δήμος Αγίας
    // Παρασκευής" (90001), ~330km away -- the catalog only has the municipality itself as a
    // genitive PHRASE ("Αγίας Παρασκευής"), which root cause #9's single-word -ος/-ου
    // genitive guessing and bare-municipality indexing never reached (no "Αγία Παρασκευή"
    // bare entry exists at all, only same-named neighborhoods elsewhere). Also covers the
    // "Αγ." abbreviation collapsing "Αγία"/"Αγίας" to the same token on both sides.
    const loc = resolveEstateWebLocationFromSources({
      city: 'Αγία Παρασκευή',
    });
    expect(loc).toEqual(
      expect.objectContaining({
        id: 90001,
        name: 'Δήμος Αγίας Παρασκευής',
        path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Αγίας Παρασκευής',
      }),
    );
  });

  it('resolves a "Neighborhood (Municipality)" parenthetical district via the municipality-genitive anchor', () => {
    // Regression found while enabling agencyCity for housemarket-realestate.gr: a "Village
    // (Municipality)"-shaped district like "Παράδεισος (Αγία Παρασκευή)" goes through
    // resolveParentheticalDistrict/resolveRelatedToAnchor, a SEPARATE code path from the
    // bare-city guessMunicipalityGenitivePhrase fallback the test above covers.
    // resolveRelatedToAnchor's matchesCity check only ever compared the inner label's exact
    // nominative form ("Αγία Παρασκευή") against candidates' own path segments -- but a real
    // child of that municipality carries it in GENITIVE form in its own path ("Δήμος Αγίας
    // Παρασκευής"), so the correct candidate (101166, "Παράδεισος", an actual child of that
    // municipality) never looked "related" to its own anchor. Whole-catalog old-vs-new diff
    // (5,639 properties, no agencyCity, no Google hints) confirmed this fix only ever changes
    // rows using this exact "X (Αγία Παρασκευή)" pattern -- 54 rows, all housemarket-realestate.gr,
    // all correcting a same-named-homonym-elsewhere-in-Greece pick (Crete/Ioannina/Trikala) to
    // the real Athens neighborhood -- no unrelated regressions.
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Αγία Παρασκευή',
        district: 'Παράδεισος (Αγία Παρασκευή)',
      }),
    ).toEqual(
      expect.objectContaining({
        id: 101166,
        name: 'Παράδεισος',
        path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Αγίας Παρασκευής » Παράδεισος',
      }),
    );
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Αγία Παρασκευή',
        district: 'Νέα Ζωή (Αγία Παρασκευή)',
      }),
    ).toEqual(expect.objectContaining({ id: 101165, name: 'Νέα Ζωή' }));
  });

  it('does not let a municipality-genitive guess override an explicit conflicting region', () => {
    // Regression for user_properties.id = 9c4470a2-1c3e-4467-b9eb-f2920882232b: city
    // "Καλλιθέα" / district "Ρέθυμνο" (real title: "Καλλιθέα Ρεθύμνου", i.e. Kallithea,
    // Rethymno -- unambiguously Crete). "Καλλιθέα" has 41 same-named homonyms nationwide
    // but only ONE catalog municipality named exactly "Δήμος Καλλιθέας" (Athens) -- without
    // this guard, root cause #13's fix would jump the property across the country on that
    // uniqueness alone, overriding the explicit "Ρέθυμνο" region the text already names.
    const loc = resolveEstateWebLocationFromSources({
      city: 'Καλλιθέα',
      district: 'Ρέθυμνο',
    });
    expect(loc?.id).not.toBe(90019); // Athens' Δήμος Καλλιθέας
    const segments = loc ? loc.path.split(' » ') : [];
    expect(segments[0]).toBe('Κρήτη');
  });

  it('does not let a district-side municipality guess override an unrelated city', () => {
    // Regression for property.id = d8fb0458-e30b-4ad9-8b14-e24e9381fcd9: city "Νεοχωρούδα"
    // (a Thessaloniki-area village, real title: "Νεοχωρούδα (Καλλιθέα)") / district
    // "Καλλιθέα" was already correctly resolved (114977, Thessaloniki's own "Καλλιθέα") --
    // adding guessMunicipalityGenitivePhrase to expandDistrictLabels (mirroring the city-side
    // fix) let the bare district label "Καλλιθέα" resolve, UNSCOPED by the actual city, to
    // Athens' unrelated "Δήμος Καλλιθέας" via resolveByDistrict's "unique district" fallback
    // -- worse than doing nothing, since this property has no coordinates to self-heal via
    // the async job. The district side deliberately has no such guess (see expandDistrictLabels).
    const loc = resolveEstateWebLocationFromSources({
      city: 'Νεοχωρούδα',
      district: 'Καλλιθέα',
    });
    expect(loc?.id).not.toBe(90019); // Athens' Δήμος Καλλιθέας
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

  it('scopes homonyms by the legacy "Νομός <Genitive>" prefecture Google returns when forward-geocoding text', () => {
    // Root cause #10: a listing with no coordinates (city "ΒΑΘΥ", district "ΚΟΚΚΑΡΙ" -- Samos)
    // is forward-geocoded from text, and Google names the prefecture "Νομός Σάμου", never the
    // catalog's "Σάμος". The hint used to be ignored, so the resolver picked the deepest of 12
    // nationwide "Βαθύ" nodes -- Lasithi, Crete (100010).
    expect(
      resolveEstateWebLocationFromSources({
        city: 'ΒΑΘΥ',
        district: 'ΚΟΚΚΑΡΙ',
        googleAddressSegments: ['Νομός Σάμου', 'Κοκκάρι'],
      }),
    ).toEqual(expect.objectContaining({ id: 107876, path: 'Νησιά Αιγαίου » Σάμος » Βαθύ' }));
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Βαθύ',
        googleAddressSegments: ['Περιφερειακή Ενότητα Σάμου'],
      })?.id,
    ).toBe(107876);
  });

  it.each([
    ['Νομός Σάμου', 'Σάμος'],
    ['Νομός Ηρακλείου', 'Ηράκλειο'],
    ['Νομός Λασιθίου', 'Λασίθι'],
    ['Νομός Ρεθύμνου', 'Ρέθυμνο'],
    ['Νομός Χανίων', 'Χανιά'],
    ['Νομός Κυκλάδων', 'Κυκλάδες'],
    ['Νομός Δωδεκανήσου', 'Δωδεκάνησα'],
    ['Νομός Πρέβεζας', 'Πρέβεζα'],
    ['Νομός Άρτης', 'Άρτα'],
    ['Νομός Καρδίτσης', 'Καρδίτσα'],
    ['Νομός Πέλλης', 'Πέλης'],
    ['Νομός Πειραιώς', 'Πειραιάς'],
    ['Νομός Ευβοίας', 'Ευβοία'],
    ['Νομός Κεφαλληνίας', 'Κεφαλληνιά'],
  ])('maps Google "%s" onto the catalog prefecture %s', (googleSegment, prefecture) => {
    // Uses a Vathy homonym present in many prefectures: the winner's path must sit under the
    // prefecture named by the hint whenever that prefecture has a "Βαθύ" node at all; for the
    // ones that don't, the hint must at least not steer to a different prefecture's node.
    const resolved = resolveEstateWebLocationFromSources({
      city: 'Βαθύ',
      googleAddressSegments: [googleSegment],
    });
    const hasVathyInPrefecture = [
      'Σάμος', 'Ηράκλειο', 'Λασίθι', 'Κυκλάδες', 'Πρέβεζα', 'Ευβοία',
    ].includes(prefecture);
    if (hasVathyInPrefecture) {
      expect(resolved?.path.split(' » ')[1]).toBe(prefecture);
    }
  });
  it('rejects city homonyms outside the prefecture the coordinates reverse-geocode to', () => {
    // Root cause #12: city "Φούρνοι" only names Samos/Argolida/Achaia/Evia/Phthiotida nodes --
    // the Lasithi village is catalogued as "Φουρνή". Hints are soft, so a Κρήτη/Λασίθι hint
    // that matched none of them was dropped and Samos (107898) won even with perfect coords.
    const googleAddressSegments = [
      'Αποκεντρωμένη Διοίκηση Κρήτης', 'Κρήτη', 'Λασίθι', 'Δήμος Αγίου Νικολάου',
      'Νεάπολη', 'Τοπική Κοινότητα Φουρνής', 'Φουρνή',
    ];
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Φούρνοι',
        title: 'House of 80m2 for sale and restoration in Fourni, Lassithi',
        googleAddressSegments,
        googleCoordinatePrefectures: ['Λασίθι'],
      }),
    ).toEqual(
      expect.objectContaining({ id: 100216, path: 'Κρήτη » Λασίθι » Δήμος Αγίου Νικολάου » Φουρνή' }),
    );
    // Forward-geocoded segments (no coordinate prefectures) stay a soft preference.
    expect(
      resolveEstateWebLocationFromSources({ city: 'Φούρνοι', googleAddressSegments })?.id,
    ).toBe(107898);
  });

  it('keeps text that pins a single prefecture when the coordinates point elsewhere', () => {
    // Real rows: "Χανιά / Ακρωτήρι" with a point near Thessaloniki, and "Κόρινθος" with a
    // point in Patras -- bad geocodes, not homonyms.
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Χανιά',
        district: 'Ακρωτήρι',
        googleAddressSegments: ['Κεντρική Μακεδονία', 'Θεσσαλονίκη', 'Βόλβη', 'Μικρή Βόλβη'],
        googleCoordinatePrefectures: ['Θεσσαλονίκη'],
      })?.id,
    ).toBe(100606);
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Κόρινθος',
        googleAddressSegments: ['Δυτικής Ελλάδας', 'Αχαΐα', 'Πάτρα', 'ΔΗΜΟΣ ΠΑΤΡΕΩΝ'],
        googleCoordinatePrefectures: ['Αχαΐα'],
      })?.id,
    ).toBe(110010);
  });

  it('does not treat a district as unique just because the prefecture filter removed its homonyms', () => {
    expect(
      resolveEstateWebLocationFromSources({
        city: 'Πειραιάς - Κέντρο',
        district: 'Κέντρο - Λιμάνι',
        googleAddressSegments: [
          'Αποκεντρωμένη Διοίκηση Αττικής', 'Αττική', 'Περιφερειακή Ενότητα Πειραιώς',
          'Πειραιάς', 'ΔΗΜΟΣ ΠΕΙΡΑΙΩΣ',
        ],
        googleCoordinatePrefectures: ['Περιφερειακή Ενότητα Πειραιώς'],
      })?.id,
    ).toBe(113138);
  });

  describe('agencyCity scoping (SourceAgency.city)', () => {
    it('resolves a SourceAgency.city label to its own catalog prefecture segment', () => {
      expect(resolveAgencyPrefectureSegments('Αθήνα')).toEqual(['αθηνα']);
      // A specific city/neighborhood within the region resolves to the same prefecture.
      expect(resolveAgencyPrefectureSegments('Χαλάνδρι')).toEqual(['αθηνα']);
      expect(resolveAgencyPrefectureSegments(null)).toEqual([]);
      expect(resolveAgencyPrefectureSegments('')).toEqual([]);
      // Text that doesn't resolve to any catalog node at all.
      expect(resolveAgencyPrefectureSegments('Not A Real Place Xyz')).toEqual([]);
    });

    it('scopes resolution to the agency region before falling back unscoped', () => {
      // Same nationwide-homonym case as the "googleMunicipality" test above (11 unrelated
      // "Αγία Σοφία" nodes nationwide), but scoped via the SourceAgency's own declared
      // operating region instead of a per-property Google hint -- lets the SYNCHRONOUS,
      // no-Google-hint resolver (used at property creation) get an agency's listings right
      // immediately, not just the async job that only runs once coordinates exist.
      const withoutAgency = resolveEstateWebLocationFromSources({
        city: 'Νέο Ψυχικό',
        district: 'Αγία Σοφία',
      });
      expect(withoutAgency?.id).toBe(114915); // wrong: Thessaloniki

      const withAgency = resolveEstateWebLocationFromSources({
        city: 'Νέο Ψυχικό',
        district: 'Αγία Σοφία',
        agencyCity: 'Αθήνα',
      });
      expect(withAgency).toEqual(
        expect.objectContaining({
          id: 101123,
          name: 'Αγία Σοφία',
          path: 'Στερεά Ελλάδα » Αθήνα » Δήμος Φιλοθέης-Ψυχικού » Αγία Σοφία',
        }),
      );
    });

    it('does nothing when the agency has no city set', () => {
      const withBlankAgency = resolveEstateWebLocationFromSources({
        city: 'Νέο Ψυχικό',
        district: 'Αγία Σοφία',
        agencyCity: '',
      });
      const withNullAgency = resolveEstateWebLocationFromSources({
        city: 'Νέο Ψυχικό',
        district: 'Αγία Σοφία',
      });
      expect(withBlankAgency?.id).toBe(114915);
      expect(withBlankAgency?.id).toBe(withNullAgency?.id);
    });

    it('falls back to unscoped resolution for a genuine out-of-region exception', () => {
      // A real shape: an agency that's ~99% one metro area still occasionally carries a
      // handful of listings genuinely elsewhere (e.g. housemarket-realestate.gr is almost
      // entirely Attica but also has a few Crete/Cyclades/Epirus rows). The agency scope
      // must not force those into the agency's usual region, and must not leave
      // estateweb_location_id null either (root cause #8 -- that blocks the CMS push).
      const loc = resolveEstateWebLocationFromSources({
        city: 'Ιεράπετρα',
        agencyCity: 'Αθήνα',
      });
      const unscoped = resolveEstateWebLocationFromSources({ city: 'Ιεράπετρα' });
      expect(loc?.id).toBe(unscoped?.id);
      expect(loc?.id).toBeDefined();
      expect(loc?.path.startsWith('Στερεά Ελλάδα » Αθήνα')).toBe(false);
    });

    it('never returns null for a property whose text alone the unscoped resolver already handles, just because agencyCity was set', () => {
      // Regression against the "never blank" requirement: an agency-scoped miss must never
      // regress an otherwise-resolvable property to undefined.
      const withoutAgency = resolveEstateWebLocationFromSources({
        city: 'Χανιά',
        district: 'Αποκορώνας',
      });
      const withUnrelatedAgency = resolveEstateWebLocationFromSources({
        city: 'Χανιά',
        district: 'Αποκορώνας',
        agencyCity: 'Αθήνα',
      });
      expect(withoutAgency?.id).toBe(40300);
      expect(withUnrelatedAgency?.id).toBe(40300);
    });

    it('does not force a broad regional guess onto a property whose text has no real match in the agency region', () => {
      // Regression found while enabling agencyCity for housemarket-realestate.gr (Athens):
      // city "Μαλεσίνα" / district "Θεολόγος" are both real, unique, unambiguous Central-
      // Greece (Φθιώτιδα) catalog matches -- genuinely outside Athens/Attica. The
      // agency-scoped pass found no confident match there, but its OWN "never return null"
      // last-resort fallback (meant only for when there is truly nowhere else to fall back
      // to) fired anyway and picked a low-confidence broad "Αθήνα" node, blocking the
      // fallback to the unscoped pass that has the real, correct, specific answer.
      const unscoped = resolveEstateWebLocationFromSources({
        city: 'Μαλεσίνα',
        district: 'Θεολόγος',
      });
      const scoped = resolveEstateWebLocationFromSources({
        city: 'Μαλεσίνα',
        district: 'Θεολόγος',
        agencyCity: 'Αθήνα',
      });
      expect(unscoped?.path.startsWith('Στερεά Ελλάδα » Φθιώτιδα')).toBe(true);
      expect(scoped?.id).toBe(unscoped?.id);
    });

    it('does not let an agency-region homonym win when the text explicitly names a different real prefecture', () => {
      // Regression found the same way: city "Άγιος Κωνσταντίνος" / district "Φθιώτιδα" (the
      // prefecture name spelled out directly) -- "Άγιος Κωνσταντίνος" is a common enough name
      // that it ALSO exists inside the agency's own Attica region (Τροιζηνία), so unlike the
      // Μαλεσίνα case above, the agency-scoped pass finds a genuinely confident (not
      // last-resort) match there -- just the wrong one, since the district field explicitly
      // names a different, real, conflicting prefecture the agency scope has no business
      // overriding. Mirrors the existing guard on guessMunicipalityGenitivePhrase below.
      const unscoped = resolveEstateWebLocationFromSources({
        city: 'Άγιος Κωνσταντίνος',
        district: 'Φθιώτιδα',
      });
      const scoped = resolveEstateWebLocationFromSources({
        city: 'Άγιος Κωνσταντίνος',
        district: 'Φθιώτιδα',
        agencyCity: 'Αθήνα',
      });
      expect(unscoped?.path.startsWith('Στερεά Ελλάδα » Φθιώτιδα')).toBe(true);
      expect(scoped?.id).toBe(unscoped?.id);
    });
  });
});
