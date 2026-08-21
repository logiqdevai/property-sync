import {
  hasValidSalePriceStart,
  isSalePriceStartWithinMarkupRange,
  resolveCanonicalOrCrmPriceStart,
  shouldApplySalesPriceStart,
} from './sales-pricing.util';

const salesOn = {
  enable_sales: true,
  sale_percentage_start: 0.05,
  sale_percentage_end: 0.1,
};

const salesOff = {
  enable_sales: false,
  sale_percentage_start: 0.05,
  sale_percentage_end: 0.1,
};

describe('sales-pricing.util', () => {
  describe('shouldApplySalesPriceStart', () => {
    it('applies when source price_start equals listing price', () => {
      expect(
        shouldApplySalesPriceStart(90_000, salesOn, 90_000, false),
      ).toBe(true);
    });

    it('applies when source price_start is null', () => {
      expect(shouldApplySalesPriceStart(null, salesOn, 90_000, false)).toBe(
        true,
      );
    });

    it('skips when source already has a real discount', () => {
      expect(
        shouldApplySalesPriceStart(99_000, salesOn, 90_000, false),
      ).toBe(false);
    });

    it('force recalc overrides source discount', () => {
      expect(
        shouldApplySalesPriceStart(99_000, salesOn, 90_000, true),
      ).toBe(true);
    });

    it('skips when sales disabled', () => {
      expect(
        shouldApplySalesPriceStart(null, salesOff, 90_000, false),
      ).toBe(false);
    });
  });

  describe('resolveCanonicalOrCrmPriceStart', () => {
    it('preserves CRM sales markup when canonical has no real discount', () => {
      expect(
        resolveCanonicalOrCrmPriceStart(90_000, 99_000, 90_000),
      ).toBe(99_000);
    });

    it('prefers real source discount over CRM markup', () => {
      expect(
        resolveCanonicalOrCrmPriceStart(110_000, 99_000, 90_000),
      ).toBe(110_000);
    });

    it('falls back to canonical when neither has a discount', () => {
      expect(
        resolveCanonicalOrCrmPriceStart(90_000, 90_000, 90_000),
      ).toBe(90_000);
    });

    it('keeps existing when canonical is empty', () => {
      expect(resolveCanonicalOrCrmPriceStart(null, 99_000, 90_000)).toBe(
        99_000,
      );
    });
  });

  describe('hasValidSalePriceStart', () => {
    it('requires start strictly above price', () => {
      expect(hasValidSalePriceStart(90_000, 90_000)).toBe(false);
      expect(hasValidSalePriceStart(99_000, 90_000)).toBe(true);
    });
  });

  describe('isSalePriceStartWithinMarkupRange', () => {
    it('accepts a price_start within the configured percentage band', () => {
      // 5%-10% markup over 100,000 -> [105,000, 110,000]
      expect(isSalePriceStartWithinMarkupRange(108_000, 100_000, salesOn)).toBe(
        true,
      );
    });

    it('rejects a stale markup computed off a higher, now-outdated price', () => {
      // KL428 case: price_start was 1,498,000 (7% over the old 1,400,000
      // price) but the listing dropped to price_web=1,150,000 — the 5-10%
      // band over the new price is [1,207,500, 1,265,000], so the stale
      // value must no longer read as "still valid".
      expect(
        isSalePriceStartWithinMarkupRange(1_498_000, 1_150_000, salesOn),
      ).toBe(false);
    });

    it('rejects a price_start below the minimum markup', () => {
      expect(isSalePriceStartWithinMarkupRange(101_000, 100_000, salesOn)).toBe(
        false,
      );
    });

    it('rejects missing or non-positive inputs', () => {
      expect(isSalePriceStartWithinMarkupRange(null, 100_000, salesOn)).toBe(
        false,
      );
      expect(isSalePriceStartWithinMarkupRange(108_000, null, salesOn)).toBe(
        false,
      );
      expect(isSalePriceStartWithinMarkupRange(0, 100_000, salesOn)).toBe(
        false,
      );
    });
  });
});
