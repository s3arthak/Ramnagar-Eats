import { useState, useCallback } from "react";
import { GoogleMap, Marker } from "../services/maps";
import type { Coordinates } from "../services/maps/types";

/**
 * The location-sheet map — now uses Google Maps instead of Leaflet.
 * Renders a draggable emoji marker and supports click-to-move.
 */
export default function LocationMap({
  position,
  onMove,
}: {
  position: [number, number];
  onMove: (value: [number, number]) => void;
}) {
  const [center] = useState<Coordinates>({ lat: position[0], lng: position[1] });

  const handleMapClick = useCallback(
    (coords: Coordinates) => {
      onMove([coords.lat, coords.lng]);
    },
    [onMove],
  );

  const handleDragEnd = useCallback(
    (coords: Coordinates) => {
      onMove([coords.lat, coords.lng]);
    },
    [onMove],
  );

  return (
    <GoogleMap
      center={center}
      zoom={15}
      scrollWheelZoom={false}
      zoomControl={true}
      onClick={handleMapClick}
      style={{ height: "100%", width: "100%" }}
    >
      <Marker
        position={{ lat: position[0], lng: position[1] }}
        emoji="📍"
        size={30}
        draggable={true}
        onDragEnd={handleDragEnd}
      />
    </GoogleMap>
  );
}
