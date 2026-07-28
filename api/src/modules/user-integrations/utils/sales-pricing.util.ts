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

export function pickSalePercentage(start: number, end: number): number {
  if (end <= start) {
    return start;
  }
  return start + Math.random() * (end - start);
}

export function computeSalePriceStart(price: number, pct: number): number {
  return Math.ceil(price * (1 + pct));
}

export function shouldApplySalesPriceStart(
  sourcePriceStart: number | null | undefined | Prisma.Decimal,
  sales: SalesPricingSettings,
  price: number | null | undefined | Prisma.Decimal,
): boolean {
  if (!sales.enable_sales) {
    return false;
  }

  const priceNum =
    price == null ? 0 : typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return false;
  }

  if (sourcePriceStart == null) {
    return true;
  }

  const sourceNum =
    typeof sourcePriceStart === 'number'
      ? sourcePriceStart
      : Number(sourcePriceStart);

  return !Number.isFinite(sourceNum) || sourceNum <= 0;
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
