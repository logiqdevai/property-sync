# EstateWeb Duplicate Verification — price / location / sqm cross-check

Generated: 2026-08-14

> Cross-checks every DUPLICATE pair from `estateweb-orphans-all-agencies.md` (the record queued for deletion vs. the record being kept) against live EstateWeb data on three independent fields the `code` match never looked at: price, location, and square meters. A pair with all three matching is strong evidence it is genuinely the same listing pushed twice, not two different properties that happened to collide on a code.

## Reading the results

Raw "needs review" counts below are misleading without this context:

- **pagalos-trust (51/51 flagged):** 48 of the 51 orphan records have their `price` field literally equal to their own `sqm` field (e.g. price=410 on a 410 sqm plot) — a data bug from the original bad push, not a real price. Location and sqm match exactly on 50 of 51 pairs. **Only 1 pair is a genuine concern:** `52452 → 52489` has a location mismatch (Ρέθυμνο vs Επισκοπή) and should be checked manually before deleting; treat the other 50 as confirmed.
- **euroland-crete (7/7 flagged):** most "location mismatch" rows are the keeper record simply being tagged with the generic city ("Χανιά") while the orphan has a specific neighborhood — same city, coarser granularity, not necessarily a different property. Still worth a quick visual check since it's not a clean match.
- **samson-homes (6/9 flagged):** 3 pairs are exact matches. Of the 6 flagged, **3 have a genuine location mismatch** (`51202→52713`, `50899→52698`, `50719→52664`) alongside an 11–15% price gap — these are the most likely to be false-positive code collisions and deserve real manual review before deleting. The other 3 (`48476→52778`, `49655→52731`, `49656→52726`) have matching or near-matching location/sqm with only price or sqm drift, consistent with an older snapshot of the same listing before a later price/sqm edit.
- **bitsimis-real-homes (0/2 flagged):** both pairs are clean exact matches.

## pagalos-trust — 51 pair(s): 0 confirmed, 51 need review

