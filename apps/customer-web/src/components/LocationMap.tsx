import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { emojiIcon } from "../lib/leafletMarkers";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_URL, TILE_ERROR_URL } from "../lib/mapTiles";

/**
 * The location-sheet map (OSM base tiles + application-owned pin), split into
 * its own chunk so Leaflet (~150 KB + CSS) is only downloaded when the user
 * actually opens the location picker.
 *
 * Uses an emoji divIcon marker (like the rest of the app) so no icon image
 * assets are ever needed, and pans the view to the position whenever it
 * changes — e.g. after a GPS fix.
 */
function MapFollower({ position }: { position: [number, number] }) {
  const map = useMap();
  const positionRef = useRef(position);
  positionRef.current = position;
  const key = position.join(",");
  // Recentre only when the coordinate really changes, so panning is never undone.
  useEffect(() => {
    map.panTo(positionRef.current, { animate: true });
  }, [map, key]);
  return null;
}

export default function LocationMap({ position, onMove }: { position: [number, number]; onMove: (value: [number, number]) => void }) {
  return (
    <MapContainer center={position} zoom={15} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} scrollWheelZoom={false} zoomControl={true}>
      <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} maxZoom={MAP_MAX_ZOOM} errorTileUrl={TILE_ERROR_URL} />
      <MapFollower position={position} />
      <DraggableMarker position={position} onMove={onMove} />
    </MapContainer>
  );
}

function DraggableMarker({ position, onMove }: { position: [number, number]; onMove: (value: [number, number]) => void }) {
  const map = useMapEvents({
    click(event) {
      onMove([event.latlng.lat, event.latlng.lng]);
      map.panTo(event.latlng);
    },
  });
  return <Marker position={position} icon={emojiIcon("📍")} draggable eventHandlers={{ dragend(event) { const point = event.target.getLatLng(); onMove([point.lat, point.lng]); } }} />;
}
