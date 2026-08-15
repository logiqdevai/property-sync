const iconCache = new Map<string, google.maps.Icon>();

function buildPinSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.75 13 21 13 21s13-11.25 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="13" cy="13" r="5" fill="#fff"/></svg>`;
}

/** Colored pin icon for a price band, cached per color since the palette is a small fixed set. */
export function getPriceMarkerIcon(color: string): google.maps.Icon {
  const cached = iconCache.get(color);
  if (cached) return cached;

  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(buildPinSvg(color))}`,
    scaledSize: new google.maps.Size(26, 34),
    anchor: new google.maps.Point(13, 34),
  };
  iconCache.set(color, icon);
  return icon;
}
