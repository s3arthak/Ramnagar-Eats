import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { emojiIcon } from "../lib/leafletMarkers";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_URL, TILE_ERROR_URL } from "../lib/mapTiles";
import type { OrderRoute } from "../lib/types";

type Point = { lat: number; lng: number };

/**
 * Fits the viewport around the restaurant, the delivery address and the rider.
 * Refits only when a coordinate actually changes, so panning is never undone by
 * a re-render.
 */
function FitAllPoints({ points }: { points: Point[] }) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const key = points.map((point) => `${point.lat},${point.lng}`).join("|");

  useEffect(() => {
    const current = pointsRef.current;
    if (current.length < 2) return;
    map.fitBounds(current.map((point) => [point.lat, point.lng] as [number, number]), { padding: [36, 36] });
  }, [map, key]);

  return null;
}

/**
 * Live order-tracking map (OSM base tiles + application-owned route data), split
 * into its own chunk so Leaflet is only downloaded once an order actually has a
 * route to draw.
 *
 * Draws the restaurant → home road polyline plus the rider's latest GPS fix.
 */
export default function RouteMap({ routeInfo, riderLocation }: { routeInfo: OrderRoute; riderLocation?: Point | null }) {
  if (!routeInfo.route || !routeInfo.restaurant?.location || !routeInfo.delivery.location) return null;
  const from = routeInfo.restaurant.location;
  const to = routeInfo.delivery.location;
  const line = routeInfo.route.polyline;
  const points: Point[] = [from, to, ...(riderLocation ? [riderLocation] : [])];

  return (
    <MapContainer
      center={[from.lat, from.lng]}
      zoom={13}
      minZoom={MAP_MIN_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} maxZoom={MAP_MAX_ZOOM} errorTileUrl={TILE_ERROR_URL} />
      <FitAllPoints points={points} />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#ff6b45", weight: 4, opacity: 0.9 }} />}
      <Marker position={[from.lat, from.lng]} icon={emojiIcon("🍴", 34)} />
      <Marker position={[to.lat, to.lng]} icon={emojiIcon("🏠", 34)} />
      {riderLocation && <Marker position={[riderLocation.lat, riderLocation.lng]} icon={emojiIcon("🛵", 34)} />}
    </MapContainer>
  );
}
