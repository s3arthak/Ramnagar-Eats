import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { emojiIcon } from "../lib/leafletMarkers";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_URL, TILE_ERROR_URL } from "../lib/mapTiles";

/**
 * The restaurant card's location map (OSM base tiles + application-owned pin),
 * split into its own chunk so Leaflet is only downloaded when a restaurant page
 * with coordinates is actually opened.
 */
export default function RestaurantMap({ position }: { position: { lat: number; lng: number } }) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={15}
      minZoom={MAP_MIN_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} maxZoom={MAP_MAX_ZOOM} errorTileUrl={TILE_ERROR_URL} />
      <Marker position={[position.lat, position.lng]} icon={emojiIcon("📍", 34)} />
    </MapContainer>
  );
}
