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

/** Road route via Google Maps Routes API when GOOGLE_MAPS_SERVER_KEY is set; geodesic fallback otherwise. */
export async function getRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (key) {
    try {
      return await googleRoutesApi(from, to, key);
    } catch {
      /* route API unavailable — fall through to the fallback so the UI never breaks */
    }
  }
  return geodesicRoute(from, to);
}

/**
 * Google Maps Routes API — Compute Routes Essentials.
 * https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
 */
async function googleRoutesApi(from: GeoPoint, to: GeoPoint, key: string): Promise<RouteResult> {
  const url = `https://routes.googleapis.com/directions/v2:computeRoutes?key=${encodeURIComponent(key)}`;
  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: "DRIVE" as const,
    routingPreference: "TRAFFIC_AWARE" as const,
    polylineQuality: "HIGH_QUALITY" as const,
    polylineEncoding: "ENCODED_POLYLINE" as const,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Routes API failed with HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    routes?: {
      distanceMeters?: number;
      duration?: string; // e.g. "1234s"
      polyline?: { encodedPolyline?: string };
    }[];
  };

  const route = data.routes?.[0];
  if (!route) throw new Error("Google Routes API returned no routes");

  const distanceMeters = route.distanceMeters ?? 0;
  const durationSeconds = route.duration ? parseInt(route.duration.replace("s", ""), 10) : 0;

  // Decode the polyline
  const polyline = route.polyline?.encodedPolyline
    ? decodeGooglePolyline(route.polyline.encodedPolyline)
    : geodesicRoute(from, to).polyline;

  return { distanceMeters, durationSeconds, polyline };
}

/**
 * Decode a Google-encoded polyline string into [lat, lng] pairs.
 * Uses the standard Google Polyline Encoding Algorithm.
 */
function decodeGooglePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    // Longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/** Straight-line (geodesic) fallback with interpolated points so the map still draws a route. */
function geodesicRoute(from: GeoPoint, to: GeoPoint): RouteResult {
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