| Delete ID | Keep ID | Price (delete vs keep) | Δ% | Location (delete vs keep) | Sqm (delete vs keep) | Δ% | Verdict |
|---|---|---|---|---|---|---|---|
| 52485 | 52508 | 410 vs 900000 | 100% | Αρκάδι vs Αρκάδι | 410 vs 410 | 0% | ⚠️ REVIEW |
| 52483 | 52507 | 400 vs 397000 | 99.9% | Αρκάδι vs Αρκάδι | 400 vs 400 | 0% | ⚠️ REVIEW |
| 52481 | 52506 | 50 vs 150000 | 100% | Καλλιθέα vs Καλλιθέα | 50 vs 50 | 0% | ⚠️ REVIEW |
| 52478 | 52504 | 350 vs 850000 | 100% | Παλιά πόλη vs Παλιά πόλη | 350 vs 350 | 0% | ⚠️ REVIEW |
| 52476 | 52503 | 480 vs 2000000 | 100% | Ρέθυμνο vs Ρέθυμνο | 480 vs 480 | 0% | ⚠️ REVIEW |
| 52474 | 52502 | 250 vs 850000 | 100% | Παλιά πόλη vs Παλιά πόλη | 250 vs 250 | 0% | ⚠️ REVIEW |
| 52473 | 52501 | 220 vs 480000 | 100% | Παλιά πόλη vs Παλιά πόλη | 220 vs 220 | 0% | ⚠️ REVIEW |
| 52471 | 52500 | 6800 vs 360000 | 98.1% | Δήμος Αγίου Βασιλείου vs Δήμος Αγίου Βασιλείου | 6800 vs 6800 | 0% | ⚠️ REVIEW |
| 52468 | 52498 | 68 vs 88000 | 99.9% | Αμάρι vs Αμάρι | 68 vs 68 | 0% | ⚠️ REVIEW |
| 52466 | 52497 | 400 vs 750000 | 99.9% | Παγκαλοχώρι vs Παγκαλοχώρι | 400 vs 400 | 0% | ⚠️ REVIEW |
| 52463 | 52496 | 75 vs 130000 | 99.9% | Κυριάννα vs Κυριάννα | 75 vs 75 | 0% | ⚠️ REVIEW |
| 52461 | 52495 | 135 vs 640000 | 100% | Αγία Τριάδα vs Αγία Τριάδα | 135 vs 135 | 0% | ⚠️ REVIEW |
| 52459 | 52494 | 135 vs 245000 | 99.9% | Σταυρωμένος vs Σταυρωμένος | 135 vs 135 | 0% | ⚠️ REVIEW |
| 52456 | 52492 | 1469 vs 126000 | 98.8% | Ρέθυμνο vs Ρέθυμνο | 1469 vs 1469 | 0% | ⚠️ REVIEW |
| 52455 | 52491 | 4200 vs 290000 | 98.6% | Νικηφόρος Φωκάς vs Νικηφόρος Φωκάς | 4100 vs 4100 | 0% | ⚠️ REVIEW |
| 52453 | 52490 | 70 vs 90000 | 99.9% | Περιβόλια vs Περιβόλια | 70 vs 70 | 0% | ⚠️ REVIEW |
| 52452 | 52489 | 6450 vs 210000 | 96.9% | Ρέθυμνο vs Επισκοπή ⚠️ | 6450 vs 6450 | 0% | ⚠️ REVIEW |
| 52449 | 52487 | 985 vs 120000 | 99.2% | Ρέθυμνο vs Ρέθυμνο | 985 vs 985 | 0% | ⚠️ REVIEW |
| 52446 | 52486 | 189 vs 630000 | 100% | Ρέθυμνο vs Ρέθυμνο | 189 vs 189 | 0% | ⚠️ REVIEW |
| 52444 | 52484 | 97 vs 225000 | 100% | Ρέθυμνο vs Ρέθυμνο | 97 vs 97 | 0% | ⚠️ REVIEW |
| 52443 | 52482 | 4300 vs 180000 | 97.6% | Ρέθυμνο vs Ρέθυμνο | 4300 vs 4300 | 0% | ⚠️ REVIEW |
| 52441 | 52479 | 1400 vs 135000 | 99% | Σφακάκι vs Σφακάκι | 1400 vs 1400 | 0% | ⚠️ REVIEW |
| 52439 | 52477 | 7985 vs 400000 | 98% | Αρχοντική vs Αρχοντική | 7985 vs 7985 | 0% | ⚠️ REVIEW |
| 52438 | 52475 | 303 vs 220000 | 99.9% | Καλλιθέα vs Καλλιθέα | 303 vs 303 | 0% | ⚠️ REVIEW |
| 52436 | 52472 | 360 vs 380000 | 99.9% | Ατσιπόπουλο vs Ατσιπόπουλο | 360 vs 360 | 0% | ⚠️ REVIEW |
| 52434 | 52469 | 55000 vs 5000000 | 98.9% | Γεράνι vs Γεράνι | 55000 vs 55000 | 0% | ⚠️ REVIEW |
| 52432 | 52467 | 146 vs 170000 | 99.9% | Ρέθυμνο vs Ρέθυμνο | 146 vs 146 | 0% | ⚠️ REVIEW |
| 52430 | 52465 | 160 vs 650000 | 100% | Παλιά πόλη vs Παλιά πόλη | 160 vs 160 | 0% | ⚠️ REVIEW |
| 52429 | 52464 | 367 vs 90000 | 99.6% | Ρέθυμνο vs Ρέθυμνο | 367 vs 367 | 0% | ⚠️ REVIEW |
| 52428 | 52462 | 60 vs 130000 | 100% | Ρέθυμνο vs Ρέθυμνο | 60 vs 60 | 0% | ⚠️ REVIEW |
| 52426 | 52460 | 3000 vs 250000 | 98.8% | Ρέθυμνο vs Ρέθυμνο | 3000 vs 3000 | 0% | ⚠️ REVIEW |
| 52424 | 52457 | 221 vs 650000 | 100% | Ρέθυμνο vs Ρέθυμνο | 0 vs 0 | 0% | ⚠️ REVIEW |
| 52422 | 52454 | 80 vs 206000 | 100% | Παλιά πόλη vs Παλιά πόλη | 80 vs 80 | 0% | ⚠️ REVIEW |
| 52421 | 52448 | 4140 vs 290000 | 98.6% | Πρινές vs Πρινές | 4140 vs 4140 | 0% | ⚠️ REVIEW |
| 52418 | 52445 | 2500 vs 170000 | 98.5% | Ρέθυμνο vs Ρέθυμνο | 2500 vs 2500 | 0% | ⚠️ REVIEW |
| 52416 | 52442 | 230 vs 88000 | 99.7% | Ρέθυμνο vs Ρέθυμνο | 230 vs 230 | 0% | ⚠️ REVIEW |
| 52415 | 52440 | 210 vs 260000 | 99.9% | Ρέθυμνο vs Ρέθυμνο | 210 vs 210 | 0% | ⚠️ REVIEW |
| 52413 | 52437 | 8000 vs 3200000 | 99.8% | Ρέθυμνο vs Ρέθυμνο | 8000 vs 8000 | 0% | ⚠️ REVIEW |
| 52408 | 52431 | 56 vs 230000 | 100% | Ρέθυμνο vs Ρέθυμνο | 56 vs 56 | 0% | ⚠️ REVIEW |
| 52407 | 52427 | 3200 vs 1800000 | 99.8% | Μισίρια vs Μισίρια | 3200 vs 3200 | 0% | ⚠️ REVIEW |
| 52406 | 52425 | 440 vs 58000 | 99.2% | Κυριάννα vs Κυριάννα | 440 vs 440 | 0% | ⚠️ REVIEW |
| 52404 | 52423 | 90 vs 340000 | 100% | Άγιος Δημήτριος vs Άγιος Δημήτριος | 90 vs 90 | 0% | ⚠️ REVIEW |
| 52402 | 52420 | 128 vs 375000 | 100% | Πανόραμα vs Πανόραμα | 128 vs 128 | 0% | ⚠️ REVIEW |
| 52400 | 52417 | 81 vs 265000 | 100% | Ξηρό Χωριό vs Ξηρό Χωριό | 81 vs 81 | 0% | ⚠️ REVIEW |
| 52398 | 52414 | 414 vs 430000 | 99.9% | Καλλιθέα vs Καλλιθέα | 414 vs 414 | 0% | ⚠️ REVIEW |
| 52396 | 52411 | 270 vs 850000 | 100% | Άδελε vs Άδελε | 270 vs 270 | 0% | ⚠️ REVIEW |
| 52395 | 52409 | 4800 vs 180000 | 97.3% | Γάλλος vs Γάλλος | 4856 vs 4856 | 0% | ⚠️ REVIEW |
| 52394 | 52405 | 3100 vs 187000 | 98.3% | Ανώγεια vs Ανώγεια | 3100 vs 3100 | 0% | ⚠️ REVIEW |
| 52393 | 52403 | 1107 vs 1100000 | 99.9% | Ρέθυμνο vs Ρέθυμνο | 1107 vs 1107 | 0% | ⚠️ REVIEW |
| 52391 | 52399 | 5600 vs 320000 | 98.3% | Ρέθυμνο vs Ρέθυμνο | 5600 vs 5600 | 0% | ⚠️ REVIEW |
| 52390 | 52397 | 1000 vs 82000 | 98.8% | Ρέθυμνο vs Ρέθυμνο | 1000 vs 1000 | 0% | ⚠️ REVIEW |

