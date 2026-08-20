import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * The location-sheet map, split into its own chunk so Leaflet (~150 KB + CSS)
 * is only downloaded when the user actually opens the location picker.
 *
 * Uses an emoji divIcon marker (like the rest of the app) so no icon image
 * assets are ever needed, and pans the view to the position whenever it
 * changes — e.g. after a GPS fix.
 */
function emojiIcon() {
  return L.divIcon({
    html: `<span style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">📍</span>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function MapFollower({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(position, { animate: true });
  }, [map, position[0], position[1]]);
  return null;
}

export default function LocationMap({ position, onMove }: { position: [number, number]; onMove: (value: [number, number]) => void }) {
  return (
    <MapContainer center={position} zoom={15} minZoom={5} maxZoom={19} scrollWheelZoom={false} zoomControl={true}>
      <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} errorTileUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256' fill='%23e8e4df'%3E%3Crect width='256' height='256'/%3E%3C/svg%3E" />
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
  return <Marker position={position} icon={emojiIcon()} draggable eventHandlers={{ dragend(event) { const point = event.target.getLatLng(); onMove([point.lat, point.lng]); } }} />;
}
