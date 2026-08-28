import { Router } from "express";
import { z } from "zod";
import { serviceability } from "../../utils/geo.js";
import { ApiError, asyncHandler, badRequest, ok } from "../../utils/errors.js";

const router = Router();

const coordsSchema = z.object({ lat: z.coerce.number().gte(-90).lte(90), lng: z.coerce.number().gte(-180).lte(180) });

/** Whether a coordinate falls inside the configured delivery area. */
router.get(
  "/serviceability",
  asyncHandler(async (request, response) => {
    const parsed = coordsSchema.safeParse(request.query);
    if (!parsed.success) throw badRequest("Valid latitude and longitude are required", "VALIDATION_ERROR");
    const result = await serviceability(parsed.data.lat, parsed.data.lng);
    return ok(response, {
      serviceable: result.serviceable,
      distanceKm: result.distanceKm,
      radiusKm: result.radiusKm,
      message: result.serviceable ? "Great, we deliver to this location" : "Sorry, we don't deliver here yet",
    });
  }),
);

// ---- Reverse geocoding ----
//
// Turns a coordinate into a human address + pincode so the location pickers can
// auto-fill after a GPS fix. Uses Google Maps Geocoding API when
// GOOGLE_MAPS_SERVER_KEY is set, falls back to Nominatim.
// The geocoder is only consulted on a cache miss and failures degrade to a
// clear 502 — the client always falls back to manual entry.

export interface ReverseGeocodeResult {
  address: string;
  pincode: string;
  city: string;
  state: string;
  locality: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const geocodeCache = new Map<string, { result: ReverseGeocodeResult; at: number }>();

/** Pointed at Nominatim by default; overridable so tests can simulate outages. */
const nominatimBaseUrl = () => process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = geocodeCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  // Try Google Maps Geocoding API first (uses dedicated geocoding key)
  const googleKey = (process.env.GOOGLE_MAPS_GEOCODING_KEY || process.env.GOOGLE_MAPS_SERVER_KEY)?.trim();
  if (googleKey) {
    try {
      const result = await googleReverseGeocode(lat, lng, googleKey);
      if (result) {
        cacheResult(key, result);
        return result;
      }
    } catch {
      /* fall through to Nominatim */
    }
  }

  // Fallback to Nominatim
  const result = await nominatimReverseGeocode(lat, lng);
  if (result) cacheResult(key, result);
  return result;
}

function cacheResult(key: string, result: ReverseGeocodeResult) {
  if (geocodeCache.size >= CACHE_MAX_ENTRIES) geocodeCache.clear();
  geocodeCache.set(key, { result, at: Date.now() });
}

/** Google Maps Geocoding API — reverse geocode. */
async function googleReverseGeocode(lat: number, lng: number, key: string): Promise<ReverseGeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}&result_type=street_address|locality|sublocality`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) return null;

  const data = (await response.json()) as { status: string; results?: { formatted_address?: string; address_components?: { long_name: string; short_name: string; types: string[] }[] }[] };
  if (data.status !== "OK" || !data.results?.length) return null;

  const result = data.results[0];
  const components = result.address_components ?? [];

  function component(types: string[]): string {
    const match = components.find((c) => c.types.some((t) => types.includes(t)));
    return match?.long_name ?? "";
  }

  const pincode = component(["postal_code"]);
  const city = component(["locality", "administrative_area_level_2", "sublocality"]);
  const state = component(["administrative_area_level_1"]);
  const locality = component(["route", "sublocality_level_1", "neighborhood"]);

  return {
    address: result.formatted_address ?? "",
    pincode,
    city,
    state,
    locality,
  };
}

/** Nominatim reverse geocode (original fallback). */
async function nominatimReverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `${nominatimBaseUrl()}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
  let data: any;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "RamnagarEats/1.0 (hyperlocal food delivery; contact via app)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    data = await response.json();
  } catch {
    return null;
  }

  const address = data?.address ?? {};
  return {
    address: typeof data?.display_name === "string" ? data.display_name : "",
    pincode: typeof address.postcode === "string" ? address.postcode : "",
    city: address.city ?? address.town ?? address.village ?? address.county ?? "",
    state: typeof address.state === "string" ? address.state : "",
    locality: address.road ?? address.neighbourhood ?? address.suburb ?? address.residential ?? "",
  };
}

router.post(
  "/reverse-geocode",
  asyncHandler(async (request, response) => {
    const parsed = coordsSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Valid latitude and longitude are required", "VALIDATION_ERROR");
    const result = await reverseGeocode(parsed.data.lat, parsed.data.lng);
    if (!result) {
      throw new ApiError(502, "Could not determine the address for this location. Enter the pincode manually.", "GEOCODE_FAILED");
    }
    return ok(response, { ...result });
  }),
);

export default router;
