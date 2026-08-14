import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { environments } from "@/config/environments";

let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null;

export function loadGoogleMaps(): Promise<google.maps.MapsLibrary> {
  if (!mapsLibraryPromise) {
    setOptions({ key: environments.GOOGLE_MAPS_API_KEY, v: "weekly" });
    mapsLibraryPromise = importLibrary("maps");
  }
  return mapsLibraryPromise;
}
