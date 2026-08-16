import { ServiceArea } from "../models/ServiceArea.js";

export interface ServiceAreaConfig {
  lat: number;
  lng: number;
  address: string;
  pincode: string;
  radiusKm: number;
}

let cached: { value: ServiceAreaConfig; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** Env defaults are only a fallback for first boot before the admin config exists. */
function envDefaults(): ServiceAreaConfig {
  return {
    lat: Number(process.env.SERVICE_CENTER_LAT ?? 19.076),
    lng: Number(process.env.SERVICE_CENTER_LNG ?? 72.8777),
    address: "",
    pincode: "",
    radiusKm: Number(process.env.SERVICE_RADIUS_KM ?? 10),
  };
}

/** Current delivery area, cached briefly so hot paths don't hit the DB every request. */
export async function getServiceArea(): Promise<ServiceAreaConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const doc = await ServiceArea.findOne({ key: "default" }).lean();
  const value = doc ? { lat: doc.lat, lng: doc.lng, address: doc.address ?? "", pincode: doc.pincode ?? "", radiusKm: doc.radiusKm } : envDefaults();
  cached = { value, at: Date.now() };
  return value;
}

export async function updateServiceArea(input: ServiceAreaConfig, updatedBy: string): Promise<ServiceAreaConfig> {
  const doc = await ServiceArea.findOneAndUpdate(
    { key: "default" },
    { $set: { ...input, updatedBy } },
    { upsert: true, new: true, runValidators: true },
  );
  const value = { lat: doc.lat, lng: doc.lng, address: doc.address ?? "", pincode: doc.pincode ?? "", radiusKm: doc.radiusKm };
  cached = { value, at: Date.now() };
  return value;
}

export function invalidateServiceAreaCache() {
  cached = null;
}
