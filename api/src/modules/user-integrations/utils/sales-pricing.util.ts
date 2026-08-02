import { Prisma } from 'generated/prisma';
import { SalesPricingSettings } from '../interfaces/sales-pricing-settings.interface';
import { UserIntegrationSettingsData } from '../interfaces/user-integration-settings.interface';

export const DEFAULT_SALES_PRICING_SETTINGS: SalesPricingSettings = {
  enable_sales: false,
  sale_percentage_start: 0.05,
  sale_percentage_end: 0.1,
};

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function asSettingsData(
  settings: Prisma.JsonValue | null | undefined | UserIntegrationSettingsData,
): UserIntegrationSettingsData | null {
  if (settings === null || settings === undefined) {
    return null;
  }
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }
  return settings as UserIntegrationSettingsData;
}

export function resolveSalesPricingSettings(
  settings: Prisma.JsonValue | null | undefined | UserIntegrationSettingsData,
): SalesPricingSettings {
  const sales = asSettingsData(settings)?.sales;
  if (!sales || typeof sales !== 'object') {
    return { ...DEFAULT_SALES_PRICING_SETTINGS };
  }

  let start = clampPercentage(
    typeof sales.sale_percentage_start === 'number'
      ? sales.sale_percentage_start
      : DEFAULT_SALES_PRICING_SETTINGS.sale_percentage_start,
  );
  let end = clampPercentage(
    typeof sales.sale_percentage_end === 'number'
      ? sales.sale_percentage_end
      : DEFAULT_SALES_PRICING_SETTINGS.sale_percentage_end,
  );

  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }

  return {
    enable_sales: Boolean(sales.enable_sales),
    sale_percentage_start: start,
    sale_percentage_end: end,
  };
}

const SALE_PERCENTAGE_STEP = 0.01;
const CLEAN_PRICE_STEP = 1000;

function toFiniteNumber(
  value: number | null | undefined | Prisma.Decimal,
): number | null {
  if (value == null) {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function hashSeedToOffset(seed: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return range > 0 ? hash % range : 0;
}

export function pickSalePercentage(
  start: number,
  end: number,
  seed?: string,
): number {
  if (end <= start) {
    return Math.round(start / SALE_PERCENTAGE_STEP) * SALE_PERCENTAGE_STEP;
  }

  const startSteps = Math.round(start / SALE_PERCENTAGE_STEP);
  const endSteps = Math.round(end / SALE_PERCENTAGE_STEP);
  const range = endSteps - startSteps + 1;
  const offset =
    seed != null && seed.length > 0
      ? hashSeedToOffset(seed, range)
      : Math.floor(Math.random() * range);
  const step = startSteps + offset;

  return Math.round(step * SALE_PERCENTAGE_STEP * 100) / 100;
}

export function computeSalePriceStart(price: number, pct: number): number {
  const rawPriceStart = price * (1 + pct);
  return Math.round(rawPriceStart / CLEAN_PRICE_STEP) * CLEAN_PRICE_STEP;
}

export function hasValidSalePriceStart(
  priceStart: number | null | undefined | Prisma.Decimal,
  price: number | null | undefined | Prisma.Decimal,
): boolean {
  const priceNum = toFiniteNumber(price);
  const startNum = toFiniteNumber(priceStart);
  if (priceNum == null || priceNum <= 0 || startNum == null || startNum <= 0) {
    return false;
  }
  return startNum > priceNum;
}

export function shouldApplySalesPriceStart(
  sourcePriceStart: number | null | undefined | Prisma.Decimal,
  sales: SalesPricingSettings,
  price: number | null | undefined | Prisma.Decimal,
  forceRecalc = false,
): boolean {
  if (!sales.enable_sales) {
    return false;
  }

  const priceNum = toFiniteNumber(price);
  if (priceNum == null || priceNum <= 0) {
    return false;
  }

  if (forceRecalc) {
    return true;
  }

  if (sourcePriceStart == null) {
    return true;
  }

  const sourceNum = toFiniteNumber(sourcePriceStart);
  return sourceNum == null || sourceNum <= 0;
}

export function resolveCanonicalOrCrmPriceStart(
  canonicalPriceStart: number | null | undefined | Prisma.Decimal,
  existingPriceStart: number | null | undefined | Prisma.Decimal,
): number | null | undefined | Prisma.Decimal {
  const canonicalNum = toFiniteNumber(canonicalPriceStart);
  if (canonicalNum != null && canonicalNum > 0) {
    return canonicalPriceStart;
  }
  return existingPriceStart;
}

export function normalizeSalesPricingForSave(
  sales: unknown,
): SalesPricingSettings | undefined {
  if (sales === undefined) {
    return undefined;
  }
  if (sales === null || typeof sales !== 'object' || Array.isArray(sales)) {
    throw new Error('sales must be an object');
  }

  const raw = sales as Record<string, unknown>;
  const enableSales = Boolean(raw.enable_sales);

  const startRaw = raw.sale_percentage_start;
  const endRaw = raw.sale_percentage_end;

  if (typeof startRaw !== 'number' || !Number.isFinite(startRaw)) {
    throw new Error('sale_percentage_start must be a number');
  }
  if (typeof endRaw !== 'number' || !Number.isFinite(endRaw)) {
    throw new Error('sale_percentage_end must be a number');
  }
  if (startRaw < 0 || startRaw > 1) {
    throw new Error('sale_percentage_start must be between 0 and 1');
  }
  if (endRaw < 0 || endRaw > 1) {
    throw new Error('sale_percentage_end must be between 0 and 1');
  }
  if (startRaw > endRaw) {
    throw new Error(
      'sale_percentage_start must be less than or equal to sale_percentage_end',
    );
  }

  return {
    enable_sales: enableSales,
    sale_percentage_start: startRaw,
    sale_percentage_end: endRaw,
  };
}

export function sanitizeUserIntegrationSettingsForSave(
  settings: UserIntegrationSettingsData | undefined,
): UserIntegrationSettingsData | undefined {
  if (settings === undefined) {
    return undefined;
  }

  if (settings.sales === undefined) {
    return settings;
  }

  try {
    const sales = normalizeSalesPricingForSave(settings.sales);
    return {
      ...settings,
      ...(sales !== undefined ? { sales } : {}),
    };
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Invalid sales settings',
    );
  }
}