## samson-homes — 9 pair(s): 3 confirmed, 6 need review

| Delete ID | Keep ID | Price (delete vs keep) | Δ% | Location (delete vs keep) | Sqm (delete vs keep) | Δ% | Verdict |
|---|---|---|---|---|---|---|---|
| 52708 | 52779 | 1000000 vs 1000000 | 0% | Λάμπη vs Λάμπη | 51000 vs 51000 | 0% | ✅ confirmed |
| 52723 | 52778 | 350000 vs 350000 | 0% | Φραγκοκάστελλο vs Φραγκοκάστελλο | 10000 vs 10000 | 0% | ✅ confirmed |
| 48476 | 52778 | 1500000 vs 350000 | 76.7% | Φραγκοκάστελλο vs Φραγκοκάστελλο | 10000 vs 10000 | 0% | ⚠️ REVIEW |
| 49655 | 52731 | 950000 vs 1100000 | 13.6% | Πλατανιάς vs Πλατανιάς | 2542 vs 2542 | 0% | ⚠️ REVIEW |
| 49656 | 52726 | 1100000 vs 1100000 | 0% | Ασώματος vs Ασώματος | 270 vs 370 | 27% | ⚠️ REVIEW |
| 51202 | 52713 | 90000 vs 80000 | 11.1% | Αρμενοί vs Σωματάς ⚠️ | 453 vs 453 | 0% | ⚠️ REVIEW |
| 50899 | 52698 | 170000 vs 145000 | 14.7% | Επισκοπή vs Λάππα ⚠️ | 2500 vs 2500 | 0% | ⚠️ REVIEW |
| 47698 | 52680 | 160000 vs 160000 | 0% | Πλακιάς vs Πλακιάς | 710 vs 710 | 0% | ✅ confirmed |
| 50719 | 52664 | 125000 vs 110000 | 12% | Αγία Παρασκευή vs Λάμπη ⚠️ | 2500 vs 2500 | 0% | ⚠️ REVIEW |

