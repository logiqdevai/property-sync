import { formatCompactPrice } from "@/lib/price";
import type { PriceLegendStop } from "./price-color-scale";

interface PriceLegendProps {
  stops: PriceLegendStop[];
  currency: string;
}

export function PriceLegend({ stops, currency }: PriceLegendProps) {
  if (stops.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-border bg-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <span className="font-medium text-muted">Price</span>
      <div className="flex items-center gap-0.5">
        {stops.map((stop) => (
          <span
            key={stop.color}
            title={`${formatCompactPrice(stop.min, currency)} – ${formatCompactPrice(stop.max, currency)}`}
            className="h-2.5 w-6 first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: stop.color }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{formatCompactPrice(stops[0].min, currency)}</span>
        <span>{formatCompactPrice(stops[stops.length - 1].max, currency)}</span>
      </div>
    </div>
  );
}
