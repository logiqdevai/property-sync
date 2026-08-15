import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Loader2, MapPin } from "lucide-react";
import { Tabs } from "@heroui/react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { loadGoogleMaps } from "./google-maps-loader";
import { getPriceMarkerIcon } from "./marker-icon";
import { createPriceClusterRenderer } from "./cluster-renderer";
import { buildPriceColorScale, buildPriceWeightScale } from "./price-color-scale";
import { loadDeckGlHeatmap, type PriceHeatmapPoint } from "./heatmap-layer";
import { PriceLegend } from "./price-legend";
import type { MapMarkerData } from "./types";
import { dominantCurrency, formatPrice } from "@/lib/price";
import { getPropertyStatusLabel } from "@/config/constants/dropdowns/properties/property-status-form.options";
import {
  PropertyStatuses,
  type PropertyStatus,
} from "@/features/properties/interfaces/properties.interfaces";

const STATUS_COLOR: Record<PropertyStatus, string> = {
  [PropertyStatuses.ACTIVE]: "#059669",
  [PropertyStatuses.INACTIVE]: "#6b7280",
  [PropertyStatuses.REMOVED]: "#dc2626",
  [PropertyStatuses.SOLD]: "#d97706",
  [PropertyStatuses.RENTED]: "#d97706",
  [PropertyStatuses.UNKNOWN]: "#6b7280",
};

type LayerMode = "markers" | "heatmap";

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function toFinitePrice(price: MapMarkerData["price"]): number | null {
  const amount = typeof price === "string" ? Number(price) : price;
  return amount != null && Number.isFinite(amount) ? amount : null;
}

function buildInfoWindowContent(marker: MapMarkerData, href: string): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;gap:4px;padding:4px;font-size:13px;max-width:220px;";

  if (marker.image) {
    const image = document.createElement("img");
    image.src = marker.image;
    image.alt = "";
    image.style.cssText =
      "width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:2px;";
    root.appendChild(image);
  }

  const title = document.createElement("p");
  title.style.cssText = "font-weight:600;margin:0;";
  title.innerHTML = escapeHtml(marker.title);
  root.appendChild(title);

  const price = document.createElement("p");
  price.style.margin = "0";
  price.textContent = formatPrice(marker.price, marker.currency);
  root.appendChild(price);

  const metaParts = [marker.city, marker.agency_name].filter(
    (part): part is string => !!part,
  );
  if (metaParts.length > 0) {
    const meta = document.createElement("p");
    meta.style.cssText = "margin:0;color:#6b7280;";
    meta.innerHTML = metaParts.map(escapeHtml).join(" &middot; ");
    root.appendChild(meta);
  }

  const badge = document.createElement("span");
  const color = STATUS_COLOR[marker.status];
  badge.style.cssText = `display:inline-block;width:fit-content;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${color}20;color:${color};`;
  badge.textContent = getPropertyStatusLabel(marker.status);
  root.appendChild(badge);

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View details";
  link.style.cssText =
    "margin-top:4px;color:#2563eb;font-weight:600;text-decoration:none;";
  root.appendChild(link);

  return root;
}

interface PropertyClusterMapProps {
  markers: MapMarkerData[];
  isLoading: boolean;
  getDetailHref: (id: string) => string;
  emptyMessage?: string;
}

