import { scaleQuantile, scaleLinear } from "d3-scale";
import chroma from "chroma-js";

const COLOR_RAMP = ["#059669", "#65a30d", "#eab308", "#f97316", "#dc2626"];
const BUCKET_COUNT = COLOR_RAMP.length;
const NO_PRICE_COLOR = "#9ca3af";

export interface PriceLegendStop {
  color: string;
  min: number;
  max: number;
}

export type PriceInput = number | string | null | undefined;

export interface PriceColorScale {
  /** Hex color for a given price, or the neutral "unknown" color. */
  color: (price: PriceInput) => string;
  /** Discrete price bands backing the scale, ordered cheap to expensive. */
  legend: PriceLegendStop[];
  hasPrices: boolean;
}

function toFiniteNumbers(values: PriceInput[]) {
  return values
    .map((value) => (typeof value === "string" ? Number(value) : value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

/** Buckets prices into quantile-based colour bands so skewed price distributions still spread across the ramp. */
export function buildPriceColorScale(prices: PriceInput[]): PriceColorScale {
  const finite = toFiniteNumbers(prices);
  const colors = chroma.scale(COLOR_RAMP).mode("lab").colors(BUCKET_COUNT);

  if (finite.length === 0) {
    return { color: () => NO_PRICE_COLOR, legend: [], hasPrices: false };
  }

  const quantile = scaleQuantile<string>().domain(finite).range(colors);

  const legend = colors
    .map((bandColor) => {
      const extent = quantile.invertExtent(bandColor);
      return { color: bandColor, min: extent[0], max: extent[1] };
    })
    .filter((stop): stop is PriceLegendStop => stop.min != null && stop.max != null);

  return {
    color: (price) => {
      const amount = typeof price === "string" ? Number(price) : price;
      return amount == null || !Number.isFinite(amount) ? NO_PRICE_COLOR : quantile(amount);
    },
    legend,
    hasPrices: true,
  };
}

/** Continuous 0..1 weight for the heatmap layer, clamped so outliers don't wash out the gradient. */
export function buildPriceWeightScale(prices: PriceInput[]): (price: PriceInput) => number {
  const finite = toFiniteNumbers(prices);
  if (finite.length === 0) return () => 0;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const weight = scaleLinear().domain([min, max]).range([0.1, 1]).clamp(true);

  return (price) => {
    const amount = typeof price === "string" ? Number(price) : price;
    return amount == null || !Number.isFinite(amount) ? 0 : weight(amount);
  };
}

export { NO_PRICE_COLOR };
