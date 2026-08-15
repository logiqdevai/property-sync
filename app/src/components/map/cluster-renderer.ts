import type { Renderer } from "@googlemaps/markerclusterer";
import type { PriceInput } from "./price-color-scale";

const MIN_DIAMETER = 32;
const MAX_DIAMETER = 68;

function clusterDiameter(count: number): number {
  return Math.min(MIN_DIAMETER + Math.sqrt(count) * 8, MAX_DIAMETER);
}

function buildClusterSvg(color: string, diameter: number): string {
  const r = diameter / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}"><circle cx="${r}" cy="${r}" r="${r - 2}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="2"/></svg>`;
}

/**
 * Colors each cluster bubble by the average price of the markers inside it, sized by marker count.
 * `priceByMarker` is populated by the caller as markers are created, keyed by marker instance.
 */
export function createPriceClusterRenderer(
  priceByMarker: WeakMap<google.maps.Marker, number>,
  colorForPrice: (price: PriceInput) => string,
): Renderer {
  return {
    render({ count, position, markers }) {
      const prices = (markers ?? [])
        .filter((marker): marker is google.maps.Marker => marker instanceof google.maps.Marker)
        .map((marker) => priceByMarker.get(marker))
        .filter((price): price is number => price != null);

      const avgPrice =
        prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
      const color = colorForPrice(avgPrice);
      const diameter = clusterDiameter(count);

      return new google.maps.Marker({
        position,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildClusterSvg(color, diameter))}`,
          scaledSize: new google.maps.Size(diameter, diameter),
          anchor: new google.maps.Point(diameter / 2, diameter / 2),
        },
        label: {
          text: String(count),
          color: "#fff",
          fontSize: "12px",
          fontWeight: "600",
        },
        zIndex: 1000 + count,
      });
    },
  };
}
