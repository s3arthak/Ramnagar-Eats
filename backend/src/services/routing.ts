import { haversineKm } from "../utils/geo.js";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Route length in meters (road route when available, geodesic otherwise). */
  distanceMeters: number;
  /** Estimated travel time in seconds. */
  durationSeconds: number;
  /** Ordered [lat, lng] points from origin to destination. */
  polyline: [number, number][];
}

const AVG_DELIVERY_SPEED_KMH = 20;

/**
 * Road route via Mapbox Directions when MAPBOX_ACCESS_TOKEN is set; geodesic
 * fallback otherwise.
 *
 * Deliberately provider-agnostic above this line: callers only ever see
 * `RouteResult`, so the map only has to draw distance, duration and geometry.
 * A provider outage must never break ordering or the dashboards, so every
 * failure falls through to the geodesic line instead of throwing.
 */
export async function getRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (token) {
    try {
      return await mapboxRoute(from, to, token);
    } catch {
      /* route API unavailable — fall through to the fallback so the UI never breaks */
    }
  }
  return geodesicRoute(from, to);
}

/** Mapbox Directions — driving profile, full GeoJSON geometry. */
async function mapboxRoute(from: GeoPoint, to: GeoPoint, token: string): Promise<RouteResult> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Mapbox Directions failed with HTTP ${response.status}`);
  const data = (await response.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: number[][] } }[] };
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error("Mapbox returned no route");
  return {
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    polyline: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
  };
}

/** Straight-line (geodesic) fallback with interpolated points so the map still draws a route. */
export function geodesicRoute(from: GeoPoint, to: GeoPoint): RouteResult {
  const distanceMeters = Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng) * 1000);
  const durationSeconds = Math.round((distanceMeters / 1000 / AVG_DELIVERY_SPEED_KMH) * 3600);
  const steps = Math.max(2, Math.min(64, Math.floor(distanceMeters / 250)));
  const polyline: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    polyline.push([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
  }
  return { distanceMeters, durationSeconds, polyline };
}
