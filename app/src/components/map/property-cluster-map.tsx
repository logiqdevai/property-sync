import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps } from "./google-maps-loader";
import type { MapMarkerData } from "./types";
import { formatPrice } from "@/lib/price";
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

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function buildInfoWindowContent(
  marker: MapMarkerData,
  href: string,
  onNavigate: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;gap:4px;padding:4px;font-size:13px;max-width:220px;";

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
  link.textContent = "View details";
  link.style.cssText =
    "margin-top:4px;color:#2563eb;font-weight:600;text-decoration:none;";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onNavigate();
  });
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
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const gMarkersRef = useRef<google.maps.Marker[]>([]);
  const navigateRef = useRef(navigate);
  const getDetailHrefRef = useRef(getDetailHref);

  useEffect(() => {
    navigateRef.current = navigate;
    getDetailHrefRef.current = getDetailHref;
  }, [navigate, getDetailHref]);

  useEffect(() => {
    let cancelled = false;

    if (markers.length === 0) {
      gMarkersRef.current.forEach((marker) => marker.setMap(null));
      gMarkersRef.current = [];
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
      mapRef.current = null;
      infoWindowRef.current = null;
      return;
    }

    loadGoogleMaps().then(() => {
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
      clustererRef.current?.clearMarkers();

      const gMarkers = markers.map((marker) => {
        const gMarker = new google.maps.Marker({
          position: { lat: marker.latitude, lng: marker.longitude },
          title: marker.title,
        });
        gMarker.addListener("click", () => {
          const href = getDetailHrefRef.current(marker.id);
          const content = buildInfoWindowContent(marker, href, () =>
            navigateRef.current(href),
          );
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open({ map, anchor: gMarker });
        });
        return gMarker;
      });
      gMarkersRef.current = gMarkers;

      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map, markers: gMarkers });
      } else {
        clustererRef.current.addMarkers(gMarkers);
      }

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
    });

    return () => {
      cancelled = true;
    };
  }, [markers]);

  useEffect(() => {
    return () => {
      gMarkersRef.current.forEach((marker) => marker.setMap(null));
      clustererRef.current?.clearMarkers();
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
    <div className="h-[560px] w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