## euroland-crete — 7 pair(s): 0 confirmed, 7 need review

| Delete ID | Keep ID | Price (delete vs keep) | Δ% | Location (delete vs keep) | Sqm (delete vs keep) | Δ% | Verdict |
|---|---|---|---|---|---|---|---|
| 50470 | 53398 | 310000 vs 290000 | 6.5% | Ενετικό Λιμάνι vs Χανιά ⚠️ | 51 vs 51 | 0% | ⚠️ REVIEW |
| 50440 | 53283 | 298000 vs 298000 | 0% | Δαρμαροχώρι vs Πλατανιάς ⚠️ | 61 vs 0 | 100% | ⚠️ REVIEW |
| 49861 | 53225 | 3600000 vs 3250000 | 9.7% | Κόκκινο Χωριό vs Χανιά ⚠️ | 290 vs 264 | 9% | ⚠️ REVIEW |
| 49803 | 53221 | 275000 vs 275000 | 0% | Παϊδοχώρι vs Χανιά ⚠️ | 86 vs 86 | 0% | ⚠️ REVIEW |
| 49880 | 53106 | 1900000 vs 1700000 | 10.5% | Γεράνι vs Γεράνι | 200 vs 200 | 0% | ⚠️ REVIEW |
| 49867 | 52939 | 385000 vs 385000 | 0% | Βάμος vs Χανιά ⚠️ | 84 vs 84 | 0% | ⚠️ REVIEW |
| 50468 | 52938 | 175000 vs 160000 | 8.6% | Νέα Χώρα vs Νέα Χώρα | 60 vs 60 | 0% | ⚠️ REVIEW |

## bitsimis-real-homes — 2 pair(s): 2 confirmed, 0 need review

| Delete ID | Keep ID | Price (delete vs keep) | Δ% | Location (delete vs keep) | Sqm (delete vs keep) | Δ% | Verdict |
|---|---|---|---|---|---|---|---|
| 52352 | 52354 | 130000 vs 130000 | 0% | Νέα Μουδανιά vs Νέα Μουδανιά | 34 vs 34 | 0% | ✅ confirmed |
| 52256 | 52330 | 139000 vs 139000 | 0% | Φάληρο vs Φάληρο | 38 vs 38 | 0% | ✅ confirmed |

## nikiestate — 0 pair(s): 0 confirmed, 0 need review

(no duplicate-code pairs)

## Summary

| Agency | Pairs checked | Confirmed | Needs review |
|---|---|---|---|
| pagalos-trust | 51 | 0 | 51 |
| samson-homes | 9 | 3 | 6 |
| euroland-crete | 7 | 0 | 7 |
| bitsimis-real-homes | 2 | 2 | 0 |
| nikiestate | 0 | 0 | 0 |
| **Total** | **69** | **5** | **64** |

Note: STANDALONE rows from the original report (no code collision, no local match at all) have no counterpart to cross-check against and are not included here — they still need manual verification before deletion.