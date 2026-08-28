import { useEffect, useRef } from "react";
import { useGoogleMap } from "./GoogleMap";
import type { Coordinates } from "./types";

interface PolylineProps {
  coordinates: Coordinates[];
  color?: string;
  weight?: number;
  opacity?: number;
}

/**
 * Polyline component for Google Maps.
 * Draws a route line on the map.
 */
export function Polyline({
  coordinates,
  color = "#ff6b45",
  weight = 4,
  opacity = 0.9,
}: PolylineProps) {
  const map = useGoogleMap();
  const polylineRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !(window as any).google?.maps || coordinates.length < 2) return;

    const gmaps = (window as any).google.maps;
    const path = coordinates.map(
      (c) => new gmaps.LatLng(c.lat, c.lng)
    );

    const polyline = new gmaps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWeight: weight,
      map,
      clickable: false,
    });

    polylineRef.current = polyline;

    return () => {
      polyline.setMap(null);
      polylineRef.current = null;
    };
  }, [map]); // Re-create when map changes

  // Update path when coordinates change
  useEffect(() => {
    if (polylineRef.current && (window as any).google?.maps) {
      const gmaps = (window as any).google.maps;
      const path = coordinates.map(
        (c) => new gmaps.LatLng(c.lat, c.lng)
      );
      polylineRef.current.setPath(path);
    }
  }, [coordinates]);

  return null;
}
