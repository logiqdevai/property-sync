import type { GoogleMapsOverlay } from "@deck.gl/google-maps";
import type { HeatmapLayer } from "@deck.gl/aggregation-layers";

export interface PriceHeatmapPoint {
  position: [lng: number, lat: number];
  weight: number;
}

interface DeckGlHeatmapModules {
  GoogleMapsOverlay: typeof GoogleMapsOverlay;
  HeatmapLayer: typeof HeatmapLayer;
}

let modulesPromise: Promise<DeckGlHeatmapModules> | null = null;

/**
 * google.maps.visualization.HeatmapLayer was removed from the Maps JS API (May 2026);
 * deck.gl's HeatmapLayer rendered through GoogleMapsOverlay is Google's documented replacement.
 * Both packages are ~1MB of WebGL code, so they're only fetched once a user opens the heatmap view.
 */
export function loadDeckGlHeatmap(): Promise<DeckGlHeatmapModules> {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("@deck.gl/google-maps"),
      import("@deck.gl/aggregation-layers"),
    ]).then(([googleMaps, aggregation]) => ({
      GoogleMapsOverlay: googleMaps.GoogleMapsOverlay,
      HeatmapLayer: aggregation.HeatmapLayer,
    }));
  }
  return modulesPromise;
}
