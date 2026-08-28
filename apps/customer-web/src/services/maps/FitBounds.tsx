import { useEffect } from "react";
import { useGoogleMap } from "./GoogleMap";
import type { Coordinates } from "./types";

interface FitBoundsProps {
  bounds: Coordinates[];
  padding?: number;
}

/**
 * Fits the map to show all provided coordinates.
 */
export function FitBounds({ bounds, padding = 36 }: FitBoundsProps) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map || !window.google?.maps || bounds.length === 0) return;

    const googleBounds = new window.google.maps.LatLngBounds();
    for (const point of bounds) {
      googleBounds.extend(new window.google.maps.LatLng(point.lat, point.lng));
    }
    map.fitBounds(googleBounds, padding);
  }, [map, bounds, padding]);

  return null;
}
