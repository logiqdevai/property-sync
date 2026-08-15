import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "./google-maps-loader";
import { getPriceMarkerIcon } from "./marker-icon";

interface PropertyLocationMapProps {
  latitude: number;
  longitude: number;
  title?: string;
}

export function PropertyLocationMap({ latitude, longitude, title }: PropertyLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;

      const position = { lat: latitude, lng: longitude };

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: position,
          zoom: 15,
        });
      } else {
        mapRef.current.setCenter(position);
      }

      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position,
          title,
          icon: getPriceMarkerIcon("#2563eb"),
        });
      } else {
        markerRef.current.setPosition(position);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, title]);

  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null);
    };
  }, []);

  return (
    <div className="h-[320px] w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