export function PropertyClusterMap({
  markers,
  isLoading,
  getDetailHref,
  emptyMessage = "No properties with map coordinates to display.",
}: PropertyClusterMapProps) {
  const [layerMode, setLayerMode] = useState<LayerMode>("markers");
  const legend = useMemo(
    () => ({
      stops: buildPriceColorScale(markers.map((marker) => marker.price)).legend,
      currency: dominantCurrency(markers.map((marker) => marker.currency)),
    }),
    [markers],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const deckOverlayRef = useRef<GoogleMapsOverlay | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const gMarkersRef = useRef<google.maps.Marker[]>([]);
  const priceByMarkerRef = useRef(new WeakMap<google.maps.Marker, number>());
  const lastFitMarkersRef = useRef<MapMarkerData[] | null>(null);
  const getDetailHrefRef = useRef(getDetailHref);

  useEffect(() => {
    getDetailHrefRef.current = getDetailHref;
  }, [getDetailHref]);

  useEffect(() => {
    let cancelled = false;

    if (markers.length === 0) {
      gMarkersRef.current.forEach((marker) => marker.setMap(null));
      gMarkersRef.current = [];
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      deckOverlayRef.current?.setMap(null);
      deckOverlayRef.current = null;
      mapRef.current = null;
      infoWindowRef.current = null;
      return;
    }

    const colorScale = buildPriceColorScale(markers.map((marker) => marker.price));
    const weightScale = buildPriceWeightScale(markers.map((marker) => marker.price));

    loadGoogleMaps().then(async () => {
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: markers[0].latitude, lng: markers[0].longitude },
          zoom: 12,
        });
        infoWindowRef.current = new google.maps.InfoWindow();
      }
      const map = mapRef.current;

      gMarkersRef.current.forEach((marker) => marker.setMap(null));
      clustererRef.current?.setMap(null);
      priceByMarkerRef.current = new WeakMap();

      const gMarkers = markers.map((marker) => {
        const price = toFinitePrice(marker.price);
        const gMarker = new google.maps.Marker({
          position: { lat: marker.latitude, lng: marker.longitude },
          title: marker.title,
          icon: getPriceMarkerIcon(colorScale.color(marker.price)),
        });
        if (price != null) {
          priceByMarkerRef.current.set(gMarker, price);
        }
        gMarker.addListener("click", () => {
          const href = getDetailHrefRef.current(marker.id);
          const content = buildInfoWindowContent(marker, href);
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open({ map, anchor: gMarker });
        });
        return gMarker;
      });
      gMarkersRef.current = gMarkers;

      clustererRef.current = new MarkerClusterer({
        markers: gMarkers,
        renderer: createPriceClusterRenderer(priceByMarkerRef.current, colorScale.color),
      });

      if (layerMode === "heatmap") {
        const { GoogleMapsOverlay, HeatmapLayer } = await loadDeckGlHeatmap();
        if (cancelled) return;

        const points: PriceHeatmapPoint[] = markers
          .map((marker) => {
            const weight = weightScale(marker.price);
            return weight > 0 ? { position: [marker.longitude, marker.latitude] as const, weight } : null;
          })
          .filter((point): point is PriceHeatmapPoint => point != null);

        if (!deckOverlayRef.current) {
          deckOverlayRef.current = new GoogleMapsOverlay({});
          deckOverlayRef.current.setMap(map);
        }
        deckOverlayRef.current.setProps({
          layers: [
            new HeatmapLayer<PriceHeatmapPoint>({
              id: "price-heatmap",
              data: points,
              getPosition: (point) => point.position,
              getWeight: (point) => point.weight,
              radiusPixels: 40,
              intensity: 1,
            }),
          ],
        });
        clustererRef.current.setMap(null);
      } else {
        deckOverlayRef.current?.setProps({ layers: [] });
        clustererRef.current.setMap(map);
      }

      if (lastFitMarkersRef.current !== markers) {
        lastFitMarkersRef.current = markers;
        if (markers.length === 1) {
          map.setCenter({ lat: markers[0].latitude, lng: markers[0].longitude });
          map.setZoom(14);
        } else {
          const bounds = new google.maps.LatLngBounds();
          markers.forEach((marker) =>
            bounds.extend({ lat: marker.latitude, lng: marker.longitude }),
          );
          map.fitBounds(bounds, 40);
          google.maps.event.addListenerOnce(map, "bounds_changed", () => {
            if ((map.getZoom() ?? 0) > 16) {
              map.setZoom(16);
            }
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [markers, layerMode]);

  useEffect(() => {
    return () => {
      gMarkersRef.current.forEach((marker) => marker.setMap(null));
      clustererRef.current?.setMap(null);
      deckOverlayRef.current?.setMap(null);
    };
  }, []);

  if (markers.length === 0) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map&hellip;
          </span>
        ) : (
          emptyMessage
        )}
      </div>
    );
  }

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />

      <Tabs
        className="absolute top-3 right-3 z-10 w-fit"
        selectedKey={layerMode}
        onSelectionChange={(key) => setLayerMode(key === "heatmap" ? "heatmap" : "markers")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Price layer" className="w-auto shadow-sm backdrop-blur">
            <Tabs.Tab id="markers" className="w-auto gap-1.5 px-3">
              <MapPin className="size-4" />
              Markers
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="heatmap" className="w-auto gap-1.5 px-3">
              <Flame className="size-4" />
              Heatmap
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <PriceLegend stops={legend.stops} currency={legend.currency} />
    </div>
  );
}
