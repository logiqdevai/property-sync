export function formatPrice(
  value: string | number | null | undefined,
  currency: string | null | undefined = "EUR",
): string {
  if (value == null || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact form for tight spaces (map legends, chips): "€120K" instead of "€120,000.00". */
export function formatCompactPrice(
  value: string | number | null | undefined,
  currency: string | null | undefined = "EUR",
): string {
  if (value == null || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/** Most frequent currency among a set of markers, defaulting to EUR when none is set. */
export function dominantCurrency(
  currencies: Array<string | null | undefined>,
): string {
  const counts = new Map<string, number>();
  for (const currency of currencies) {
    if (!currency) continue;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  let best: string = "EUR";
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}
