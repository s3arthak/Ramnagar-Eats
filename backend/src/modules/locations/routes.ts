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
// auto-fill after a GPS fix. Backed by OpenStreetMap's Nominatim — the only
// geocoder this app depends on, so no map credentials are needed anywhere.
//
// It is consulted on a cache miss and only when a user moves a pin (never on
// rider GPS updates). Calls are spaced to stay inside the Nominatim usage
// policy, and failures degrade to a clear 502 so the client always falls back to
// manual entry.

export interface ReverseGeocodeResult {
  address: string;
  pincode: string;
  city: string;
  state: string;
  locality: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
/** Nominatim's usage policy allows at most one request per second. */
const NOMINATIM_MIN_INTERVAL_MS = 1000;
const geocodeCache = new Map<string, { result: ReverseGeocodeResult; at: number }>();
let nextNominatimSlot = 0;

/** Pointed at Nominatim by default; overridable so tests can simulate outages. */
const nominatimBaseUrl = () => process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = geocodeCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const result = await nominatimReverseGeocode(lat, lng);
  if (result) cacheResult(key, result);
  return result;
}

function cacheResult(key: string, result: ReverseGeocodeResult) {
  if (geocodeCache.size >= CACHE_MAX_ENTRIES) geocodeCache.clear();
  geocodeCache.set(key, { result, at: Date.now() });
}

/** Space out Nominatim calls so concurrent pin moves can't exceed the 1 req/s limit. */
async function awaitNominatimSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextNominatimSlot);
  nextNominatimSlot = slot + NOMINATIM_MIN_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

/** Nominatim (OpenStreetMap) reverse geocode. */
async function nominatimReverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `${nominatimBaseUrl()}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
  await awaitNominatimSlot();
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
